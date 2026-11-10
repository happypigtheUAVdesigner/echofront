'use strict';
// Menus, shop, friends, missions, lobby and results.
const UI = (() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = U.esc;
  let route = 'play', armTab = 'weapons';
  const solo = { mode: 'survival', map: 'foundry', diff: 'veteran', bots: 5 };
  let confirmRemove = null, rooms = null, roomsLoading = false, bootT = Date.now();
  const P = () => Profile.p;

  // ---------- helpers ----------
  const coinSvg = '<svg class="ci" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l7 9-7 9-7-9z" fill="currentColor"/><path d="M10 5.5l3.5 4.5L10 14.5 6.5 10z" fill="rgba(0,0,0,.28)"/></svg>';
  const coins = (n) => `<span class="coins">${coinSvg}${U.fmt(n)}</span>`;
  const fcode = (c) => c.slice(0, 4) + '-' + c.slice(4);
  const shareBase = () => location.origin + location.pathname;
  function copy(text, label) {
    const done = () => toast((label || 'Copied') + ' to clipboard');
    try { navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); } catch (e) { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Select and copy: ' + text); }
    ta.remove();
  }
  function toast(msg, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'toast' + (opts.kind ? ' ' + opts.kind : '');
    el.innerHTML = `<div class="toast-msg">${msg}</div>` + (opts.action ? `<button class="btn sm ${opts.actionClass || 'primary'}">${esc(opts.action)}</button>` : '');
    if (opts.action) el.querySelector('button').onclick = () => { Sfx.play('click'); opts.onAction(); el.remove(); };
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), opts.ms || 3800);
    setTimeout(() => el.remove(), (opts.ms || 3800) + 400);
  }
  function modal(html, cls) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-card ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

  // ---------- top bar ----------
  function renderTop() {
    const p = P();
    const need = Profile.xpNeed(p.level);
    const rk = rankFor(p.trophies);
    $('#topbar').innerHTML = `
      <div class="tb-left">
        <div class="lvl" style="--p:${Math.round((p.xp / need) * 100)}" title="Level ${p.level}"><span>${p.level}</span></div>
        <div class="tb-id"><b>${esc(p.name || 'Pilot')}</b><small style="color:${rk.color}">${rk.name} · ${p.trophies} 🏆</small></div>
      </div>
      <div class="tb-right">
        <button class="pill cache-pill" data-act="open-cache" ${p.caches ? '' : 'disabled'} aria-label="Open Rift Cache"><img src="${Art.cacheIcon()}" alt="">${p.caches}</button>
        <div class="pill">${coins(p.coins)}</div>
        <span class="net-dot ${Net.connected ? 'on' : ''}" title="${Net.connected ? 'Online' : 'Connecting…'}"></span>
      </div>`;
    const n = Profile.claimableCount();
    const badge = $('#tabs [data-r="missions"] .badge');
    if (badge) { badge.textContent = n; badge.hidden = !n; }
    const fr = Object.keys(Net.incoming).length;
    const fb = $('#tabs [data-r="friends"] .badge');
    if (fb) { fb.textContent = fr; fb.hidden = !fr; }
  }

  // ---------- screens ----------
  function go(r) { route = r; confirmRemove = null; render(); window.scrollTo(0, 0); }
  function render() {
    renderTop();
    document.querySelectorAll('#tabs [data-r]').forEach((b) => b.classList.toggle('on', b.dataset.r === route || (route === 'lobby' && b.dataset.r === 'online')));
    const s = $('#screen');
    const v = { play: vPlay, online: vOnline, lobby: vLobby, armory: vArmory, friends: vFriends, missions: vMissions, profile: vProfile }[route] || vPlay;
    s.innerHTML = v();
    s.dataset.route = route;
  }

  function vPlay() {
    const p = P(), lo = Profile.loadout();
    const daily = !p.login.claimedToday ? `
      <button class="daily" data-act="claim-login">
        <span class="daily-k">Daily drop · day ${(p.login.streak % 7) + 1} of 7</span>
        <b>${DAILY_REWARDS[p.login.streak % 7] === 'cache' ? 'Rift Cache' : DAILY_REWARDS[p.login.streak % 7] + ' coins'}</b>
        <span class="btn sm gold">Claim</span>
      </button>` : '';
    return `
      <section class="hero">
        <div class="hero-text">
          <h1 class="logo" data-text="ECHOFRONT">ECHOFRONT</h1>
          <p class="tagline">Ricochet arena shooter. Every bounce hits harder, and your past self fights beside you.</p>
          <div class="hero-cta">
            <button class="btn primary xl" data-act="quick-solo">Quick Play<small>${MODES[solo.mode].name} · solo</small></button>
            <button class="btn ghost xl" data-act="tab" data-r="online">Play Online<small>${Net.connected ? 'friends & rooms' : 'connecting…'}</small></button>
          </div>
          ${daily}
        </div>
        <div class="hangar">
          <img src="${Art.shipIcon(lo.skin, lo.weapon, 240)}" alt="Your ship">
          <div class="hangar-tags"><span>${WEAPONS[lo.weapon].name} <em>Lv ${lo.wlv}</em></span><span>${ABILITIES[lo.ability].name}</span><span>${lo.hp} HP</span></div>
          <button class="btn sm ghost" data-act="tab" data-r="armory">Upgrade loadout</button>
        </div>
      </section>
      <h2 class="sec">Game modes <small>${MODE_ORDER.length} ways to play · tap one to set it up</small></h2>
      <div class="modes">
        ${MODE_ORDER.map((id) => { const m = MODES[id]; return `
          <button class="mode" data-act="mode" data-id="${id}" style="--mc:${m.color}">
            <img src="${Art.modeIcon(m.icon, m.color)}" alt="">
            <span class="mode-tag">${m.tag}</span>
            <b>${m.name}</b>
            <span class="mode-desc">${m.desc}</span>
          </button>`; }).join('')}
      </div>
      <h2 class="sec">How Echofront plays</h2>
      <div class="howto">
        <div><b>Bank shots</b><span>Bullets ricochet off walls. Each bounce adds +25% damage, and the kill feed marks bank kills.</span></div>
        <div><b>Echo</b><span>Your Echo replays your last 3 seconds, firing every shot again. Plan a burst, then double it.</span></div>
        <div><b>Heat & Vent</b><span>No ammo. Fire builds heat; at 100 you lock up. Vent above 45 heat for a shockwave that scales with heat.</span></div>
        <div><b>Rift wells</b><span>Gravity wells bend every bullet that passes near. Curve shots around cover.</span></div>
      </div>
      <p class="controls-note">Phone: left thumb moves, right thumb aims and fires (tap right side for auto-aim). Keyboard: WASD, mouse to aim, Space dash, E ability, Q vent.</p>`;
  }

  function soloModal() {
    const m = MODES[solo.mode];
    const vs = m.rules !== 'pve';
    modal(`
      <div class="mh" style="--mc:${m.color}"><img src="${Art.modeIcon(m.icon, m.color)}" alt=""><div><h3>${m.name}</h3><p>${m.desc}</p></div></div>
      <div class="field"><label>Arena</label><div class="chips">${MAP_ORDER.map((id) => `<button class="chip ${solo.map === id ? 'on' : ''}" data-act="solo-set" data-k="map" data-v="${id}">${MAPS[id].name}</button>`).join('')}</div></div>
      <div class="field"><label>Bot difficulty</label><div class="chips">${Object.keys(DIFFS).map((id) => `<button class="chip ${solo.diff === id ? 'on' : ''}" data-act="solo-set" data-k="diff" data-v="${id}">${DIFFS[id].name} <em>×${DIFFS[id].coin} coins</em></button>`).join('')}</div></div>
      ${vs ? `<div class="field"><label>Bots <output>${solo.bots}</output></label><input type="range" id="soloBots" min="${m.rules === 'teams' ? 1 : 1}" max="7" value="${solo.bots}" data-input="solo-bots"></div>` : '<p class="hint">Waves scale with difficulty. Coins drop from every kill; bosses drop 300.</p>'}
      <div class="row end"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="solo-start">Deploy</button></div>`);
  }

  function vOnline() {
    const R = Net.Room;
    if (R.code) { route = 'lobby'; return vLobby(); }
    const fr = Object.keys(P().friends).map((id) => ({ id, s: Net.friendState(id), f: P().friends[id] }));
    const joinable = fr.filter((x) => x.s.d && x.s.d.rm && (x.s.key === 'online' || x.s.key === 'playing' || x.s.key === 'away'));
    return `
      <h2 class="sec">Play online <small>${Net.connected ? '<span class="ok">Connected to the relay</span>' : '<span class="warn">Connecting… check your internet</span>'}</small></h2>
      <div class="grid2">
        <div class="card">
          <h3>Quick match</h3>
          <p class="hint">Jump into the busiest public room, or open one that others can find. Bots fill empty slots.</p>
          <button class="btn primary wide" data-act="online-quick" ${Net.connected ? '' : 'disabled'}>Find a match</button>
        </div>
        <div class="card">
          <h3>Join with a code</h3>
          <p class="hint">Ask the host for their 4-letter room code.</p>
          <div class="row"><input id="joinCode" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters"><button class="btn primary" data-act="online-join" ${Net.connected ? '' : 'disabled'}>Join</button></div>
        </div>
      </div>
      ${joinable.length ? `<h2 class="sec">Friends in rooms</h2><div class="list">${joinable.map((x) => `
        <div class="li"><span class="dot ${x.s.key}"></span><div class="li-main"><b>${esc(x.f.name)}</b><small>${esc(x.s.label)}</small></div><button class="btn sm primary" data-act="join-room" data-code="${esc(x.s.d.rm)}">Join ${esc(x.s.d.rm)}</button></div>`).join('')}</div>` : ''}
      <div class="card">
        <h3>Host a room</h3>
        <div class="field"><label>Mode</label><div class="chips">${MODE_ORDER.map((id) => `<button class="chip ${solo.mode === id ? 'on' : ''}" data-act="solo-set" data-k="mode" data-v="${id}" data-rr="1">${MODES[id].name}</button>`).join('')}</div></div>
        <div class="field"><label>Arena</label><div class="chips">${MAP_ORDER.map((id) => `<button class="chip ${solo.map === id ? 'on' : ''}" data-act="solo-set" data-k="map" data-v="${id}" data-rr="1">${MAPS[id].name}</button>`).join('')}</div></div>
        <div class="row end"><label class="check"><input type="checkbox" id="roomPub" checked> List publicly</label><button class="btn primary" data-act="online-create" ${Net.connected ? '' : 'disabled'}>Create room</button></div>
      </div>
      <h2 class="sec">Open rooms <button class="btn sm ghost" data-act="online-refresh">${roomsLoading ? 'Scanning…' : 'Refresh'}</button></h2>
      <div class="list">${rooms == null ? '<p class="hint">Tap Refresh to scan for public rooms.</p>' : rooms.length ? rooms.map((r) => `
        <div class="li"><img class="li-ic" src="${Art.modeIcon(MODES[r.mode].icon, MODES[r.mode].color)}" alt=""><div class="li-main"><b>${esc(r.hn)}'s room · ${esc(r.code)}</b><small>${MODES[r.mode].name} · ${MAPS[r.map] ? MAPS[r.map].name : ''} · ${r.n}/${r.max} pilots${r.st === 'play' ? ' · in progress' : ''}</small></div><button class="btn sm primary" data-act="join-room" data-code="${esc(r.code)}">Join</button></div>`).join('') : '<p class="hint">No public rooms right now. Create one and share the code.</p>'}</div>`;
  }

  function vLobby() {
    const R = Net.Room;
    if (!R.code) { route = 'online'; return vOnline(); }
    const info = R.info, m = MODES[info.mode];
    const players = Object.values(R.players);
    const onlineFriends = Object.keys(P().friends).filter((id) => ['online', 'away'].includes(Net.friendState(id).key) && !R.players[id]);
    const hostCtl = R.isHost;
    return `
      <div class="lobby-head">
        <div><span class="eyebrow">Room code</span><div class="room-code">${esc(R.code)}</div></div>
        <div class="row"><button class="btn sm ghost" data-act="copy" data-text="${esc(shareBase() + '?room=' + R.code)}">Copy invite link</button><button class="btn sm danger" data-act="lobby-leave">Leave</button></div>
      </div>
      <div class="grid2">
        <div class="card">
          <h3>Pilots <small>${players.length}/${info.max}${info.bots && m.rules !== 'pve' ? ' + ' + info.bots + ' bots' : ''}</small></h3>
          <div class="list">${players.map((pl) => `
            <div class="li"><img class="li-ship" src="${Art.shipIcon(pl.skin || 'ion', pl.weapon || 'pulse', 80)}" alt=""><div class="li-main"><b>${esc(pl.name)}${pl.id === R.hostId ? ' <em class="tag">host</em>' : ''}${pl.id === P().uid ? ' <em class="tag you">you</em>' : ''}</b><small>Lv ${pl.lv || 1} · ${WEAPONS[pl.weapon] ? WEAPONS[pl.weapon].name : ''} Lv ${pl.wlv || 1} · ${ABILITIES[pl.ability] ? ABILITIES[pl.ability].name : ''}</small></div></div>`).join('')}</div>
        </div>
        <div class="card">
          <h3>Match</h3>
          <div class="field"><label>Mode</label><div class="chips">${MODE_ORDER.map((id) => `<button class="chip ${info.mode === id ? 'on' : ''}" ${hostCtl ? `data-act="lobby-set" data-k="mode" data-v="${id}"` : 'disabled'}>${MODES[id].name}</button>`).join('')}</div></div>
          <div class="field"><label>Arena</label><div class="chips">${MAP_ORDER.map((id) => `<button class="chip ${info.map === id ? 'on' : ''}" ${hostCtl ? `data-act="lobby-set" data-k="map" data-v="${id}"` : 'disabled'}>${MAPS[id].name}</button>`).join('')}</div></div>
          <div class="field"><label>Bots</label><div class="chips">${Object.keys(DIFFS).map((id) => `<button class="chip ${info.diff === id ? 'on' : ''}" ${hostCtl ? `data-act="lobby-set" data-k="diff" data-v="${id}"` : 'disabled'}>${DIFFS[id].name}</button>`).join('')}</div></div>
          ${m.rules !== 'pve' ? `<div class="field"><label>Bot count <output>${info.bots}</output></label><div class="chips">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<button class="chip ${info.bots === n ? 'on' : ''}" ${hostCtl ? `data-act="lobby-set" data-k="bots" data-v="${n}"` : 'disabled'}>${n}</button>`).join('')}</div></div>` : ''}
          ${hostCtl ? `<button class="btn primary wide" data-act="lobby-start">Start match</button>` : `<p class="hint pulse">Waiting for the host to start…</p>`}
        </div>
      </div>
      <div class="card">
        <h3>Invite friends</h3>
        ${onlineFriends.length ? `<div class="list">${onlineFriends.map((id) => `<div class="li"><span class="dot ${Net.friendState(id).key}"></span><div class="li-main"><b>${esc(P().friends[id].name)}</b><small>${esc(Net.friendState(id).label)}</small></div><button class="btn sm primary" data-act="friend-invite" data-uid="${id}">Invite</button></div>`).join('')}</div>` : '<p class="hint">No friends online right now. Share the invite link or the room code instead.</p>'}
      </div>`;
  }

  function bar(label, v, max) {
    return `<div class="stat"><span>${label}</span><i style="--w:${Math.round(U.clamp(v / max, 0.04, 1) * 100)}%"></i></div>`;
  }
  function vArmory() {
    const p = P();
    const tabs = [['weapons', 'Weapons'], ['abilities', 'Abilities'], ['upgrades', 'Upgrades'], ['cores', 'Cores']];
    let body = '';
    if (armTab === 'weapons') {
      body = WEAPON_ORDER.map((id) => {
        const w = WEAPONS[id], lv = p.owned.weapons[id], eq = p.equip.weapon === id;
        const dps = (w.dmg * w.n) / w.cd;
        let act;
        if (!lv) act = `<button class="btn ${p.coins >= w.price ? 'gold' : 'locked'}" data-act="buy-weapon" data-id="${id}">Buy ${coins(w.price)}</button>`;
        else {
          act = (eq ? '<span class="eq">Equipped</span>' : `<button class="btn ghost" data-act="equip-weapon" data-id="${id}">Equip</button>`) +
            (lv < MAX_WLV ? `<button class="btn ${p.coins >= weaponLevelCost(id, lv) ? 'primary' : 'locked'}" data-act="up-weapon" data-id="${id}">Lv ${lv + 1} ${coins(weaponLevelCost(id, lv))}</button>` : '<span class="eq max">Max level</span>');
        }
        return `<div class="item ${eq ? 'equipped' : ''} ${lv ? '' : 'unowned'}" style="--ic:${w.color}">
          <div class="item-top"><img src="${Art.weaponIcon(id)}" alt=""><div><b>${w.name}</b><small>Tier ${w.tier}${lv ? ' · Lv ' + lv + ' (+' + Math.round((weaponDmgMul(lv) - 1) * 100) + '% dmg)' : ''}</small></div></div>
          <p>${w.desc}</p>
          <div class="stats">${bar('Damage', w.dmg * w.n, 60)}${bar('Fire rate', 1 / w.cd, 13)}${bar('DPS', dps, 160)}${bar('Bounces', w.bounce, 4)}${bar('Heat', w.heat, 40)}</div>
          <div class="item-act">${act}</div></div>`;
      }).join('');
    } else if (armTab === 'abilities') {
      body = ABILITY_ORDER.map((id) => {
        const a = ABILITIES[id], own = p.owned.abilities[id], eq = p.equip.ability === id;
        const act = !own ? `<button class="btn ${p.coins >= a.price ? 'gold' : 'locked'}" data-act="buy-ab" data-id="${id}">Buy ${coins(a.price)}</button>` : eq ? '<span class="eq">Equipped</span>' : `<button class="btn ghost" data-act="equip-ab" data-id="${id}">Equip</button>`;
        return `<div class="item ${eq ? 'equipped' : ''} ${own ? '' : 'unowned'}"><div class="item-top"><img src="${Art.abilityIcon(id)}" alt=""><div><b>${a.name}</b><small>${a.cd}s cooldown</small></div></div><p>${a.desc}</p><div class="item-act">${act}</div></div>`;
      }).join('');
    } else if (armTab === 'upgrades') {
      body = UPGRADE_ORDER.map((id) => {
        const u = UPGRADES[id], lv = p.upgrades[id];
        const cost = UPGRADE_COST[lv];
        const pips = Array.from({ length: MAX_ULV }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        const act = lv >= MAX_ULV ? '<span class="eq max">Maxed</span>' : `<button class="btn ${p.coins >= cost ? 'primary' : 'locked'}" data-act="up-upg" data-id="${id}">Upgrade ${coins(cost)}</button>`;
        return `<div class="item"><div class="item-top"><img src="${Art.upgradeIcon(id)}" alt=""><div><b>${u.name}</b><small>Level ${lv} / ${MAX_ULV}</small></div></div><p>${u.desc}</p><div class="pips">${pips}</div><div class="item-act">${act}</div></div>`;
      }).join('');
    } else {
      body = SKIN_ORDER.map((id) => {
        const s = SKINS[id], own = p.owned.skins[id], eq = p.equip.skin === id;
        const locked = p.level < s.lv;
        const act = own ? (eq ? '<span class="eq">Equipped</span>' : `<button class="btn ghost" data-act="equip-skin" data-id="${id}">Equip</button>`)
          : locked ? `<span class="eq lock">Unlocks at level ${s.lv}</span>` : `<button class="btn ${p.coins >= s.price ? 'gold' : 'locked'}" data-act="buy-skin" data-id="${id}">Buy ${coins(s.price)}</button>`;
        return `<div class="item core ${eq ? 'equipped' : ''} ${own ? '' : 'unowned'}"><img class="core-img" src="${Art.shipIcon(id, p.equip.weapon, 160)}" alt=""><b>${s.name}</b><small>${s.anim ? 'Animated core' : 'Core paint'}</small><div class="item-act">${act}</div></div>`;
      }).join('');
    }
    return `
      <h2 class="sec">Armory <small>Spend coins on stronger gear. Everything you own works in every mode, online too.</small></h2>
      <div class="seg">${tabs.map(([k, l]) => `<button class="${armTab === k ? 'on' : ''}" data-act="arm-tab" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="items ${armTab === 'cores' ? 'cores' : ''}">${body}</div>`;
  }

  function vFriends() {
    const p = P();
    const ids = Object.keys(p.friends);
    const order = { online: 0, playing: 1, away: 2, terminated: 3, offline: 4, unknown: 5 };
    ids.sort((a, b) => order[Net.friendState(a).key] - order[Net.friendState(b).key]);
    const inc = Object.entries(Net.incoming);
    const out = Object.keys(p.pendingOut || {}).filter((id) => !p.friends[id]);
    return `
      <h2 class="sec">Friends <small>${ids.filter((id) => ['online', 'playing', 'away'].includes(Net.friendState(id).key)).length} online · ${ids.length} total</small></h2>
      <div class="grid2">
        <div class="card me-code">
          <span class="eyebrow">Your friend code</span>
          <div class="fcode">${fcode(p.uid)}</div>
          <div class="row"><button class="btn sm ghost" data-act="copy" data-text="${fcode(p.uid)}">Copy code</button><button class="btn sm ghost" data-act="copy" data-text="${esc(shareBase() + '?add=' + p.uid)}">Copy add link</button></div>
        </div>
        <div class="card">
          <h3>Add a friend</h3>
          <div class="row"><input id="friendCode" maxlength="9" placeholder="ABCD-1234" autocomplete="off" autocapitalize="characters" value="${esc(pendingAdd || '')}"><button class="btn primary" data-act="friend-add">Send</button></div>
          <p class="hint">They accept on their Friends tab. Requests wait until they open the game.</p>
        </div>
      </div>
      ${inc.length ? `<h2 class="sec">Requests</h2><div class="list">${inc.map(([id, r]) => `
        <div class="li"><span class="dot online"></span><div class="li-main"><b>${esc(r.n || 'Pilot')}</b><small>Level ${r.lv || 1} · ${fcode(id)}</small></div><button class="btn sm primary" data-act="friend-accept" data-uid="${id}">Accept</button><button class="btn sm ghost" data-act="friend-decline" data-uid="${id}">Decline</button></div>`).join('')}</div>` : ''}
      ${out.length ? `<h2 class="sec">Sent</h2><div class="list">${out.map((id) => { const d = Net.presence[id]; return `
        <div class="li"><span class="dot unknown"></span><div class="li-main"><b>${esc(d && d.n ? d.n : fcode(id))}</b><small>Waiting for them to accept</small></div><button class="btn sm ghost" data-act="friend-cancel" data-uid="${id}">Cancel</button></div>`; }).join('')}</div>` : ''}
      <h2 class="sec">Squad</h2>
      <div class="list">${ids.length ? ids.map((id) => {
        const s = Net.friendState(id), f = p.friends[id], d = s.d;
        const lt = d && d.lt ? `<small class="lt">Last terminated ${U.clock(d.lt)} · ${U.ago(d.lt)}</small>` : '<small class="lt">Never terminated</small>';
        const join = d && d.rm && ['online', 'playing', 'away'].includes(s.key) && d.rm !== Net.Room.code ? `<button class="btn sm primary" data-act="join-room" data-code="${esc(d.rm)}">Join</button>` : '';
        const inv = Net.Room.code && ['online', 'away'].includes(s.key) ? `<button class="btn sm ghost" data-act="friend-invite" data-uid="${id}">Invite</button>` : '';
        const rm = confirmRemove === id ? `<button class="btn sm danger" data-act="friend-remove" data-uid="${id}">Confirm remove</button>` : `<button class="btn sm icon" data-act="friend-remove" data-uid="${id}" aria-label="Remove friend">✕</button>`;
        return `<div class="li friend ${s.key}"><span class="dot ${s.key}"></span><div class="li-main"><b>${esc(f.name)}${d ? ` <em class="tag">Lv ${d.lv}</em>` : ''}</b><small class="st-${s.key}">${esc(s.label)}</small>${lt}</div>${join}${inv}${rm}</div>`;
      }).join('') : '<p class="hint">No friends yet. Send your code to your squad, or paste theirs above.</p>'}</div>
      <p class="hint">Status updates live. "Terminated" means they hit the Terminate button; the time shows when.</p>`;
  }
  let pendingAdd = '';

  function vMissions() {
    const p = P();
    const day = p.login.streak % 7;
    return `
      <h2 class="sec">Daily drops <small>Log in every day. Day 7 is a Rift Cache.</small></h2>
      <div class="streak">${DAILY_REWARDS.map((r, i) => {
        const done = p.login.claimedToday ? i < ((p.login.streak - 1) % 7) + 1 : i < day;
        const now = !p.login.claimedToday && i === day;
        return `<div class="sd ${done ? 'done' : ''} ${now ? 'now' : ''}"><small>Day ${i + 1}</small><b>${r === 'cache' ? '<img src="' + Art.cacheIcon() + '" alt="Cache">' : r}</b></div>`;
      }).join('')}</div>
      ${!p.login.claimedToday ? '<button class="btn gold wide" data-act="claim-login">Claim today\'s drop</button>' : '<p class="hint">Today\'s drop is claimed. Come back tomorrow to keep the streak.</p>'}
      <h2 class="sec">Today's missions <small>New set every day</small></h2>
      <div class="list">${p.daily.missions.map((m, i) => {
        const def = MISSION_POOL.find((x) => x.id === m.id); if (!def) return '';
        return `<div class="li mission"><div class="li-main"><b>${def.text}</b><div class="prog"><i style="--w:${Math.round((m.progress / def.goal) * 100)}%"></i></div><small>${U.fmt(m.progress)} / ${U.fmt(def.goal)}</small></div>${m.claimed ? '<span class="eq">Claimed</span>' : m.done ? `<button class="btn sm gold" data-act="claim-mission" data-i="${i}">Claim ${coins(def.reward)}</button>` : `<span class="reward">${coins(def.reward)}</span>`}</div>`;
      }).join('')}</div>
      <h2 class="sec">Achievements <small>${Object.keys(p.ach).length} / ${ACHIEVEMENTS.length}</small></h2>
      <div class="list">${ACHIEVEMENTS.map((a) => {
        const pr = Profile.achProgress(a), done = pr >= a.goal, got = p.ach[a.id];
        return `<div class="li mission ${got ? 'got' : ''}"><div class="li-main"><b>${a.name}</b><small>${a.text}</small><div class="prog"><i style="--w:${Math.round((pr / a.goal) * 100)}%"></i></div></div>${got ? '<span class="eq">Done</span>' : done ? `<button class="btn sm gold" data-act="claim-ach" data-id="${a.id}">Claim ${coins(a.reward)}</button>` : `<span class="reward">${coins(a.reward)}</span>`}</div>`;
      }).join('')}</div>`;
  }

  function vProfile() {
    const p = P(), s = p.stats, rk = rankFor(p.trophies);
    const kd = (s.kills / Math.max(1, s.deaths)).toFixed(2);
    const set = p.settings;
    return `
      <h2 class="sec">Pilot profile</h2>
      <div class="grid2">
        <div class="card">
          <div class="field"><label for="pname">Callsign</label><div class="row"><input id="pname" maxlength="14" value="${esc(p.name)}"><button class="btn ghost" data-act="rename">Save</button></div></div>
          <div class="ranks">${RANKS.map((r) => `<div class="rank ${r === rk ? 'on' : ''} ${p.trophies >= r.min ? 'got' : ''}" style="--rc:${r.color}"><b>${r.name}</b><small>${r.min}</small></div>`).join('')}</div>
          <p class="hint">Trophies come from versus matches: +25 for a win, +5 for finishing in the top half, −8 otherwise.</p>
        </div>
        <div class="card">
          <h3>Career</h3>
          <div class="kv">
            <div><small>Eliminations</small><b>${U.fmt(s.kills)}</b></div><div><small>K/D</small><b>${kd}</b></div>
            <div><small>Wins</small><b>${U.fmt(s.wins)}</b></div><div><small>Matches</small><b>${U.fmt(s.matches)}</b></div>
            <div><small>Bank kills</small><b>${U.fmt(s.bankKills)}</b></div><div><small>Echo kills</small><b>${U.fmt(s.echoKills)}</b></div>
            <div><small>Best wave</small><b>${s.maxWave}</b></div><div><small>Bosses</small><b>${s.bosses}</b></div>
            <div><small>Best streak</small><b>${s.bestStreak}</b></div><div><small>Terminations</small><b>${s.terminations || 0}</b></div>
          </div>
          <p class="hint">Last terminated: ${p.lastTerminated ? U.clock(p.lastTerminated) + ' (' + U.ago(p.lastTerminated) + ')' : 'never'}</p>
        </div>
      </div>
      <div class="grid2">
        <div class="card">
          <h3>Settings</h3>
          <label class="check"><input type="checkbox" data-input="setting" data-k="sound" ${set.sound ? 'checked' : ''}> Sound effects</label>
          <label class="check"><input type="checkbox" data-input="setting" data-k="shake" ${set.shake ? 'checked' : ''}> Screen shake</label>
          <label class="check"><input type="checkbox" data-input="setting" data-k="quality" ${set.quality === 'low' ? 'checked' : ''}> Battery saver graphics</label>
        </div>
        <div class="card">
          <h3>Account key</h3>
          <p class="hint">Your progress saves on this device and to the relay. Keep this key to restore it on another device. Anyone with it can load your save, so keep it private.</p>
          <div class="row"><code class="key">${keyShown ? esc(p.key) : '••••••••••••••••'}</code><button class="btn sm ghost" data-act="show-key">${keyShown ? 'Hide' : 'Show'}</button><button class="btn sm ghost" data-act="copy" data-text="${esc(p.key)}">Copy</button></div>
          <div class="row"><input id="restoreKey" placeholder="Paste a key to restore" autocomplete="off"><button class="btn ghost" data-act="restore">Restore</button></div>
        </div>
      </div>`;
  }
  let keyShown = false;

  // ---------- actions ----------
  function act(a, d, el) {
    const p = P();
    switch (a) {
      case 'tab': go(d.r); break;
      case 'mode': solo.mode = d.id; if (MODES[d.id].rules === 'teams' && solo.bots < 5) solo.bots = 5; soloModal(); break;
      case 'quick-solo': solo.map = U.pick(MAP_ORDER); soloModal(); break;
      case 'solo-set':
        solo[d.k] = d.v;
        if (d.rr) render(); else soloModal();
        break;
      case 'solo-start': closeModal(); startSolo(); break;
      case 'modal-close': closeModal(); break;
      case 'arm-tab': armTab = d.k; render(); break;
      case 'buy-weapon': { const w = WEAPONS[d.id]; if (p.coins < w.price) return need(w.price); p.coins -= w.price; p.owned.weapons[d.id] = 1; p.equip.weapon = d.id; bought(w.name); break; }
      case 'equip-weapon': p.equip.weapon = d.id; Profile.save(); render(); break;
      case 'up-weapon': { const lv = p.owned.weapons[d.id], c = weaponLevelCost(d.id, lv); if (p.coins < c) return need(c); p.coins -= c; p.owned.weapons[d.id] = lv + 1; bought(WEAPONS[d.id].name + ' Lv ' + (lv + 1)); break; }
      case 'buy-ab': { const ab = ABILITIES[d.id]; if (p.coins < ab.price) return need(ab.price); p.coins -= ab.price; p.owned.abilities[d.id] = true; p.equip.ability = d.id; bought(ab.name); break; }
      case 'equip-ab': p.equip.ability = d.id; Profile.save(); render(); break;
      case 'up-upg': { const lv = p.upgrades[d.id], c = UPGRADE_COST[lv]; if (p.coins < c) return need(c); p.coins -= c; p.upgrades[d.id] = lv + 1; bought(UPGRADES[d.id].name + ' ' + (lv + 1)); break; }
      case 'buy-skin': { const s = SKINS[d.id]; if (p.coins < s.price) return need(s.price); p.coins -= s.price; p.owned.skins[d.id] = true; p.equip.skin = d.id; bought(s.name + ' core'); break; }
      case 'equip-skin': p.equip.skin = d.id; Profile.save(); render(); break;
      case 'claim-login': { const r = Profile.claimLogin(); if (r != null) { Sfx.play('buy'); toast(r === 'cache' ? 'You got a Rift Cache!' : '+' + r + ' coins', { kind: 'gold' }); render(); } break; }
      case 'claim-mission': { const m = p.daily.missions[+d.i]; const def = MISSION_POOL.find((x) => x.id === m.id); if (m.done && !m.claimed) { m.claimed = true; p.coins += def.reward; Profile.save(); Sfx.play('buy'); toast('+' + def.reward + ' coins', { kind: 'gold' }); render(); } break; }
      case 'claim-ach': { const ac = ACHIEVEMENTS.find((x) => x.id === d.id); if (ac && !p.ach[ac.id] && Profile.achProgress(ac) >= ac.goal) { p.ach[ac.id] = Date.now(); p.coins += ac.reward; Profile.save(); Sfx.play('level'); toast(ac.name + ' unlocked · +' + ac.reward + ' coins', { kind: 'gold' }); render(); } break; }
      case 'open-cache': openCache(); break;
      case 'cache-again': openCache(); break;
      case 'copy': copy(d.text); break;
      case 'friend-add': {
        const v = ($('#friendCode') || {}).value || '';
        const err = Net.addFriend(v);
        if (err) { Sfx.play('error'); toast(err, { kind: 'bad' }); } else { pendingAdd = ''; toast('Request sent to ' + fcode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))); render(); }
        break;
      }
      case 'friend-accept': Net.accept(d.uid); Sfx.play('buy'); toast('Friend added'); render(); break;
      case 'friend-decline': Net.decline(d.uid); render(); break;
      case 'friend-cancel': Net.cancelOut(d.uid); render(); break;
      case 'friend-remove':
        if (confirmRemove === d.uid) { Net.removeFriend(d.uid); confirmRemove = null; toast('Friend removed'); }
        else confirmRemove = d.uid;
        render(); break;
      case 'friend-invite': if (Net.invite(d.uid)) toast('Invite sent'); else toast('Create or join a room first', { kind: 'bad' }); break;
      case 'join-room': joinRoom(d.code); break;
      case 'online-join': joinRoom(($('#joinCode') || {}).value || ''); break;
      case 'online-create': Net.Room.create({ mode: solo.mode, map: solo.map, diff: 'veteran', bots: MODES[solo.mode].rules === 'teams' ? 4 : 3, pub: ($('#roomPub') || {}).checked }); go('lobby'); break;
      case 'online-refresh': refreshRooms(); break;
      case 'online-quick': quickMatch(); break;
      case 'lobby-set': Net.Room.setInfo({ [d.k]: d.k === 'bots' ? +d.v : d.v }); render(); break;
      case 'lobby-start': hostStart(); break;
      case 'lobby-leave': Net.Room.leave(); go('online'); break;
      case 'rename': { const v = (($('#pname') || {}).value || '').trim().slice(0, 14); if (v.length < 2) { toast('Callsigns need at least 2 characters', { kind: 'bad' }); return; } p.name = v; Profile.save(); Net.publishPresence(); toast('Callsign saved'); render(); break; }
      case 'show-key': keyShown = !keyShown; render(); break;
      case 'restore': restore(($('#restoreKey') || {}).value || ''); break;
      case 'resume': togglePause(false); break;
      case 'quit': closeModal(); quitMatch(); break;
      case 'res-again': closeModal(); startSolo(); break;
      case 'res-lobby': closeModal(); if (Net.Room.isHost) Net.Room.send({ t: 'lobby' }); showMenu(); go(Net.Room.code ? 'lobby' : 'online'); break;
      case 'res-home': closeModal(); showMenu(); if (Net.Room.code) { go('lobby'); } else go('play'); break;
      case 'onboard': onboardDone(); break;
      case 'onboard-restore': restore(($('#obKey') || {}).value || '', true); break;
    }
  }
  function need(n) { Sfx.play('error'); toast('You need ' + U.fmt(n - P().coins) + ' more coins. Win matches and clear missions to earn them.', { kind: 'bad' }); }
  function bought(name) { Profile.save(); Sfx.play('buy'); toast(name + ' unlocked', { kind: 'gold' }); render(); }

  async function restore(key, fromOnboard) {
    key = key.trim();
    if (key.length < 10) { toast('Paste the full account key', { kind: 'bad' }); return; }
    if (!Net.connected) { toast('Connect to the internet first', { kind: 'bad' }); return; }
    toast('Looking up that save…');
    const d = await Net.loadCloud(key);
    if (!d || !d.uid) { toast('No save found for that key', { kind: 'bad' }); return; }
    Profile.importSave(d);
    toast('Welcome back, ' + (d.name || 'pilot'), { kind: 'gold' });
    setTimeout(() => location.reload(), 900);
    if (fromOnboard) closeModal();
  }

  function openCache() {
    const r = Profile.openCache();
    if (!r) { toast('No Rift Caches. Earn them every 5 levels and on day 7 of your login streak.'); return; }
    modal(`<div class="cache-open"><img class="cache-spin" src="${Art.cacheIcon()}" alt=""><p class="hint">Cracking the cache…</p></div>`, 'center');
    let n = 0;
    const iv = setInterval(() => { Sfx.play('spin'); if (++n > 12) clearInterval(iv); }, 90);
    setTimeout(() => {
      Sfx.play('level');
      const img = r.kind === 'skin' ? Art.shipIcon(r.id, P().equip.weapon, 160) : r.kind === 'wlv' ? Art.weaponIcon(r.id) : Art.cacheIcon();
      modal(`<div class="cache-open revealed"><span class="eyebrow">Rift Cache</span><img src="${img}" alt=""><h3>${esc(r.label)}</h3>
        <p class="hint">${r.kind === 'skin' ? 'New core unlocked and ready to equip.' : r.kind === 'wlv' ? 'Free weapon level applied.' : r.big ? 'Jackpot.' : 'Added to your balance.'}</p>
        <div class="row center">${P().caches ? `<button class="btn gold" data-act="cache-again">Open another (${P().caches})</button>` : ''}<button class="btn ghost" data-act="modal-close">Nice</button></div></div>`, 'center');
      render();
    }, 1300);
  }

  // ---------- online flows ----------
  async function joinRoom(code) {
    const err = await Net.Room.join(code);
    if (err) { Sfx.play('error'); toast(err, { kind: 'bad' }); return; }
    if (!Game.active) go('lobby');
  }
  async function refreshRooms() {
    if (roomsLoading) return;
    roomsLoading = true; render();
    rooms = await Net.Room.browse();
    roomsLoading = false; if (route === 'online') render();
  }
  async function quickMatch() {
    toast('Searching for rooms…');
    const list = await Net.Room.browse();
    const open = list.filter((r) => r.n < r.max);
    if (open.length) return joinRoom(open[0].code);
    Net.Room.create({ mode: 'brawl', map: U.pick(MAP_ORDER), diff: 'veteran', bots: 3, pub: true });
    toast('No rooms open, so you are hosting one. Share the code or start with bots.');
    go('lobby');
  }
  function hostStart() {
    const R = Net.Room;
    const humans = Object.values(R.players).map((pl) => ({ id: pl.id, name: pl.name, skin: pl.skin, weapon: pl.weapon, wlv: pl.wlv, ability: pl.ability, hp: pl.hp, spd: pl.spd, cool: pl.cool, mag: pl.mag }));
    const seed = (Math.random() * 1e9) | 0;
    const roster = Game.buildRoster(R.info.mode, humans, MODES[R.info.mode].rules === 'pve' ? 0 : R.info.bots, R.info.diff, seed);
    const payload = { mode: R.info.mode, map: R.info.map, diff: R.info.diff, seed, roster };
    R.inGame = true;
    R.publishMeta(payload);
    R.send({ t: 'start', start: payload });
    startMatch(Object.assign({}, payload, { net: true, isHost: true, localId: P().uid }));
  }
  function startSolo() {
    const me = Object.assign(Net.Room.myInfo(), { id: P().uid });
    const seed = (Math.random() * 1e9) | 0;
    const m = MODES[solo.mode];
    const roster = Game.buildRoster(solo.mode, [me], m.rules === 'pve' ? 0 : +solo.bots, solo.diff, seed);
    startMatch({ mode: solo.mode, map: solo.map, diff: solo.diff, seed, roster, net: false, isHost: true, localId: P().uid });
  }
  function startMatch(cfg) {
    Sfx.init();
    closeModal();
    document.body.classList.add('in-game');
    $('#controls').hidden = false;
    $('#btnAbility').hidden = !ABILITIES[Profile.loadout().ability];
    Game.resize();
    Game.onEnd = showResults;
    Game.start(cfg);
    try { if (matchMedia('(pointer:coarse)').matches && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* optional */ }
  }
  function showMenu() {
    document.body.classList.remove('in-game');
    $('#controls').hidden = true;
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* optional */ }
  }
  function quitMatch() {
    const online = Game.match && Game.match.net;
    Game.exit(); showMenu();
    if (online) { Net.Room.leave(); go('online'); } else go('play');
  }
  function togglePause(force) {
    if (!Game.active) return;
    const open = force != null ? force : $('#modal').hidden;
    if (open) {
      Game.setPaused(true);
      const online = Game.match.net;
      modal(`<h3>${online ? 'Match menu' : 'Paused'}</h3><p class="hint">${online ? 'The match keeps running while this is open.' : 'Bots are frozen until you resume.'}</p>
        <div class="row center"><button class="btn primary" data-act="resume">Resume</button><button class="btn danger" data-act="quit">${online ? 'Leave match' : 'Quit match'}</button></div>`, 'center');
    } else { Game.setPaused(false); closeModal(); }
  }

  // ---------- results ----------
  function showResults(out) {
    showMenu();
    const p = P(), lo = Profile.loadout(), m = MODES[out.mode], D = DIFFS[out.diff] || DIFFS.veteran, s = out.stats;
    const vs = m.rules !== 'pve';
    const lines = [];
    if (s.kills) lines.push(['Eliminations × ' + s.kills, s.kills * 12]);
    if (s.bankKills) lines.push(['Bank shots × ' + s.bankKills, s.bankKills * 10]);
    if (s.echoKills) lines.push(['Echo kills × ' + s.echoKills, s.echoKills * 10]);
    let waves = 0;
    if (!vs) {
      waves = out.won ? out.wave : Math.max(0, out.wave - 1);
      if (waves) lines.push([(m.bossRush ? 'Titans defeated × ' : 'Waves cleared × ') + waves, waves * (m.bossRush ? 120 : 30)]);
      if (s.bosses) lines.push(['Boss takedowns × ' + s.bosses, s.bosses * 150]);
      if (s.coinsPicked) lines.push(['Coins collected', s.coinsPicked]);
    }
    if (out.mode === 'gold' && out.myCoins) lines.push(['Gold banked', out.myCoins]);
    if (vs) lines.push(out.won ? ['Victory', 150] : out.draw ? ['Draw', 60] : out.place <= 3 ? ['Top 3 finish', 60] : ['Match played', 25]);
    else if (out.won) lines.push(['Mission complete', 300]);
    let total = lines.reduce((a, l) => a + l[1], 0);
    const mul = D.coin * lo.coinMul * (out.online ? 1.2 : 1);
    const bonus = Math.round(total * mul) - total;
    if (bonus) lines.push(['Difficulty' + (lo.coinMul > 1 ? ' + magnet' : '') + (out.online ? ' + online' : '') + ' bonus', bonus]);
    total += bonus;
    const xp = 40 + s.kills * 10 + (out.won ? 80 : 0) + waves * 20;
    let tr = 0;
    if (vs) tr = out.won ? 25 : out.draw ? 0 : out.place <= Math.ceil(out.total / 2) ? 5 : -8;
    // persist
    p.coins += total;
    p.trophies = Math.max(0, p.trophies + tr);
    Profile.stat('kills', s.kills); Profile.stat('deaths', s.deaths); Profile.stat('bankKills', s.bankKills); Profile.stat('echoKills', s.echoKills);
    Profile.stat('damage', Math.round(s.damage)); Profile.stat('ventHits', s.ventHits); Profile.stat('abilities', s.abilities); Profile.stat('bosses', s.bosses);
    Profile.stat('matches', 1); if (vs && out.won) Profile.stat('wins', 1); if (out.online) Profile.stat('onlineMatches', 1);
    if (out.mode === 'survival') Profile.stat('maxWave', out.wave, true);
    if (out.mode === 'gold') Profile.stat('goldBanked', out.myCoins);
    Profile.stat('bestStreak', s.bestStreak, true);
    const lvls = Profile.addXp(xp);
    const need = Profile.xpNeed(p.level);
    const sc = (b) => m.score === 'points' ? b.pts + ' pts' : m.score === 'coins' ? b.coins + ' coins' : b.kills + ' / ' + b.deaths;
    const title = vs ? (out.won ? 'Victory' : out.draw ? 'Draw' : 'Defeat') : out.won ? 'Cleared' : 'Overrun';
    const sub = vs ? (m.rules === 'teams' ? (out.draw ? 'Teams tied' : (out.won ? 'Your squad took it' : 'The other squad took it')) : 'You placed #' + out.place + ' of ' + out.total) : (m.bossRush ? 'Titans down: ' + Math.max(0, out.won ? 4 : out.wave - 1) + ' / 4' : 'Reached wave ' + out.wave);
    const board = out.board.slice().sort((a, b) => (m.score === 'points' ? b.pts - a.pts : m.score === 'coins' ? b.coins - a.coins : b.kills - a.kills));
    modal(`
      <div class="res-head ${out.won ? 'win' : 'loss'}"><span class="eyebrow">${m.name} · ${esc(out.reason || '')}</span><h2>${title}</h2><p>${sub}</p></div>
      <div class="res-grid">
        <div>
          <div class="rewards">${lines.map((l) => `<div><span>${l[0]}</span><b>+${U.fmt(l[1])}</b></div>`).join('')}
            <div class="total"><span>Total</span><b>${coins(total)}</b></div></div>
          <div class="xp"><div class="row"><span>Level ${p.level}</span><span>+${xp} XP${tr ? ` · ${tr > 0 ? '+' : ''}${tr} 🏆` : ''}</span></div><div class="prog"><i style="--w:${Math.round((p.xp / need) * 100)}%"></i></div></div>
          ${lvls.map((l) => `<div class="lvlup">Level ${l.level}! +${l.coins} coins${l.cache ? ' and a Rift Cache' : ''}</div>`).join('')}
        </div>
        <div class="board">${board.map((b, i) => `<div class="br ${b.id === p.uid ? 'me' : ''}" ${m.rules === 'teams' ? `style="--tc:${TEAM_COLORS[b.team]}"` : ''}><span>${i + 1}</span><img src="${Art.shipIcon(b.skin || 'ion', b.weapon || 'pulse', 64)}" alt=""><b>${esc(b.name)}${b.isBot ? '' : ' ★'}</b><em>${sc(b)}</em></div>`).join('')}</div>
      </div>
      <div class="row center">${out.online ? `<button class="btn primary" data-act="res-lobby">${Net.Room.isHost ? 'Back to lobby' : 'Return to lobby'}</button>` : `<button class="btn primary" data-act="res-again">Play again</button>`}<button class="btn ghost" data-act="res-home">Menu</button></div>`, 'results');
    if (lvls.length) setTimeout(() => Sfx.play('level'), 300);
    render();
  }

  // ---------- onboarding ----------
  function onboard() {
    modal(`
      <div class="onboard">
        <h1 class="logo" data-text="ECHOFRONT">ECHOFRONT</h1>
        <p class="tagline">Pick a callsign. Friends see it next to your status.</p>
        <input id="obName" maxlength="14" placeholder="Callsign" autocomplete="off">
        <button class="btn primary wide" data-act="onboard">Enter the rift</button>
        <details><summary>Restore an existing pilot</summary><div class="row"><input id="obKey" placeholder="Account key" autocomplete="off"><button class="btn ghost" data-act="onboard-restore">Restore</button></div></details>
      </div>`, 'center onboard-card');
    setTimeout(() => { const i = $('#obName'); if (i) i.focus(); }, 50);
  }
  function onboardDone() {
    const v = (($('#obName') || {}).value || '').trim().slice(0, 14);
    if (v.length < 2) { Sfx.play('error'); toast('Callsigns need at least 2 characters', { kind: 'bad' }); return; }
    P().name = v; Profile.save(); Net.publishPresence();
    closeModal(); Sfx.init(); Sfx.play('level'); render();
  }

  // ---------- init ----------
  function init() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      Sfx.init(); Sfx.play('click');
      act(el.dataset.act, el.dataset, el);
    });
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.input === 'solo-bots') { solo.bots = +el.value; const o = el.parentElement.querySelector('output') || el.closest('.field').querySelector('output'); if (o) o.textContent = el.value; }
      if (el.dataset.input === 'setting') {
        const s = P().settings;
        if (el.dataset.k === 'quality') s.quality = el.checked ? 'low' : 'high'; else s[el.dataset.k] = el.checked;
        Sfx.setMuted(!s.sound); Profile.save(false); Game.resize();
      }
      if (el.id === 'friendCode') pendingAdd = el.value;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const id = e.target.id;
      if (id === 'friendCode') act('friend-add', {});
      if (id === 'joinCode') act('online-join', {});
      if (id === 'obName') act('onboard', {});
      if (id === 'pname') act('rename', {});
    });
    $('#btnPause').addEventListener('click', () => togglePause());
    // Terminate: report status, then close the tab right away
    const term = $('#terminate');
    const kill = (e) => { e.preventDefault(); e.stopPropagation(); Net.terminate(); };
    term.addEventListener('click', kill);
    term.addEventListener('touchend', kill, { passive: false });

    Sfx.setMuted(!P().settings.sound);
    Profile.onChange(() => { if (!Game.active) renderTop(); });
    Net.on('status', (on) => { renderTop(); if (on && pendingRoom) { const c = pendingRoom; pendingRoom = null; joinRoom(c); } if (!Game.active && (route === 'online' || route === 'play')) render(); });
    Net.on('friends', () => { if (!Game.active && (route === 'friends' || route === 'lobby' || route === 'online')) render(); else renderTop(); });
    Net.on('friendStatus', (uid, before, after) => {
      if (Date.now() - bootT < 6000) return;
      const f = P().friends[uid]; if (!f) return;
      if (after === 'online' && (before === 'offline' || before === 'terminated' || before === 'unknown')) { Sfx.play('notify'); toast(`<b>${esc(f.name)}</b> is online`, { action: Net.Room.code ? 'Invite' : null, onAction: () => Net.invite(uid) }); }
      if (after === 'terminated') toast(`<b>${esc(f.name)}</b> terminated`, { kind: 'bad' });
    });
    Net.on('request', (uid, r) => { Sfx.play('notify'); toast(`<b>${esc(r.n || 'A pilot')}</b> wants to be friends`, { action: 'Accept', onAction: () => { Net.accept(uid); render(); } }); renderTop(); });
    Net.on('accepted', (uid, d) => { Sfx.play('buy'); toast(`<b>${esc(d.n || 'Pilot')}</b> accepted your request`, { kind: 'gold' }); });
    Net.on('invite', (d) => {
      Sfx.play('notify');
      toast(`<b>${esc(d.n)}</b> invited you to ${MODES[d.mode] ? MODES[d.mode].name : 'a match'}`, { action: 'Join', ms: 12000, onAction: () => { if (Game.active) quitMatch(); joinRoom(d.room); } });
    });
    Net.on('room', () => { if (!Game.active && (route === 'lobby' || route === 'online')) render(); });
    Net.on('roomClosed', (code, why) => {
      toast(why, { kind: 'bad' });
      if (Game.active && Game.match.net) { Game.exit(); showMenu(); closeModal(); }
      if (route === 'lobby') go('online');
    });
    Net.on('start', (payload, late) => {
      if (Game.active) return;
      closeModal();
      startMatch(Object.assign({}, payload, { net: true, isHost: false, localId: P().uid }));
    });
    Net.on('backToLobby', () => { if (!Game.active && route !== 'lobby') { closeModal(); showMenu(); go('lobby'); } });
    Net.on('peerJoin', (pl) => { if (Net.Room.isHost && !Game.active) toast(`<b>${esc(pl.name)}</b> joined the room`); });

    // deep links
    const q = new URLSearchParams(location.search);
    if (q.get('add')) { pendingAdd = q.get('add').toUpperCase(); route = 'friends'; }
    if (q.get('room')) pendingRoom = q.get('room').toUpperCase();
    if (q.has('add') || q.has('room')) history.replaceState(null, '', location.pathname);

    render();
    if (!P().name) onboard();
    setInterval(() => { if (!Game.active && route === 'friends') render(); }, 15000);
  }
  let pendingRoom = null;

  return { init, toast, render, go, togglePause, closeModal };
})();
