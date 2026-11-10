'use strict';
// Online layer over a public MQTT relay: presence, friends, invites, cloud save and match rooms.
const Net = (() => {
  // One broker only: a fallback would split friends across two relays that cannot see each other.
  const BROKERS = ['wss://broker.hivemq.com:8884/mqtt'];
  const B = 'echofront-hpuav/v1';
  let client = null, connected = false, brokerIdx = 0, everConnected = false, connectMs = 0;
  let myStatus = 'online', currentRoom = '';
  const subs = []; // {topic, fn}
  const presence = {}; // uid -> presence data
  const incoming = {}; // uid -> request
  const ev = {}; // event name -> Set(fn)
  const on = (name, fn) => { (ev[name] || (ev[name] = new Set())).add(fn); return () => ev[name].delete(fn); };
  const emit = (name, ...a) => { if (ev[name]) ev[name].forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); };
  const me = () => Profile.p.uid;

  function match(pattern, topic) {
    const p = pattern.split('/'), t = topic.split('/');
    for (let i = 0; i < p.length; i++) {
      if (p[i] === '#') return true;
      if (p[i] !== '+' && p[i] !== t[i]) return false;
    }
    return p.length === t.length;
  }

  function presencePayload(st) {
    const p = Profile.p;
    return { n: p.name || 'Pilot', lv: p.level, tr: p.trophies, st, ls: Date.now(), lt: p.lastTerminated || 0, rm: currentRoom, md: Room.info ? Room.info.mode : '', sk: p.equip.skin };
  }

  function connect() {
    if (typeof mqtt === 'undefined') { emit('status', false); return; }
    if (client) { try { client.end(true); } catch (e) { /* ignore */ } }
    const url = BROKERS[brokerIdx];
    // The will goes to its own topic so a dropped socket can never overwrite a "terminated" status.
    const will = { topic: `${B}/w/${me()}`, payload: '1', qos: 1, retain: true };
    client = mqtt.connect(url, { clientId: 'ef_' + me() + '_' + U.code(4), keepalive: 20, reconnectPeriod: 3000, connectTimeout: 8000, will, clean: true });
    const t0 = Date.now();
    client.on('connect', () => {
      connected = true; everConnected = true; connectMs = Date.now() - t0;
      const topics = [...new Set(subs.map((s) => s.topic))];
      if (topics.length) client.subscribe(topics, { qos: 0 });
      pub(`w/${me()}`, null, { retain: true, qos: 1 });
      publishPresence();
      emit('status', true);
    });
    client.on('close', () => { if (connected) { connected = false; emit('status', false); } });
    client.on('offline', () => { connected = false; emit('status', false); });
    client.on('error', () => { /* reconnect handles it */ });
    client.on('message', (topic, payload, packet) => {
      let data = null;
      const s = payload.toString();
      if (s) { try { data = JSON.parse(s); } catch (e) { return; } }
      for (const sb of subs.slice()) if (match(sb.topic, topic)) sb.fn(data, topic, packet);
    });
  }

  function sub(suffix, fn) {
    const topic = `${B}/${suffix}`;
    const h = { topic, fn };
    const already = subs.some((s) => s.topic === topic);
    subs.push(h);
    if (client && connected && !already) client.subscribe(topic, { qos: 0 });
    return h;
  }
  function unsub(h) {
    const i = subs.indexOf(h); if (i < 0) return;
    subs.splice(i, 1);
    if (client && connected && !subs.some((s) => s.topic === h.topic)) client.unsubscribe(h.topic);
  }
  function pub(suffix, obj, opts, cb) {
    if (!client || !connected) { if (cb) cb(new Error('offline')); return false; }
    opts = opts || {};
    client.publish(`${B}/${suffix}`, obj == null ? '' : JSON.stringify(obj), { qos: opts.qos || 0, retain: !!opts.retain }, cb);
    return true;
  }

  // ---------- presence ----------
  function publishPresence() { pub(`p/${me()}`, presencePayload(myStatus), { retain: true, qos: 1 }); }
  function setStatus(st) { if (myStatus === st) return; myStatus = st; publishPresence(); }
  setInterval(() => { if (connected) publishPresence(); }, 25000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setStatus('away'); else setStatus(Room.inGame ? 'playing' : 'online');
  });

  // Effective status a friend should see
  function friendState(uid) {
    const d = presence[uid];
    if (!d) return { key: 'unknown', label: 'No signal yet', d: null };
    const fresh = Date.now() - (d.ls || 0) < 75000;
    if (d.st === 'terminated') return { key: 'terminated', label: 'Terminated ' + U.ago(d.lt), d };
    if (!fresh || d.st === 'offline' || dropped[uid]) return { key: 'offline', label: 'Offline · seen ' + U.ago(d.ls), d };
    if (d.st === 'playing') return { key: 'playing', label: 'In a match' + (d.md && MODES[d.md] ? ' · ' + MODES[d.md].name : ''), d };
    if (d.st === 'away') return { key: 'away', label: 'Away (tab hidden)', d };
    return { key: 'online', label: d.rm ? 'Online · in lobby ' + d.rm : 'Online', d };
  }

  function terminate() {
    const p = Profile.p;
    const now = Date.now();
    p.lastTerminated = now; p.stats.terminations = (p.stats.terminations || 0) + 1;
    U.store.set('profile', p);
    try { if (Room.code) Room.leave(true); } catch (e) { /* ignore */ }
    const done = () => {
      try { client && client.end(false); } catch (e) { /* ignore */ }
      window.close();
      // Browsers only let scripts close tabs they opened. Fall back to a blank page that replaces this one in history.
      setTimeout(() => { try { location.replace('about:blank'); } catch (e) { document.body.innerHTML = ''; } }, 30);
    };
    const payload = presencePayload('terminated'); payload.lt = now;
    if (client && connected) {
      let fired = false;
      const fin = () => { if (!fired) { fired = true; done(); } };
      client.publish(`${B}/p/${me()}`, JSON.stringify(payload), { qos: 1, retain: true }, fin);
      setTimeout(fin, 350);
    } else done();
  }

  // ---------- friends ----------
  const friendSubs = {}, dropped = {};
  function watchFriend(uid) {
    if (friendSubs[uid]) return;
    sub(`w/${uid}`, (d) => {
      const before = friendState(uid).key;
      dropped[uid] = !!d;
      const after = friendState(uid).key;
      if (before !== after) emit('friendStatus', uid, before, after);
      emit('friends');
    });
    friendSubs[uid] = sub(`p/${uid}`, (d) => {
      const before = friendState(uid).key;
      if (d) presence[uid] = d; else delete presence[uid];
      const f = Profile.p.friends[uid];
      if (f && d && d.n && f.name !== d.n) { f.name = d.n; Profile.save(false); }
      const after = friendState(uid).key;
      if (before !== after) emit('friendStatus', uid, before, after);
      emit('friends');
    });
  }
  function initFriends() {
    for (const uid in Profile.p.friends) watchFriend(uid);
    sub(`fr/${me()}/+`, (d, topic) => {
      const from = topic.split('/').pop();
      if (!d) { delete incoming[from]; emit('friends'); return; }
      if (Profile.p.friends[from]) { pub(`fr/${me()}/${from}`, null, { retain: true }); return; }
      const isNew = !incoming[from];
      incoming[from] = d; emit('friends');
      if (isNew) emit('request', from, d);
    });
    sub(`fa/${me()}/+`, (d, topic) => {
      const from = topic.split('/').pop();
      if (!d) return;
      if (!Profile.p.friends[from]) {
        Profile.p.friends[from] = { name: d.n || 'Pilot', since: Date.now() };
        delete (Profile.p.pendingOut || {})[from];
        Profile.save(); watchFriend(from); emit('accepted', from, d);
      }
      pub(`fa/${me()}/${from}`, null, { retain: true });
      emit('friends');
    });
    sub(`fx/${me()}/+`, (d, topic) => {
      const from = topic.split('/').pop();
      if (!d) return;
      if (Profile.p.friends[from]) { delete Profile.p.friends[from]; Profile.save(); }
      pub(`fx/${me()}/${from}`, null, { retain: true });
      emit('friends');
    });
    sub(`inv/${me()}`, (d) => { if (d && d.from && Date.now() - (d.ts || 0) < 60000) emit('invite', d); });
  }
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function addFriend(code) {
    const uid = normCode(code);
    if (uid.length !== 8) return 'Friend codes are 8 characters, like ABCD-1234.';
    if (uid === me()) return 'That is your own code.';
    if (Profile.p.friends[uid]) return 'You are already friends.';
    if (!connected) return 'Not connected. Check your internet and try again.';
    if (incoming[uid]) { accept(uid); return null; }
    pub(`fr/${uid}/${me()}`, { n: Profile.p.name, lv: Profile.p.level, ts: Date.now() }, { retain: true, qos: 1 });
    Profile.p.pendingOut = Profile.p.pendingOut || {};
    Profile.p.pendingOut[uid] = Date.now(); Profile.save();
    watchFriend(uid);
    return null;
  }
  function accept(uid) {
    const r = incoming[uid] || {};
    Profile.p.friends[uid] = { name: r.n || 'Pilot', since: Date.now() };
    Profile.save();
    pub(`fa/${uid}/${me()}`, { n: Profile.p.name, ts: Date.now() }, { retain: true, qos: 1 });
    pub(`fr/${me()}/${uid}`, null, { retain: true });
    delete incoming[uid]; watchFriend(uid); emit('friends');
  }
  function decline(uid) { pub(`fr/${me()}/${uid}`, null, { retain: true }); delete incoming[uid]; emit('friends'); }
  function cancelOut(uid) {
    pub(`fr/${uid}/${me()}`, null, { retain: true });
    if (Profile.p.pendingOut) delete Profile.p.pendingOut[uid];
    Profile.save(); emit('friends');
  }
  function removeFriend(uid) {
    delete Profile.p.friends[uid]; Profile.save();
    pub(`fx/${uid}/${me()}`, { ts: Date.now() }, { retain: true, qos: 1 });
    if (friendSubs[uid]) { unsub(friendSubs[uid]); delete friendSubs[uid]; }
    emit('friends');
  }
  function invite(uid) {
    if (!Room.code) return false;
    return pub(`inv/${uid}`, { from: me(), n: Profile.p.name, room: Room.code, mode: Room.info.mode, ts: Date.now() });
  }

  // ---------- cloud save ----------
  function saveCloud(p) { pub(`s/${p.key}`, p, { retain: true, qos: 1 }); }
  function loadCloud(key) {
    return new Promise((res) => {
      if (!connected) return res(null);
      let h = null;
      const t = setTimeout(() => { if (h) unsub(h); res(null); }, 4000);
      h = sub(`s/${key}`, (d) => { clearTimeout(t); unsub(h); res(d); });
    });
  }

  // ---------- rooms ----------
  const Room = {
    code: '', isHost: false, hostId: '', info: null, players: {}, inGame: false, mh: null, lastHost: 0,
    onGame: null, // set by Game for in-match packets
    myInfo() {
      const lo = Profile.loadout();
      return { id: me(), name: Profile.p.name, skin: lo.skin, weapon: lo.weapon, wlv: lo.wlv, ability: lo.ability, hp: lo.hp, spd: lo.spd, cool: lo.cool, mag: lo.mag, lv: Profile.p.level };
    },
    create(opts) {
      this.leave();
      this.code = U.code(4); this.isHost = true; this.hostId = me();
      this.info = { mode: opts.mode || 'brawl', map: opts.map || 'foundry', diff: opts.diff || 'veteran', bots: opts.bots != null ? opts.bots : 3, pub: !!opts.pub, max: 8 };
      this.players = { [me()]: this.myInfo() };
      currentRoom = this.code; this._listen(); this.publishMeta(); publishPresence();
      this.hb = setInterval(() => { this.publishMeta(); this.send({ t: 'hb' }); }, 5000);
      emit('room');
      return this.code;
    },
    async join(code) {
      code = normCode(code).slice(0, 4);
      if (code.length !== 4) return 'Room codes are 4 characters.';
      if (!connected) return 'Not connected. Check your internet and try again.';
      this.leave();
      const meta = await new Promise((res) => {
        let h = null;
        const t = setTimeout(() => { unsub(h); res(null); }, 4000);
        h = sub(`r/${code}/meta`, (d) => { if (d) { clearTimeout(t); unsub(h); res(d); } });
      });
      if (!meta || Date.now() - meta.ts > 30000) return 'Room ' + code + ' was not found or has closed.';
      if (Object.keys(meta.players || {}).length >= (meta.info.max || 8)) return 'That room is full.';
      this.code = code; this.isHost = false; this.hostId = meta.host; this.info = meta.info; this.players = meta.players || {};
      this.players[me()] = this.myInfo();
      this.lastHost = Date.now();
      currentRoom = code; this._listen(); publishPresence();
      this.send({ t: 'hello', p: this.myInfo() });
      this.watch = setInterval(() => {
        this.send({ t: 'hb' });
        if (Date.now() - this.lastHost > 12000) { const c = this.code; this.leave(); emit('roomClosed', c, 'The host disconnected.'); }
      }, 4000);
      emit('room');
      if (meta.state === 'play' && meta.start) emit('start', meta.start, true);
      return null;
    },
    _listen() {
      this.mh = sub(`r/${this.code}/m`, (d) => {
        if (!d || d.f === me()) return;
        if (d.f === this.hostId) this.lastHost = Date.now();
        if (d.t === 'pk' || d.t === 'ev') { if (this.onGame) this.onGame(d); return; }
        this._lobbyMsg(d);
      });
    },
    _lobbyMsg(d) {
      if (d.t === 'hello' && d.p) {
        this.players[d.f] = d.p; this.players[d.f].seen = Date.now();
        if (this.isHost) { this.publishMeta(); if (this.inGame && this.onGame) this.onGame({ t: 'join', f: d.f, p: d.p }); }
        emit('room'); emit('peerJoin', d.p);
      } else if (d.t === 'hb') {
        if (this.players[d.f]) this.players[d.f].seen = Date.now();
      } else if (d.t === 'bye') {
        delete this.players[d.f];
        if (this.isHost) this.publishMeta();
        if (this.onGame) this.onGame({ t: 'leave', f: d.f });
        emit('room');
      } else if (d.t === 'close') {
        const c = this.code; this.leave(); emit('roomClosed', c, 'The host closed the room.');
      } else if (d.t === 'cfg' && d.f === this.hostId) {
        this.info = d.info; emit('room');
      } else if (d.t === 'start' && d.f === this.hostId) {
        emit('start', d.start, false);
      } else if (d.t === 'lobby' && d.f === this.hostId) {
        emit('backToLobby');
      }
    },
    publishMeta(startPayload) {
      if (!this.isHost) return;
      // Drop players that went silent
      for (const id in this.players) if (id !== me() && this.players[id].seen && Date.now() - this.players[id].seen > 15000) delete this.players[id];
      if (startPayload !== undefined) this._start = startPayload;
      const meta = { host: me(), hn: Profile.p.name, info: this.info, players: this.players, state: this.inGame ? 'play' : 'lobby', start: this.inGame ? this._start : null, ts: Date.now() };
      pub(`r/${this.code}/meta`, meta, { retain: true });
      if (this.info.pub) pub(`l/${this.code}`, { code: this.code, hn: Profile.p.name, mode: this.info.mode, map: this.info.map, n: Object.keys(this.players).length, max: this.info.max, st: meta.state, ts: Date.now() }, { retain: true });
    },
    setInfo(patch) {
      if (!this.isHost) return;
      const wasPub = this.info.pub;
      Object.assign(this.info, patch);
      if (wasPub && !this.info.pub) pub(`l/${this.code}`, null, { retain: true });
      this.publishMeta(); this.send({ t: 'cfg', info: this.info }); emit('room');
    },
    send(obj) { if (!this.code) return; obj.f = me(); pub(`r/${this.code}/m`, obj); },
    leave(silent) {
      if (!this.code) return;
      if (this.isHost) {
        this.send({ t: 'close' });
        pub(`r/${this.code}/meta`, null, { retain: true });
        pub(`l/${this.code}`, null, { retain: true });
      } else this.send({ t: 'bye' });
      if (this.mh) unsub(this.mh);
      clearInterval(this.hb); clearInterval(this.watch);
      this.code = ''; this.isHost = false; this.info = null; this.players = {}; this.inGame = false; this.mh = null;
      currentRoom = '';
      if (!silent) { publishPresence(); emit('room'); }
    },
    browse() {
      return new Promise((res) => {
        const found = {};
        const h = sub('l/+', (d, topic) => { const c = topic.split('/').pop(); if (d && Date.now() - d.ts < 20000) found[c] = d; else delete found[c]; });
        setTimeout(() => { unsub(h); res(Object.values(found).sort((a, b) => b.n - a.n)); }, 2200);
      });
    },
  };

  return {
    connect, on, sub, unsub, pub, setStatus, friendState, terminate, initFriends, addFriend, accept, decline, cancelOut, removeFriend, invite,
    saveCloud, loadCloud, Room,
    get connected() { return connected; }, get connectMs() { return connectMs; }, get incoming() { return incoming; }, get presence() { return presence; },
    publishPresence,
  };
})();
