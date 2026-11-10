'use strict';
// Echofront engine: simulation, bots, bosses, networking glue and rendering.
const Game = (() => {
  const DT = 1 / 60;
  const HIST = 180; // 3 seconds of Echo history
  let cv, cx, dpr = 1, VW = 0, VH = 0, zoom = 1;
  let M = null;
  let raf = 0, lastT = 0, acc = 0, sendAcc = 0;
  const cam = { x: 900, y: 650, shake: 0 };
  let onEnd = null, onExit = null;
  const input = {
    keys: {}, mouse: { x: 0, y: 0, down: false, active: false },
    move: null, aim: null, // touch sticks {id, ox, oy, x, y}
    dash: false, ability: false, vent: false, tapFire: 0,
  };
  let mapCanvas = null;
  const btn = {};

  // ---------- setup ----------
  function init(canvas) {
    cv = canvas; cx = cv.getContext('2d');
    window.addEventListener('resize', resize); resize();
    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('touchend', onTouchEnd, { passive: false });
    cv.addEventListener('touchcancel', onTouchEnd, { passive: false });
    cv.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.active = true; });
    cv.addEventListener('mousedown', (e) => { if (e.button === 0) { input.mouse.down = true; input.mouse.active = true; } });
    window.addEventListener('mouseup', () => { input.mouse.down = false; });
    window.addEventListener('keydown', (e) => {
      if (!M) return;
      const k = e.key.toLowerCase();
      input.keys[k] = true;
      if (k === ' ') { input.dash = true; e.preventDefault(); }
      if (k === 'e' || k === 'shift') input.ability = true;
      if (k === 'q' || k === 'r') input.vent = true;
      if (k === 'escape') UI.togglePause();
    });
    window.addEventListener('keyup', (e) => { input.keys[e.key.toLowerCase()] = false; });
    const bindBtn = (id, key) => {
      const el = document.getElementById(id); btn[key] = el;
      const fire = (e) => { e.preventDefault(); e.stopPropagation(); input[key] = true; Sfx.init(); };
      el.addEventListener('touchstart', fire, { passive: false });
      el.addEventListener('mousedown', fire);
    };
    bindBtn('btnDash', 'dash'); bindBtn('btnAbility', 'ability'); bindBtn('btnVent', 'vent');
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, (Profile.p.settings.quality === 'low') ? 1 : 2);
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
    zoom = U.clamp(Math.min(VW, VH * 1.6) / 920, 0.55, 1.15);
  }

  // ---------- touch input ----------
  function onTouchStart(e) {
    e.preventDefault(); Sfx.init();
    for (const t of e.changedTouches) {
      const st = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now() };
      if (t.clientX < VW * 0.45) { if (!input.move) input.move = st; }
      else if (!input.aim) input.aim = st;
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const k of ['move', 'aim']) {
        const s = input[k];
        if (s && s.id === t.identifier) {
          s.x = t.clientX; s.y = t.clientY;
          // floating stick: drag origin along when pulled too far
          const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), R = 70;
          if (d > R) { s.ox = s.x - (dx / d) * R; s.oy = s.y - (dy / d) * R; }
        }
      }
    }
  }
  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (input.move && input.move.id === t.identifier) input.move = null;
      if (input.aim && input.aim.id === t.identifier) {
        const s = input.aim;
        if (performance.now() - s.t0 < 220 && Math.hypot(s.x - s.ox, s.y - s.oy) < 14) input.tapFire = 0.3; // quick tap = auto-aim burst
        input.aim = null;
      }
    }
  }

  // ---------- roster ----------
  function buildRoster(modeId, humans, botCount, diffId, seed) {
    const mode = MODES[modeId], rng = U.rng(seed || 1);
    const roster = humans.map((h) => Object.assign({}, h, { isBot: false }));
    if (mode.rules !== 'pve') {
      const tier = { rookie: 3, veteran: 5, elite: 7, nightmare: 8 }[diffId] || 5;
      const lvr = { rookie: [1, 1], veteran: [1, 2], elite: [2, 3], nightmare: [3, 5] }[diffId] || [1, 2];
      const names = BOT_NAMES.slice().sort(() => rng() - 0.5);
      for (let i = 0; i < botCount; i++) {
        const w = WEAPON_ORDER[Math.floor(rng() * tier)];
        roster.push({
          id: 'b' + i, name: names[i % names.length], isBot: true, weapon: w,
          wlv: lvr[0] + Math.floor(rng() * (lvr[1] - lvr[0] + 1)),
          ability: ABILITY_ORDER[Math.floor(rng() * Math.min(ABILITY_ORDER.length, 2 + tier / 2))],
          skin: SKIN_ORDER[Math.floor(rng() * SKIN_ORDER.length)],
          hp: Math.round(100 * DIFFS[diffId].hp), spd: 225 + Math.floor(rng() * 20), cool: 34, mag: 40,
        });
      }
    }
    roster.forEach((r, i) => {
      if (mode.rules === 'pve') r.team = 0;
      else if (mode.rules === 'teams') r.team = null;
      else r.team = 100 + i;
    });
    if (mode.rules === 'teams') {
      const cnt = [0, 0];
      roster.filter((r) => !r.isBot).forEach((r) => { r.team = cnt[0] <= cnt[1] ? 0 : 1; cnt[r.team]++; });
      roster.filter((r) => r.isBot).forEach((r) => { r.team = cnt[0] <= cnt[1] ? 0 : 1; cnt[r.team]++; });
    }
    return roster;
  }

  // ---------- units ----------
  function makePilot(r, localId) {
    return baseUnit({
      id: r.id, name: r.name, team: r.team, isBot: !!r.isBot, local: r.id === localId && !r.isBot, kind: 'pilot',
      r: 18, maxHp: r.hp || 100, spd: r.spd || 230, cool: r.cool || 34, mag: r.mag || 40,
      weapon: r.weapon || 'pulse', wlv: r.wlv || 1, ability: r.ability || 'echo', skin: r.skin || 'ion',
    });
  }
  function makeEnemy(id, etype, scale) {
    const e = ENEMIES[etype];
    const hp = Math.round(e.hp * scale);
    return baseUnit({
      id, name: e.name, team: 1, isBot: true, kind: 'enemy', etype, r: e.r, maxHp: hp, spd: e.spd, cool: 30, mag: 0,
      weapon: e.weapon, wlv: 1, dmgMul: e.dmgMul, shape: e.shape, color: e.color, ability: null,
    });
  }
  function makeBoss(id, bossId, scale) {
    const b = BOSSES.find((x) => x.id === bossId);
    return baseUnit({
      id, name: b.name, team: 1, isBot: true, kind: 'boss', bossId, r: b.r, maxHp: Math.round(b.hp * scale), spd: b.spd,
      cool: 100, mag: 0, weapon: null, wlv: 1, color: b.color, ability: null,
    });
  }
  function baseUnit(o) {
    return Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, ang: 0, body: 0, hp: o.maxHp, alive: true, respawnT: 0,
      heat: 0, overT: 0, fireCd: 0, dashCd: 0, dashT: 0, dvx: 0, dvy: 0, abCd: 2, inv: 0, flash: 0,
      mirrorT: 0, odT: 0, shield: 0, droneT: 0, droneCd: 0, kills: 0, deaths: 0, pts: 0, coins: 0, streak: 0,
      hist: [], ghost: null, gpos: null, tx: null, ty: null, tang: 0, lastNet: 0, dmgMul: 1, shotFlag: false,
      brain: { t: 0, mx: 0, my: 0, strafe: Math.random() < 0.5 ? 1 : -1, target: null, aim: 0, stuckT: 0, lx: 0, ly: 0, wander: 0, pattern: 0, spin: 0 },
    }, o);
  }
  const owns = (u) => u.local || (u.isBot && M.isHost);
  const isEnemy = (a, b) => a.team !== b.team;

  // ---------- match lifecycle ----------
  function start(cfg) {
    stop();
    const mode = MODES[cfg.mode], mapDef = MAPS[cfg.map];
    M = {
      cfg, mode, modeId: cfg.mode, mapDef, mapId: cfg.map, diff: DIFFS[cfg.diff] || DIFFS.veteran, diffId: cfg.diff,
      net: !!cfg.net, isHost: !!cfg.isHost, localId: cfg.localId, roster: cfg.roster.slice(),
      units: new Map(), list: [], bullets: [], parts: [], texts: [], pickups: new Map(), fields: [], decoys: [], feed: [], callouts: [],
      walls: [], wells: [], zone: mapDef.zone, time: 0, timeLeft: mode.time || 0, wave: 0, waveState: 'pre', waveT: 3, queue: [], spawnT: 0,
      bossIdx: 0, eid: 0, pid: 0, puT: 6, sbT: 0, outbox: [], over: false, paused: false, killer: null,
      stats: { kills: 0, bankKills: 0, echoKills: 0, damage: 0, ventHits: 0, abilities: 0, coinsPicked: 0, bosses: 0, bestStreak: 0, deaths: 0 },
      hurtT: 0, seed: cfg.seed || 1,
    };
    // walls
    const T = 60;
    M.walls.push({ x: -T, y: -T, w: WORLD_W + 2 * T, h: T }, { x: -T, y: WORLD_H, w: WORLD_W + 2 * T, h: T }, { x: -T, y: 0, w: T, h: WORLD_H }, { x: WORLD_W, y: 0, w: T, h: WORLD_H });
    mapDef.walls.forEach(([x, y, w, h]) => M.walls.push({ x, y, w, h }));
    mapDef.crystals.forEach(([x, y, w, h]) => M.walls.push({ x, y, w, h, crystal: true, hp: 70, max: 70 }));
    mapDef.wells.forEach(([x, y, R]) => M.wells.push({ x, y, R, str: 2.6, map: true }));
    // spawn candidates
    const rng = U.rng(M.seed);
    M.spawns = [];
    for (let i = 0; i < 600 && M.spawns.length < 60; i++) {
      const x = 80 + rng() * (WORLD_W - 160), y = 80 + rng() * (WORLD_H - 160);
      if (!M.walls.some((w) => U.circleRect(x, y, 40, w)) && !M.wells.some((w) => U.dist(x, y, w.x, w.y) < 140)) M.spawns.push([x, y]);
    }
    for (const r of M.roster) addPilot(r);
    buildMapCanvas();
    const me = M.units.get(M.localId);
    if (me) { cam.x = me.x; cam.y = me.y; }
    if (M.net) Net.Room.onGame = onNet;
    if (mode.rules === 'pve') { M.waveState = 'pre'; M.waveT = 3; }
    if (mode.zone) M.pts = {};
    btn.ability.style.setProperty('--icon', `url(${me && me.ability ? Art.abilityIcon(me.ability) : ''})`);
    lastT = performance.now(); acc = 0;
    raf = requestAnimationFrame(loop);
    Net.setStatus('playing'); Net.Room.inGame = true;
  }
  function addPilot(r) {
    if (M.units.has(r.id)) return M.units.get(r.id);
    const u = makePilot(r, M.localId);
    const sp = spawnPoint(u);
    u.x = sp[0]; u.y = sp[1]; u.inv = 1.5;
    M.units.set(u.id, u); M.list.push(u);
    return u;
  }
  function removeUnit(id) {
    const u = M.units.get(id); if (!u) return;
    M.units.delete(id); M.list.splice(M.list.indexOf(u), 1);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    if (M && M.net) Net.Room.onGame = null;
    M = null; input.move = input.aim = null;
  }
  function exit() { stop(); Net.Room.inGame = false; Net.setStatus('online'); }

  function spawnPoint(u) {
    let best = M.spawns[0] || [WORLD_W / 2, WORLD_H / 2], bs = -1;
    for (let i = 0; i < 14; i++) {
      const s = M.spawns[Math.floor(Math.random() * M.spawns.length)];
      if (!s) break;
      let md = 1e9;
      for (const v of M.list) if (v !== u && v.alive && isEnemy(u, v)) md = Math.min(md, U.dist(s[0], s[1], v.x, v.y));
      if (u.team === 0 && M.mode.rules !== 'ffa') md = Math.min(md, 1e6);
      if (md > bs) { bs = md; best = s; }
    }
    return best;
  }

  // ---------- main loop ----------
  function loop(t) {
    raf = requestAnimationFrame(loop);
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.1) dt = 0.1;
    if (!M) return;
    if (!M.paused || M.net) {
      acc += dt;
      while (acc >= DT) { step(DT); acc -= DT; if (!M) return; }
    }
    render(dt);
  }

  function step(dt) {
    M.time += dt;
    const me = M.units.get(M.localId);
    if (me) controlLocal(me, dt);
    for (const u of M.list) {
      if (!owns(u)) { interpRemote(u, dt); continue; }
      if (u.isBot && u.alive) think(u, dt);
      physics(u, dt);
      timers(u, dt);
      if (u.ability === 'echo' || u.local) recordHist(u);
      updateGhost(u);
      updateDrone(u, dt);
      if (!u.alive && u.respawnT > 0 && u.respawnT < 1e8) { u.respawnT -= dt; if (u.respawnT <= 0) respawn(u); }
    }
    for (const u of M.list) if (!owns(u)) { timers(u, dt); }
    // host clears dead PvE enemies shortly after they die
    if (M.isHost) {
      for (let i = M.list.length - 1; i >= 0; i--) {
        const u = M.list[i];
        if (u.kind !== 'pilot' && !u.alive) { u.goneT = (u.goneT || 0) + dt; if (u.goneT > 1.2) removeUnit(u.id); }
      }
    }
    updateBullets(dt);
    updateFields(dt);
    updatePickups(dt);
    updateParts(dt);
    if (M.isHost) hostLogic(dt);
    if (M.net) {
      sendAcc += dt;
      if (sendAcc >= 0.066) { sendAcc = 0; sendPacket(); }
    }
  }

  // ---------- local control ----------
  function controlLocal(u, dt) {
    if (!u.alive) return;
    let mx = 0, my = 0;
    const k = input.keys;
    if (k.w || k.arrowup) my -= 1; if (k.s || k.arrowdown) my += 1;
    if (k.a || k.arrowleft) mx -= 1; if (k.d || k.arrowright) mx += 1;
    if (input.move) {
      const dx = input.move.x - input.move.ox, dy = input.move.y - input.move.oy, d = Math.hypot(dx, dy);
      if (d > 6) { const m = Math.min(1, d / 60); mx = (dx / d) * m; my = (dy / d) * m; }
    }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    u.brain.mx = mx; u.brain.my = my;
    let firing = false;
    if (input.aim) {
      const dx = input.aim.x - input.aim.ox, dy = input.aim.y - input.aim.oy;
      if (Math.hypot(dx, dy) > 16) { u.ang = Math.atan2(dy, dx); firing = true; }
    } else if (input.mouse.active && !input.move) {
      const sx = (u.x - cam.x) * zoom + VW / 2, sy = (u.y - cam.y) * zoom + VH / 2;
      u.ang = Math.atan2(input.mouse.y - sy, input.mouse.x - sx);
      firing = input.mouse.down;
    }
    if (input.tapFire > 0) {
      input.tapFire -= dt;
      const t = nearestEnemy(u, 700, true);
      if (t) { u.ang = Math.atan2(t.y - u.y, t.x - u.x); firing = true; }
    }
    if (!firing && (mx || my) && !input.aim && !input.mouse.active) u.ang = Math.atan2(my, mx);
    if (firing) tryFire(u, u.ang);
    if (input.dash) { input.dash = false; doDash(u); }
    if (input.ability) { input.ability = false; useAbility(u); }
    if (input.vent) { input.vent = false; doVent(u); }
  }

  function nearestEnemy(u, maxD, needLos) {
    let best = null, bd = maxD;
    for (const v of M.list) {
      if (!v.alive || !isEnemy(u, v)) continue;
      const d = U.dist(u.x, u.y, v.x, v.y);
      if (d < bd && (!needLos || los(u.x, u.y, v.x, v.y))) { bd = d; best = v; }
    }
    return best;
  }
  function los(x1, y1, x2, y2) {
    for (const w of M.walls) if (U.segRect(x1, y1, x2, y2, w)) return false;
    return true;
  }

  // ---------- physics ----------
  function physics(u, dt) {
    if (!u.alive) return;
    let spd = u.spd;
    for (const f of M.fields) if (f.kind === 'stasis' && f.team !== u.team && U.dist(u.x, u.y, f.x, f.y) < f.r) spd *= 0.45;
    if (u.overT > 0) spd *= 0.85;
    let tvx = u.brain.mx * spd, tvy = u.brain.my * spd;
    const a = Math.min(1, dt * 12);
    u.vx += (tvx - u.vx) * a; u.vy += (tvy - u.vy) * a;
    let vx = u.vx, vy = u.vy;
    if (u.dashT > 0) { vx = u.dvx; vy = u.dvy; }
    // gravity wells pull units gently
    for (const w of M.wells) {
      if (w.team != null && w.team === u.team) continue;
      const dx = w.x - u.x, dy = w.y - u.y, d = Math.hypot(dx, dy);
      if (d < w.R && d > 5) { const f = (w.map ? 70 : 260) * (1 - d / w.R); vx += (dx / d) * f; vy += (dy / d) * f; }
    }
    u.x += vx * dt; collide(u);
    u.y += vy * dt; collide(u);
    if (Math.hypot(u.vx, u.vy) > 20) u.body += U.angDiff(u.body, Math.atan2(u.vy, u.vx)) * Math.min(1, dt * 6);
  }
  function collide(u) {
    for (const w of M.walls) {
      const nx = U.clamp(u.x, w.x, w.x + w.w), ny = U.clamp(u.y, w.y, w.y + w.h);
      const dx = u.x - nx, dy = u.y - ny, d2 = dx * dx + dy * dy;
      if (d2 < u.r * u.r) {
        if (d2 > 0.0001) { const d = Math.sqrt(d2), push = u.r - d; u.x += (dx / d) * push; u.y += (dy / d) * push; }
        else { // centre inside rect: push out the shortest way
          const l = u.x - w.x, r = w.x + w.w - u.x, t = u.y - w.y, b = w.y + w.h - u.y, m = Math.min(l, r, t, b);
          if (m === l) u.x = w.x - u.r; else if (m === r) u.x = w.x + w.w + u.r; else if (m === t) u.y = w.y - u.r; else u.y = w.y + w.h + u.r;
        }
      }
    }
  }
  function timers(u, dt) {
    u.fireCd = Math.max(0, u.fireCd - dt);
    u.dashCd = Math.max(0, u.dashCd - dt);
    u.dashT = Math.max(0, u.dashT - dt);
    u.abCd = Math.max(0, u.abCd - dt);
    u.inv = Math.max(0, u.inv - dt);
    u.flash = Math.max(0, u.flash - dt);
    u.mirrorT = Math.max(0, u.mirrorT - dt);
    u.odT = Math.max(0, u.odT - dt);
    if (u.overT > 0) { u.overT -= dt; if (u.overT <= 0) { u.overT = 0; u.heat = 40; } }
    else u.heat = Math.max(0, u.heat - u.cool * dt * (u.fireCd > 0 ? 0.55 : 1.4));
  }
  function interpRemote(u, dt) {
    if (u.tx == null) return;
    const d = U.dist(u.x, u.y, u.tx, u.ty);
    if (d > 260) { u.x = u.tx; u.y = u.ty; }
    else { const k = Math.min(1, dt * 14); u.x += (u.tx - u.x) * k; u.y += (u.ty - u.y) * k; }
    u.ang += U.angDiff(u.ang, u.tang) * Math.min(1, dt * 16);
    if (d > 2) u.body += U.angDiff(u.body, Math.atan2(u.ty - u.y, u.tx - u.x)) * Math.min(1, dt * 6);
  }

  // ---------- weapons ----------
  function wdef(id) { return WEAPONS[id] || XWEAPONS[id]; }
  function tryFire(u, ang) {
    if (!u.alive || u.fireCd > 0 || u.overT > 0 || !u.weapon) return false;
    const w = wdef(u.weapon);
    let cd = w.cd;
    if (u.kind === 'enemy') cd *= 1.9 / M.diff.fire;
    else if (u.isBot) cd *= 1.15 / M.diff.fire;
    u.fireCd = cd;
    if (u.kind === 'pilot') {
      u.heat += w.heat;
      if (u.heat >= 100) { u.heat = 100; u.overT = 1.6; if (u.local) { Sfx.play('overheat'); callout('OVERHEAT', '#ff6b6b', 0.9); } }
    }
    const mx = u.x + Math.cos(ang) * u.r * 1.3, my = u.y + Math.sin(ang) * u.r * 1.3;
    const ev = { t: 'sh', o: u.id, w: u.weapon, lv: u.wlv, x: Math.round(mx), y: Math.round(my), a: +ang.toFixed(3), s: (Math.random() * 1e9) | 0, m: +((u.odT > 0 ? 1.5 : 1) * u.dmgMul).toFixed(2) };
    spawnShot(ev); queue(ev);
    u.shotFlag = true;
    return true;
  }
  function spawnShot(ev) {
    const w = wdef(ev.w); if (!w) return;
    const owner = M.units.get(ev.o);
    const team = owner ? owner.team : -1;
    const rng = U.rng(ev.s || 1);
    const n = w.n || 1;
    const dmg = w.dmg * (WEAPONS[ev.w] ? weaponDmgMul(ev.lv || 1) : 1) * (ev.m || 1) * (ev.g ? 0.6 : 1);
    for (let i = 0; i < n; i++) {
      let a = ev.a;
      if (n > 1) a += (i / (n - 1) - 0.5) * w.spread + (rng() - 0.5) * w.spread * 0.25;
      else a += (rng() - 0.5) * w.spread;
      const sp = w.spd * (n > 1 ? 0.9 + rng() * 0.2 : 1);
      M.bullets.push({
        x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, o: ev.o, team, dmg, b: 0, mb: w.bounce, life: w.life, max: w.life,
        r: w.r, w: ev.w, col: w.color, pierce: !!w.pierce, hit: null, g: !!ev.g, homing: w.homing || 0, orb: !!w.orb, aura: w.aura || 0,
        explode: w.explode || 0, well: w.well || 0, split: w.split || 0, tick: 0,
      });
    }
    if (onScreen(ev.x, ev.y, 80)) {
      Sfx.play(ev.w, ev.w === 'needle' ? 50 : 40);
      for (let i = 0; i < 4; i++) part(ev.x, ev.y, Math.cos(ev.a) * U.rand(60, 220) + U.rand(-60, 60), Math.sin(ev.a) * U.rand(60, 220) + U.rand(-60, 60), 0.18, w.color, 2.5);
    }
  }

  function updateBullets(dt) {
    const bs = M.bullets;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.life -= dt;
      if (b.life <= 0) { killBullet(b, i, true); continue; }
      // homing
      if (b.homing) {
        let best = null, bd = 380;
        for (const u of M.list) { if (!u.alive || u.team === b.team) continue; const d = U.dist(b.x, b.y, u.x, u.y); if (d < bd) { bd = d; best = u; } }
        if (best) {
          const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x);
          const na = cur + U.clamp(U.angDiff(cur, want), -b.homing * dt, b.homing * dt);
          b.vx = Math.cos(na) * b.sp; b.vy = Math.sin(na) * b.sp;
        }
      }
      // gravity wells bend shots (direction only, speed kept)
      for (const w of M.wells) {
        if (w.team != null && w.team === b.team) continue;
        const dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy);
        if (d < w.R && d > 18) {
          const f = (w.map ? 2600 : 3200) * (1 - d / w.R) * dt;
          b.vx += (dx / d) * f; b.vy += (dy / d) * f;
          const s = Math.hypot(b.vx, b.vy) || 1; b.vx = (b.vx / s) * b.sp; b.vy = (b.vy / s) * b.sp;
        }
      }
      let slow = 1;
      for (const f of M.fields) if (f.kind === 'stasis' && f.team !== b.team && U.dist(b.x, b.y, f.x, f.y) < f.r) slow = 0.1;
      // move with substeps
      const dist = Math.hypot(b.vx, b.vy) * dt * slow;
      const steps = Math.max(1, Math.ceil(dist / 8));
      const sx = (b.vx * dt * slow) / steps, sy = (b.vy * dt * slow) / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        const ox = b.x, oy = b.y;
        b.x += sx; b.y += sy;
        const cr = Math.min(b.r, 6);
        for (const w of M.walls) {
          if (!U.circleRect(b.x, b.y, cr, w)) continue;
          if (w.crystal) hitCrystal(w, b.orb ? 4 : b.dmg * 0.6, b.x, b.y);
          if (b.b < b.mb) {
            const hitX = !U.circleRect(ox, b.y, cr, w);
            const hitY = !U.circleRect(b.x, oy, cr, w);
            if (hitX && !hitY) b.vx = -b.vx; else if (hitY && !hitX) b.vy = -b.vy; else { b.vx = -b.vx; b.vy = -b.vy; }
            b.x = ox; b.y = oy; b.b++;
            if (onScreen(b.x, b.y, 40)) { Sfx.play('bounce', 60); for (let k = 0; k < 5; k++) part(b.x, b.y, U.rand(-160, 160), U.rand(-160, 160), 0.25, '#ffffff', 2); }
            if (b.split) splitBullet(b);
          } else { killBullet(b, i, true); dead = true; }
          break;
        }
        if (dead) break;
        // unit hits
        if (b.orb) continue;
        if (M.mode.bankOnly && b.b === 0) continue;
        for (const u of M.list) {
          if (!u.alive || u.team === b.team) continue;
          if (b.hit && b.hit.has(u.id)) continue;
          const rr = u.r + b.r;
          if ((u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) < rr * rr) {
            onBulletHit(b, u);
            if (b.pierce) { (b.hit || (b.hit = new Set())).add(u.id); }
            else { killBullet(b, i, false); dead = true; break; }
          }
        }
        if (dead) break;
        for (let d = M.decoys.length - 1; d >= 0; d--) {
          const dc = M.decoys[d];
          if (dc.team !== b.team && U.dist(dc.x, dc.y, b.x, b.y) < 20) { killBullet(b, i, false); dead = true; break; }
        }
      }
      if (dead) continue;
      // singularity aura: damage + eat bullets
      if (b.orb) {
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick = 0.12;
          for (const u of M.list) {
            if (!u.alive || u.team === b.team) continue;
            if (U.dist(u.x, u.y, b.x, b.y) < b.aura + u.r && owns(u)) damage(u, b.dmg, b.o, { bank: b.b > 0, ghost: b.g });
          }
        }
        for (let j = bs.length - 1; j >= 0; j--) {
          const o = bs[j];
          if (o === b || o.orb || o.team === b.team) continue;
          if (U.dist(o.x, o.y, b.x, b.y) < b.aura) { bs.splice(j, 1); if (j < i) i--; part(o.x, o.y, 0, 0, 0.3, '#7d5cff', 3); }
        }
      }
    }
  }
  function splitBullet(b) {
    const a = Math.atan2(b.vy, b.vx);
    for (const da of [-0.45, 0.45]) {
      M.bullets.push(Object.assign({}, b, { vx: Math.cos(a + da) * b.sp, vy: Math.sin(a + da) * b.sp, dmg: b.dmg * 0.66, split: 0, mb: b.b, hit: null, r: 4, life: Math.min(b.life, 0.7) }));
    }
  }
  function killBullet(b, i, impact) {
    const idx = M.bullets.indexOf(b);
    if (idx >= 0) M.bullets.splice(idx, 1);
    if (b.explode) explode(b.x, b.y, b.explode, b.dmg, b.o, b.team, b.well, b);
    else if (impact && onScreen(b.x, b.y, 40)) for (let k = 0; k < 3; k++) part(b.x, b.y, U.rand(-90, 90), U.rand(-90, 90), 0.2, b.col, 2);
  }
  function explode(x, y, R, dmg, owner, team, well, b) {
    if (onScreen(x, y, 120)) { Sfx.play('boom', 80); shake(6); }
    ring(x, y, R, '#ff9a6b');
    for (let k = 0; k < 18; k++) part(x, y, U.rand(-260, 260), U.rand(-260, 260), 0.45, U.pick(['#ff6b6b', '#ffb347', '#fff']), 3);
    for (const u of M.list) {
      if (!u.alive || u.team === team || !owns(u)) continue;
      const d = U.dist(u.x, u.y, x, y);
      if (d < R + u.r) damage(u, dmg * (1 - (d / (R + u.r)) * 0.5), owner, { bank: b && b.b > 0, ghost: b && b.g });
    }
    for (const w of M.walls) if (w.crystal && U.circleRect(x, y, R, w)) hitCrystal(w, dmg, x, y);
    if (well) M.wells.push({ x, y, R: 170, str: 1, t: well, team });
  }
  function hitCrystal(w, d, x, y) {
    w.hp -= d;
    if (onScreen(x, y, 30)) part(x, y, U.rand(-80, 80), U.rand(-80, 80), 0.3, '#ff9df0', 2);
    if (w.hp <= 0) {
      M.walls.splice(M.walls.indexOf(w), 1);
      for (let k = 0; k < 22; k++) part(w.x + Math.random() * w.w, w.y + Math.random() * w.h, U.rand(-200, 200), U.rand(-200, 200), 0.7, U.pick(['#ff7ae0', '#c38bff', '#ffffff']), 3.5);
      if (onScreen(x, y, 100)) Sfx.play('boom', 60);
    }
  }

  function onBulletHit(b, u) {
    if (onScreen(b.x, b.y, 30)) for (let k = 0; k < 4; k++) part(b.x, b.y, U.rand(-140, 140), U.rand(-140, 140), 0.2, b.col, 2.5);
    if (!owns(u)) return;
    if (u.mirrorT > 0) {
      const src = M.units.get(b.o);
      const a = src ? Math.atan2(src.y - u.y, src.x - u.x) : Math.atan2(-b.vy, -b.vx);
      const ev = { t: 'sh', o: u.id, w: 'refl', lv: 1, x: Math.round(b.x), y: Math.round(b.y), a: +a.toFixed(3), s: 1, m: +(b.dmg / 16).toFixed(2) };
      spawnShot(ev); queue(ev);
      return;
    }
    damage(u, b.dmg * (1 + 0.25 * b.b), b.o, { bank: b.b > 0, ghost: b.g });
  }

  // Damage is decided by whoever owns the victim, then broadcast.
  function damage(u, amt, src, info) {
    if (!u.alive || u.inv > 0) return;
    if (M.mode.glass && u.kind === 'pilot') amt = 9999;
    if (u.shield > 0) { const a = Math.min(u.shield, amt); u.shield -= a; amt -= a; }
    u.hp -= amt; u.flash = 0.08;
    const ev = { t: 'hit', v: u.id, k: src, d: Math.round(amt), bk: info.bank ? 1 : 0 };
    onHitEv(ev); queue(ev);
    if (u.hp <= 0) {
      u.hp = 0;
      const kev = { t: 'kill', v: u.id, k: src, bk: info.bank ? 1 : 0, gh: info.ghost ? 1 : 0 };
      onKillEv(kev); queue(kev);
    }
  }
  function onHitEv(ev) {
    const v = M.units.get(ev.v);
    if (v) v.flash = 0.08;
    if (ev.k === M.localId) {
      M.stats.damage += ev.d;
      if (v) text(v.x + U.rand(-10, 10), v.y - v.r - 6, ev.bk ? ev.d + '!' : String(ev.d), ev.bk ? '#ffe066' : '#ffffff', ev.bk ? 1.25 : 1);
      Sfx.play(ev.bk ? 'bank' : 'hit', 45);
    }
    if (ev.v === M.localId) { Sfx.play('hurt', 90); M.hurtT = 0.35; shake(5); }
  }
  function onKillEv(ev) {
    const v = M.units.get(ev.v), k = M.units.get(ev.k);
    if (!v || !v.alive) return;
    v.alive = false; v.deaths++; v.streak = 0; v.ghost = null; v.droneT = 0;
    v.respawnT = M.mode.rules === 'pve' ? (v.kind === 'pilot' ? 1e9 : 0) : (M.mode.glass ? 1.6 : 3);
    if (onScreen(v.x, v.y, 200)) { Sfx.play(v.kind === 'boss' ? 'boom' : 'die', 60); shake(v.kind === 'boss' ? 16 : 4); }
    ring(v.x, v.y, v.r * 3, v.color || '#ffffff');
    for (let i = 0; i < (v.kind === 'boss' ? 80 : 26); i++) part(v.x, v.y, U.rand(-320, 320), U.rand(-320, 320), U.rand(0.4, 0.9), U.pick([v.color || Art.skinCols(v.skin, 0).core, '#ffffff', '#ffb347']), U.rand(2, 5));
    if (k && k !== v) {
      k.kills++; k.streak++;
      if (M.mode.rules === 'teams') {/* team kills summed from units */ }
      if (k.id === M.localId) {
        M.stats.kills++; M.stats.bestStreak = Math.max(M.stats.bestStreak, k.streak);
        if (ev.bk) M.stats.bankKills++;
        if (ev.gh) M.stats.echoKills++;
        if (v.kind === 'boss') M.stats.bosses++;
        Sfx.play('kill');
        const names = { 2: 'DOUBLE DOWN', 3: 'TRIPLE THREAT', 4: 'RAMPAGE', 5: 'RIFT STORM', 7: 'UNSTOPPABLE', 10: 'GODLIKE' };
        if (ev.gh) callout('ECHO KILL', '#4de3ff');
        else if (ev.bk) callout('BANK SHOT', '#ffe066');
        if (names[k.streak]) callout(names[k.streak], '#ff4fa3', 1.3);
      }
    }
    if (v.id === M.localId) { M.stats.deaths++; M.killer = k ? k.name : null; Sfx.play('die'); }
    feed(k ? k.name : 'The Rift', v.name, ev.bk, ev.gh, k);
    if (M.isHost) {
      if (Math.random() < (v.kind === 'pilot' ? 0.35 : 0.12)) spawnPickup('hp', v.x, v.y);
      if (M.mode.rules === 'pve' && v.kind !== 'pilot') {
        const val = v.kind === 'boss' ? 300 : (ENEMIES[v.etype] ? ENEMIES[v.etype].coins : 5);
        spawnPickup('coin', v.x + U.rand(-10, 10), v.y + U.rand(-10, 10), Math.round(val * M.diff.coin));
      }
    }
    if (owns(v) && M.mode.score === 'coins' && v.coins > 0) {
      const lost = Math.floor(v.coins / 2); v.coins -= lost;
      const dev = { t: 'drop', x: Math.round(v.x), y: Math.round(v.y), n: lost };
      onDropEv(dev); queue(dev);
    }
  }
  function onDropEv(ev) {
    if (!M.isHost) return;
    let n = ev.n;
    while (n > 0) { const v = Math.min(n, 25); n -= v; spawnPickup('coin', ev.x + U.rand(-40, 40), ev.y + U.rand(-40, 40), v); }
  }
  function respawn(u) {
    const sp = spawnPoint(u);
    u.x = sp[0]; u.y = sp[1]; u.vx = u.vy = 0;
    u.hp = u.maxHp; u.alive = true; u.inv = 1.6; u.heat = 0; u.overT = 0; u.respawnT = 0; u.hist = [];
    if (u.local) M.killer = null;
  }

  // ---------- movement abilities ----------
  function doDash(u) {
    if (!u.alive || u.dashCd > 0) return;
    let dx = u.brain.mx, dy = u.brain.my;
    if (!dx && !dy) { dx = Math.cos(u.ang); dy = Math.sin(u.ang); }
    const d = Math.hypot(dx, dy) || 1;
    u.dvx = (dx / d) * 820; u.dvy = (dy / d) * 820; u.dashT = 0.16; u.dashCd = 2.4; u.inv = Math.max(u.inv, 0.2);
    if (onScreen(u.x, u.y, 50)) Sfx.play('dash');
    for (let i = 0; i < 10; i++) part(u.x, u.y, -u.dvx * 0.2 + U.rand(-60, 60), -u.dvy * 0.2 + U.rand(-60, 60), 0.3, Art.skinCols(u.skin, M.time).trail, 3);
  }
  function doVent(u) {
    if (!u.alive || u.kind !== 'pilot') return;
    if (u.heat < 45 && u.overT <= 0) { if (u.local) Sfx.play('error'); return; }
    const p = Math.round(u.heat * 0.7 + (u.overT > 0 ? 20 : 0));
    u.heat = 0; u.overT = 0;
    const ev = { t: 'vent', o: u.id, x: Math.round(u.x), y: Math.round(u.y), p };
    onVentEv(ev); queue(ev);
    if (u.local) {
      let n = 0; for (const v of M.list) if (v.alive && isEnemy(u, v) && U.dist(v.x, v.y, u.x, u.y) < 130 + v.r) n++;
      M.stats.ventHits += n;
    }
  }
  function onVentEv(ev) {
    const src = M.units.get(ev.o);
    ring(ev.x, ev.y, 130, '#ff9a3d'); ring(ev.x, ev.y, 90, '#ffe066');
    if (onScreen(ev.x, ev.y, 150)) { Sfx.play('vent'); shake(5); }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; part(ev.x, ev.y, Math.cos(a) * 420, Math.sin(a) * 420, 0.3, '#ffb347', 3); }
    for (const v of M.list) {
      if (!v.alive || !owns(v) || (src && !isEnemy(src, v)) || v.id === ev.o) continue;
      const dx = v.x - ev.x, dy = v.y - ev.y, d = Math.hypot(dx, dy);
      if (d < 130 + v.r) {
        damage(v, ev.p, ev.o, { bank: false });
        if (d > 1) { v.dvx = (dx / d) * 700; v.dvy = (dy / d) * 700; v.dashT = 0.14; }
      }
    }
  }
  function useAbility(u) {
    if (!u.alive || !u.ability || u.abCd > 0) return;
    const A = ABILITIES[u.ability];
    let ev = { t: 'ab', o: u.id, k: u.ability };
    if (u.ability === 'echo') {
      if (u.hist.length < 30) return;
      u.ghost = { f: u.hist.slice(), i: 0 };
    } else if (u.ability === 'blink') {
      let dx = u.brain.mx, dy = u.brain.my;
      if (!dx && !dy) { dx = Math.cos(u.ang); dy = Math.sin(u.ang); }
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const x0 = u.x, y0 = u.y;
      for (let s = 0; s < 20; s++) {
        const nx = u.x + dx * 10, ny = u.y + dy * 10;
        if (M.walls.some((w) => U.circleRect(nx, ny, u.r, w))) break;
        u.x = nx; u.y = ny;
      }
      Object.assign(ev, { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(u.x), y1: Math.round(u.y), tm: u.team });
    } else if (u.ability === 'mirror') {
      u.mirrorT = 1.6;
    } else if (u.ability === 'stasis') {
      Object.assign(ev, { x: Math.round(u.x), y: Math.round(u.y), tm: u.team });
    } else if (u.ability === 'drone') {
      u.droneT = 8;
    }
    u.abCd = A.cd;
    if (u.local) M.stats.abilities++;
    onAbEv(ev, true); queue(ev);
  }
  function onAbEv(ev, self) {
    const u = M.units.get(ev.o);
    const near = u && onScreen(u.x, u.y, 100);
    if (ev.k === 'echo') { if (near) Sfx.play('echo'); if (u) ring(u.x, u.y, 60, '#4de3ff'); }
    else if (ev.k === 'blink') {
      M.decoys.push({ x: ev.x0, y: ev.y0, t: 3, team: ev.tm, skin: u ? u.skin : 'ion', weapon: u ? u.weapon : 'pulse', ang: u ? u.ang : 0 });
      for (let i = 0; i < 16; i++) { const f = i / 16; part(U.lerp(ev.x0, ev.x1, f), U.lerp(ev.y0, ev.y1, f), U.rand(-40, 40), U.rand(-40, 40), 0.4, '#c38bff', 3); }
      if (near) Sfx.play('dash');
    } else if (ev.k === 'mirror') { if (u && !self) u.mirrorT = 1.6; if (near) Sfx.play('ability'); }
    else if (ev.k === 'stasis') { M.fields.push({ kind: 'stasis', x: ev.x, y: ev.y, r: 150, t: 3.5, max: 3.5, team: ev.tm }); if (near) Sfx.play('ability'); }
    else if (ev.k === 'drone') { if (u && !self) u.droneT = 8; if (near) Sfx.play('ability'); }
  }
  function recordHist(u) {
    if (!u.alive) { u.shotFlag = false; return; }
    u.hist.push({ x: u.x, y: u.y, a: u.ang, s: u.shotFlag });
    u.shotFlag = false;
    if (u.hist.length > HIST) u.hist.shift();
  }
  function updateGhost(u) {
    const g = u.ghost; if (!g) return;
    const f = g.f[g.i++];
    if (!f || !u.alive) { u.ghost = null; u.gpos = null; return; }
    u.gpos = f;
    if (f.s && u.weapon) {
      const ev = { t: 'sh', o: u.id, w: u.weapon, lv: u.wlv, x: Math.round(f.x + Math.cos(f.a) * 22), y: Math.round(f.y + Math.sin(f.a) * 22), a: +f.a.toFixed(3), s: (Math.random() * 1e9) | 0, m: +((u.odT > 0 ? 1.5 : 1) * u.dmgMul).toFixed(2), g: 1 };
      spawnShot(ev); queue(ev);
    }
  }
  function updateDrone(u, dt) {
    if (u.droneT <= 0) return;
    u.droneT -= dt; u.droneCd -= dt;
    if (u.droneCd <= 0 && u.alive) {
      const dp = dronePos(u);
      const t = nearestEnemy({ x: dp.x, y: dp.y, team: u.team }, 520, true);
      if (t) {
        u.droneCd = 0.4;
        const a = Math.atan2(t.y - dp.y, t.x - dp.x);
        const ev = { t: 'sh', o: u.id, w: 'drone', lv: 1, x: Math.round(dp.x), y: Math.round(dp.y), a: +a.toFixed(3), s: (Math.random() * 1e9) | 0, m: 1 };
        spawnShot(ev); queue(ev);
      }
    }
  }
  const dronePos = (u) => ({ x: u.x + Math.cos(M.time * 3) * 46, y: u.y + Math.sin(M.time * 3) * 46 });

  function updateFields(dt) {
    for (let i = M.fields.length - 1; i >= 0; i--) { const f = M.fields[i]; f.t -= dt; if (f.t <= 0) M.fields.splice(i, 1); }
    for (let i = M.wells.length - 1; i >= 0; i--) { const w = M.wells[i]; if (w.map) continue; w.t -= dt; if (w.t <= 0) M.wells.splice(i, 1); }
    for (let i = M.decoys.length - 1; i >= 0; i--) { const d = M.decoys[i]; d.t -= dt; if (d.t <= 0) M.decoys.splice(i, 1); }
  }

  // ---------- pickups ----------
  function spawnPickup(k, x, y, v) {
    x = U.clamp(x, 40, WORLD_W - 40); y = U.clamp(y, 40, WORLD_H - 40);
    const ev = { t: 'pu', id: 'p' + (++M.pid) + '_' + ((Math.random() * 1e4) | 0), k, x: Math.round(x), y: Math.round(y), v: v || 0 };
    onPuEv(ev); queue(ev);
  }
  function onPuEv(ev) { M.pickups.set(ev.id, { id: ev.id, k: ev.k, x: ev.x, y: ev.y, v: ev.v, t: 0 }); }
  function updatePickups(dt) {
    for (const p of M.pickups.values()) {
      p.t += dt;
      for (const u of M.list) {
        if (!u.alive || !owns(u)) continue;
        if (p.k === 'coin' && M.mode.rules === 'pve' && u.kind !== 'pilot') continue;
        if (u.kind !== 'pilot' && p.k !== 'coin') continue;
        const R = u.r + 14 + (u.kind === 'pilot' ? u.mag : 0) * (p.k === 'coin' ? 1 : 0.3);
        const d = U.dist(u.x, u.y, p.x, p.y);
        if (d < R) {
          if (d > u.r + 10) { p.x += ((u.x - p.x) / d) * 420 * dt; p.y += ((u.y - p.y) / d) * 420 * dt; continue; }
          takePickup(u, p); break;
        }
      }
    }
    if (M.time % 1 < DT && M.pickups.size > 40) { const first = M.pickups.keys().next().value; M.pickups.delete(first); }
  }
  function takePickup(u, p) {
    M.pickups.delete(p.id);
    const ev = { t: 'pt', id: p.id, by: u.id };
    queue(ev);
    if (p.k === 'hp') { u.hp = Math.min(u.maxHp, u.hp + 40); }
    else if (p.k === 'od') { u.odT = 8; }
    else if (p.k === 'sh') { u.shield = 50; }
    else if (p.k === 'coin') {
      if (M.mode.score === 'coins') u.coins += p.v;
      if (u.local) M.stats.coinsPicked += p.v;
    }
    if (u.local) {
      Sfx.play(p.k === 'coin' ? 'coin' : 'pickup');
      const label = { hp: '+40 HP', od: 'OVERDRIVE', sh: 'SHIELD', coin: '+' + p.v }[p.k];
      text(u.x, u.y - 30, label, p.k === 'coin' ? '#ffe066' : '#9dff6a', 1);
    }
  }

  // ---------- AI ----------
  const pref = { pulse: 300, scatter: 140, needle: 240, lance: 480, mortar: 360, prism: 300, swarm: 360, singularity: 330 };
  function think(u, dt) {
    if (u.kind === 'boss') return bossThink(u, dt);
    const br = u.brain, D = M.diff;
    br.t -= dt;
    if (br.t <= 0) {
      br.t = D.react * U.rand(0.7, 1.3);
      // target selection
      let best = null, bs = 1e9;
      for (const v of M.list) {
        if (!v.alive || !isEnemy(u, v)) continue;
        const d = U.dist(u.x, u.y, v.x, v.y);
        const s = d * (los(u.x, u.y, v.x, v.y) ? 1 : 1.8) * (v.hp < v.maxHp * 0.4 ? 0.8 : 1);
        if (s < bs) { bs = s; best = v; }
      }
      for (const dc of M.decoys) if (dc.team !== u.team) { const s = U.dist(u.x, u.y, dc.x, dc.y) * 0.6; if (s < bs) { bs = s; best = { x: dc.x, y: dc.y, vx: 0, vy: 0, alive: true, decoy: true, r: 18 }; } }
      br.target = best;
      chooseMove(u);
      // stuck detection
      if (U.dist(u.x, u.y, br.lx, br.ly) < 6 && (br.mx || br.my)) br.stuckT += br.t; else br.stuckT = 0;
      br.lx = u.x; br.ly = u.y;
      if (br.stuckT > 0.8) { br.wander = 0.7; br.wa = Math.random() * Math.PI * 2; br.stuckT = 0; }
      if (Math.random() < 0.08) br.strafe *= -1;
    }
    if (br.wander > 0) { br.wander -= dt; br.mx = Math.cos(br.wa); br.my = Math.sin(br.wa); }
    const t = br.target;
    if (!t) return;
    const d = U.dist(u.x, u.y, t.x, t.y);
    // kamikaze
    if (u.etype === 'bomber') {
      if (d < u.r + (t.r || 18) + 12) {
        const ev = { t: 'boom', o: u.id, x: Math.round(u.x), y: Math.round(u.y), r: 75, d: Math.round(38 * M.diff.hp) };
        onBoomEv(ev); queue(ev);
        damage(u, 9999, null, {});
      }
      return;
    }
    // aim with lead
    const w = wdef(u.weapon);
    let aimX = t.x, aimY = t.y;
    if (w) { const tt = d / w.spd; aimX += (t.vx || 0) * tt * 0.8; aimY += (t.vy || 0) * tt * 0.8; }
    let want = Math.atan2(aimY - u.y, aimX - u.x);
    let canShoot = los(u.x, u.y, t.x, t.y);
    if (M.mode.bankOnly) { const bk = bankAim(u, t); if (bk != null) { want = bk; canShoot = true; } else canShoot = false; }
    br.aim = want + (Math.sin(M.time * 2.3 + u.x) * D.aimErr);
    u.ang += U.angDiff(u.ang, br.aim) * Math.min(1, dt * 10);
    const range = (w ? w.range : 300) * 1.2;
    if (canShoot && d < range && u.heat < 86 && Math.abs(U.angDiff(u.ang, br.aim)) < 0.4) tryFire(u, u.ang);
    if (u.kind === 'pilot') {
      if (u.heat > 62 && d < 125) doVent(u);
      if (u.ability && u.abCd <= 0 && Math.random() < 0.02) {
        const ab = u.ability;
        if ((ab === 'echo' && canShoot && u.hist.length > 90) || (ab === 'drone' && d < 500) || (ab === 'blink' && u.hp < u.maxHp * 0.4) ||
          (ab === 'mirror' && br.threat) || (ab === 'stasis' && br.threat)) useAbility(u);
      }
    }
    if (br.threat && u.dashCd <= 0 && Math.random() < D.dodge * 0.25) {
      const a = br.threatA + Math.PI / 2 * br.strafe;
      u.brain.mx = Math.cos(a); u.brain.my = Math.sin(a); doDash(u);
    }
  }
  function chooseMove(u) {
    const br = u.brain, t = br.target;
    const w = u.weapon || 'pulse';
    const want = u.etype === 'bomber' ? 0 : (pref[w] || 300);
    let bestS = -1e9, bx = 0, by = 0;
    // incoming bullet threat
    br.threat = false;
    for (const b of M.bullets) {
      if (b.team === u.team) continue;
      const dx = u.x - b.x, dy = u.y - b.y;
      if (dx * dx + dy * dy > 260 * 260) continue;
      const vv = b.vx * b.vx + b.vy * b.vy; if (!vv) continue;
      const tt = (dx * b.vx + dy * b.vy) / vv;
      if (tt < 0 || tt > 0.6) continue;
      const cx2 = b.x + b.vx * tt - u.x, cy2 = b.y + b.vy * tt - u.y;
      if (cx2 * cx2 + cy2 * cy2 < (u.r + b.r + 10) ** 2) { br.threat = true; br.threatA = Math.atan2(b.vy, b.vx); break; }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let s = 0;
      if (t) {
        const tx = t.x - u.x, ty = t.y - u.y, d = Math.hypot(tx, ty) || 1;
        const dot = (dx * tx + dy * ty) / d;
        if (d > want + 40) s += dot * 1.4; else if (d < want - 60) s -= dot * 1.1;
        s += ((-ty * dx + tx * dy) / d) * 0.7 * br.strafe;
      }
      if (M.mode.zone && u.kind === 'pilot') { const zx = M.zone[0] - u.x, zy = M.zone[1] - u.y, zd = Math.hypot(zx, zy) || 1; if (zd > M.zone[2] * 0.6) s += ((dx * zx + dy * zy) / zd) * 1.3; }
      if (M.mode.score === 'coins') {
        let cp = null, cd = 500;
        for (const p of M.pickups.values()) { if (p.k !== 'coin') continue; const d = U.dist(u.x, u.y, p.x, p.y); if (d < cd) { cd = d; cp = p; } }
        if (cp) s += ((dx * (cp.x - u.x) + dy * (cp.y - u.y)) / (cd || 1)) * 1.2;
      }
      if (br.threat) s += Math.abs(Math.sin(a - br.threatA)) * 1.4;
      for (const step of [30, 60]) { if (M.walls.some((w2) => U.circleRect(u.x + dx * step, u.y + dy * step, u.r + 4, w2))) s -= step === 30 ? 4 : 1.6; }
      for (const v of M.list) if (v !== u && v.alive && !isEnemy(u, v)) { const d = U.dist(u.x + dx * 30, u.y + dy * 30, v.x, v.y); if (d < 50) s -= 0.6; }
      for (const wl of M.wells) if (wl.map && U.dist(u.x + dx * 40, u.y + dy * 40, wl.x, wl.y) < 90) s -= 1;
      s += Math.random() * 0.2;
      if (s > bestS) { bestS = s; bx = dx; by = dy; }
    }
    br.mx = bx; br.my = by;
    if (t && !t.decoy && U.dist(u.x, u.y, t.x, t.y) > want - 60 && U.dist(u.x, u.y, t.x, t.y) < want + 40 && Math.random() < 0.3) { br.mx *= 0.4; br.my *= 0.4; }
  }
  // Aim at the mirror image of the target across arena edges and long walls
  function bankAim(u, t) {
    let best = null, bd = 1300;
    const lines = [['x', 0], ['x', WORLD_W], ['y', 0], ['y', WORLD_H]];
    for (const w of M.walls) {
      if (w.crystal || w.x < 0 || w.y < 0 || w.x >= WORLD_W || w.y >= WORLD_H) continue;
      if (w.w > 80) { lines.push(['y', w.y, w]); lines.push(['y', w.y + w.h, w]); }
      if (w.h > 80) { lines.push(['x', w.x, w]); lines.push(['x', w.x + w.w, w]); }
    }
    for (const [ax, c, w] of lines) {
      const mx = ax === 'x' ? 2 * c - t.x : t.x, my = ax === 'y' ? 2 * c - t.y : t.y;
      // intersection of u->mirror with the line
      const k = ax === 'x' ? (c - u.x) / (mx - u.x) : (c - u.y) / (my - u.y);
      if (!(k > 0 && k < 1)) continue;
      const px = u.x + (mx - u.x) * k, py = u.y + (my - u.y) * k;
      if (w && (px < w.x - 2 || px > w.x + w.w + 2 || py < w.y - 2 || py > w.y + w.h + 2)) continue;
      const ix = px - (ax === 'x' ? Math.sign(mx - u.x) * 8 : 0), iy = py - (ax === 'y' ? Math.sign(my - u.y) * 8 : 0);
      if (!los(u.x, u.y, ix, iy) || !los(ix, iy, t.x, t.y)) continue;
      const d = U.dist(u.x, u.y, mx, my);
      if (d < bd) { bd = d; best = Math.atan2(my - u.y, mx - u.x); }
    }
    return best;
  }
  function onBoomEv(ev) {
    ring(ev.x, ev.y, ev.r, '#ffe066');
    if (onScreen(ev.x, ev.y, 120)) { Sfx.play('boom'); shake(8); }
    for (let i = 0; i < 20; i++) part(ev.x, ev.y, U.rand(-300, 300), U.rand(-300, 300), 0.5, U.pick(['#ffe066', '#ff6b6b']), 3);
    const src = M.units.get(ev.o);
    for (const v of M.list) {
      if (!v.alive || !owns(v) || v.id === ev.o || (src && !isEnemy(src, v))) continue;
      if (U.dist(v.x, v.y, ev.x, ev.y) < ev.r + v.r) damage(v, ev.d, ev.o, {});
    }
  }

  // ---------- bosses ----------
  function bossShot(u, w, a, m) {
    const ev = { t: 'sh', o: u.id, w, lv: 1, x: Math.round(u.x + Math.cos(a) * u.r), y: Math.round(u.y + Math.sin(a) * u.r), a: +a.toFixed(3), s: (Math.random() * 1e9) | 0, m: m || 1 };
    spawnShot(ev); queue(ev);
  }
  function bossThink(u, dt) {
    const br = u.brain;
    br.t -= dt; br.pattern -= dt;
    if (br.t <= 0) { br.t = 0.3; br.target = nearestEnemy(u, 3000, false); chooseMove(u); br.mx *= 0.8; br.my *= 0.8; }
    const t = br.target; if (!t) return;
    const aim = Math.atan2(t.y - u.y, t.x - u.x);
    u.ang = aim;
    const hpMul = M.diff.hp;
    const rage = u.hp < u.maxHp * 0.4 ? 1.4 : 1;
    if (u.bossId === 'warden') {
      if (br.pattern <= 0) { br.pattern = 2.2 / rage; const n = 14; const off = Math.random(); for (let i = 0; i < n; i++) bossShot(u, 'boss', off + (i / n) * Math.PI * 2, hpMul); Sfx.play('boss'); }
      if (u.fireCd <= 0) { u.fireCd = 0.9 / rage; for (const da of [-0.2, 0, 0.2]) bossShot(u, 'boss', aim + da, hpMul); }
    } else if (u.bossId === 'hydra') {
      br.spin += dt * 2.2 * rage;
      if (u.fireCd <= 0) { u.fireCd = 0.11; bossShot(u, 'boss', br.spin, hpMul * 0.8); bossShot(u, 'boss', br.spin + Math.PI, hpMul * 0.8); }
      if (br.pattern <= 0) { br.pattern = 7; for (let i = 0; i < 2; i++) spawnEnemy('drone', u.x + U.rand(-80, 80), u.y + U.rand(-80, 80)); }
    } else if (u.bossId === 'mking') {
      if (br.pattern <= 0) { br.pattern = 6 / rage; u.mirrorT = 2; queue({ t: 'ab', o: u.id, k: 'mirror' }); }
      if (u.fireCd <= 0) { u.fireCd = 1.1 / rage; bossShot(u, 'bossl', aim, hpMul); bossShot(u, 'bossl', aim + 0.25, hpMul); bossShot(u, 'bossl', aim - 0.25, hpMul); }
    } else if (u.bossId === 'sing') {
      if (br.pattern <= 0) { br.pattern = 4.2 / rage; bossShot(u, 'singularity', aim, hpMul * 1.3); }
      if (u.fireCd <= 0) { u.fireCd = 2.4 / rage; for (const da of [-0.4, 0, 0.4]) bossShot(u, 'mortar', aim + da, hpMul * 0.7); }
      if (!u.wellOn) { u.wellOn = true; M.wells.push({ x: u.x, y: u.y, R: 380, str: 1, t: 1e9, team: 1, follow: u }); }
    }
    for (const w of M.wells) if (w.follow === u) { w.x = u.x; w.y = u.y; if (!u.alive) w.t = 0; }
  }

  // ---------- host-side mode logic ----------
  function spawnEnemy(etype, x, y) {
    const scale = (1 + M.wave * 0.09) * M.diff.hp * (1 + (humans().length - 1) * 0.35);
    const id = 'e' + (++M.eid);
    const u = makeEnemy(id, etype, scale);
    if (x == null) { const sp = edgeSpawn(); x = sp[0]; y = sp[1]; }
    u.x = x; u.y = y; u.inv = 0.6;
    M.units.set(id, u); M.list.push(u);
    return u;
  }
  function edgeSpawn() {
    let best = null, bs = -1;
    for (let i = 0; i < 10; i++) {
      const s = U.pick(M.spawns);
      let md = 1e9; for (const h of humans()) if (h.alive) md = Math.min(md, U.dist(s[0], s[1], h.x, h.y));
      if (md > bs && md < 2000) { bs = md; best = s; }
    }
    return best || M.spawns[0];
  }
  const humans = () => M.list.filter((u) => u.kind === 'pilot' && !u.isBot);
  function startWave() {
    M.wave++;
    const isBossWave = M.mode.bossRush || M.wave % 5 === 0;
    M.queue = [];
    if (isBossWave) {
      const idx = M.mode.bossRush ? M.wave - 1 : (M.wave / 5 - 1) % BOSSES.length;
      const bdef = BOSSES[idx];
      const scale = M.diff.hp * (1 + (humans().length - 1) * 0.6) * (M.mode.bossRush ? 1 : 1 + Math.floor((M.wave - 1) / 20) * 0.5);
      const id = 'B' + (++M.eid);
      const u = makeBoss(id, bdef.id, scale);
      const sp = edgeSpawn(); u.x = sp[0]; u.y = sp[1];
      M.units.set(id, u); M.list.push(u);
      const ev = { t: 'cl', s: bdef.name.toUpperCase(), c: bdef.color }; onCallEv(ev); queue(ev);
      for (let i = 0; i < Math.min(6, 1 + M.wave / 4); i++) M.queue.push('drone');
    } else {
      const n = 4 + M.wave * 2 + (humans().length - 1) * 2;
      const types = Object.keys(ENEMIES).filter((k) => ENEMIES[k].from <= M.wave);
      for (let i = 0; i < n; i++) M.queue.push(i < 3 ? 'drone' : U.pick(types));
      const ev = { t: 'cl', s: 'WAVE ' + M.wave, c: '#4de3ff' }; onCallEv(ev); queue(ev);
    }
    M.waveState = 'fight'; M.spawnT = 0.5;
    Sfx.play('wave');
  }
  function hostLogic(dt) {
    if (M.over) return;
    const mode = M.mode;
    // periodic power-ups in versus modes
    if (mode.rules !== 'pve') {
      M.puT -= dt;
      if (M.puT <= 0) {
        M.puT = 9;
        const pus = [...M.pickups.values()].filter((p) => p.k !== 'coin').length;
        if (pus < 4) { const s = U.pick(M.spawns); spawnPickup(U.pick(['hp', 'hp', 'od', 'sh']), s[0], s[1]); }
      }
    }
    if (mode.score === 'coins') {
      M.coinT = (M.coinT || 0) - dt;
      const coins = [...M.pickups.values()].filter((p) => p.k === 'coin').length;
      if (M.coinT <= 0 && coins < 18) { M.coinT = 0.9; const s = U.pick(M.spawns); spawnPickup('coin', s[0], s[1], Math.random() < 0.12 ? 60 : U.randi(10, 25)); }
    }
    if (mode.zone) {
      M.zoneT = (M.zoneT || 0) - dt;
      if (M.zoneT <= 0) {
        M.zoneT = 1;
        const inside = M.list.filter((u) => u.alive && u.kind === 'pilot' && U.dist(u.x, u.y, M.zone[0], M.zone[1]) < M.zone[2]);
        M.zoneOwner = inside.length === 1 ? inside[0].id : (inside.length ? 'contested' : null);
        if (inside.length === 1) inside[0].pts++;
      }
    }
    if (mode.rules === 'pve') {
      const hs = humans();
      if (M.waveState === 'pre' || M.waveState === 'inter') {
        M.waveT -= dt;
        if (M.waveT <= 0) startWave();
      } else if (M.waveState === 'fight') {
        M.spawnT -= dt;
        const alive = M.list.filter((u) => u.kind !== 'pilot' && u.alive).length;
        if (M.queue.length && M.spawnT <= 0 && alive < 14) { M.spawnT = 0.55; spawnEnemy(M.queue.shift()); }
        if (!M.queue.length && alive === 0) {
          if (mode.bossRush && M.wave >= BOSSES.length) return endMatch({ win: true, reason: 'All titans down' });
          M.waveState = 'inter'; M.waveT = 4;
          const ev = { t: 'wave', w: M.wave }; onWaveEv(ev); queue(ev);
        }
      }
      if (hs.length && hs.every((h) => !h.alive)) endMatch({ win: false, reason: mode.bossRush ? 'Squad wiped' : 'Overrun on wave ' + M.wave });
    } else {
      if (mode.time) {
        M.timeLeft -= dt;
        if (M.timeLeft <= 0) { M.timeLeft = 0; return endMatch(leader('Time up')); }
      }
      if (mode.target) {
        if (mode.rules === 'teams') { const ts = teamScores(); if (ts[0] >= mode.target || ts[1] >= mode.target) return endMatch(leader('Score limit')); }
        else if (M.list.some((u) => score(u) >= mode.target)) return endMatch(leader('Score limit'));
      }
    }
    M.sbT -= dt;
    if (M.sbT <= 0 && M.net) {
      M.sbT = 0.5;
      M.outbox.push({ t: 'sb', tl: Math.round(M.timeLeft), w: M.wave, ws: M.waveState, zo: M.zoneOwner || null, u: M.list.filter((u) => u.kind === 'pilot').map((u) => [u.id, u.kills, u.deaths, u.pts, u.coins]) });
    }
  }
  function onWaveEv(ev) {
    callout('WAVE ' + ev.w + ' CLEARED', '#9dff6a', 1.1);
    Sfx.play('level');
    for (const u of M.list) {
      if (u.kind !== 'pilot' || !owns(u)) continue;
      if (!u.alive) respawn(u); else u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.35);
    }
    if (M.isHost) { M.wave = ev.w; M.waveState = 'inter'; M.waveT = 4; }
  }
  function onCallEv(ev) { callout(ev.s, ev.c, 1.3); }
  const score = (u) => M.mode.score === 'points' ? u.pts : M.mode.score === 'coins' ? u.coins : u.kills;
  function teamScores() {
    const ts = [0, 0];
    for (const u of M.list) if (u.kind === 'pilot' && (u.team === 0 || u.team === 1)) ts[u.team] += u.kills;
    return ts;
  }
  function leader(reason) {
    if (M.mode.rules === 'teams') {
      const ts = teamScores();
      return { winTeam: ts[0] === ts[1] ? -1 : ts[0] > ts[1] ? 0 : 1, reason };
    }
    const ps = M.list.filter((u) => u.kind === 'pilot').sort((a, b) => score(b) - score(a));
    return { winner: ps[0] ? ps[0].id : null, reason };
  }
  function endMatch(res) {
    if (M.over) return;
    res.wave = M.wave;
    res.board = M.list.filter((u) => u.kind === 'pilot').map((u) => ({ id: u.id, name: u.name, team: u.team, isBot: u.isBot, kills: u.kills, deaths: u.deaths, pts: u.pts, coins: u.coins, skin: u.skin, weapon: u.weapon }));
    const ev = { t: 'end', res };
    queue(ev); if (M.net) sendPacket();
    onEndEv(ev);
  }
  function onEndEv(ev) {
    if (M.over) return;
    M.over = true;
    const res = ev.res;
    // rebuild local view of final board
    const me = M.units.get(M.localId);
    const board = res.board.slice().sort((a, b) => (M.mode.score === 'points' ? b.pts - a.pts : M.mode.score === 'coins' ? b.coins - a.coins : b.kills - a.kills));
    const place = board.findIndex((b) => b.id === M.localId) + 1;
    let won = false;
    if (M.mode.rules === 'teams') won = me && res.winTeam === me.team;
    else if (M.mode.rules === 'ffa') won = res.winner === M.localId;
    else won = !!res.win;
    const out = {
      mode: M.modeId, map: M.mapId, diff: M.diffId, online: M.net, won, draw: res.winTeam === -1, place, total: board.length, board,
      reason: res.reason, wave: res.wave, stats: Object.assign({}, M.stats), myCoins: me ? me.coins : 0, team: me ? me.team : null, winTeam: res.winTeam, winner: res.winner,
    };
    setTimeout(() => { const cb = onEnd; exitKeepRoom(); if (cb) cb(out); }, 1600);
    callout(won ? 'VICTORY' : (M.mode.rules === 'pve' && !won ? 'GAME OVER' : 'DEFEAT'), won ? '#ffe066' : '#ff6b6b', 2);
    Sfx.play(won ? 'win' : 'lose');
  }
  function exitKeepRoom() { stop(); Net.Room.inGame = false; Net.setStatus('online'); }

  // ---------- networking ----------
  function queue(ev) { if (M && M.net) M.outbox.push(ev); }
  function sendPacket() {
    const me = M.units.get(M.localId);
    const pk = { t: 'pk' };
    if (me) {
      pk.s = [Math.round(me.x), Math.round(me.y), +me.ang.toFixed(2), Math.round(me.hp), me.maxHp, me.alive ? 1 : 0, Math.round(me.heat), (me.mirrorT > 0 ? 1 : 0) | (me.droneT > 0 ? 2 : 0) | (me.shield > 0 ? 4 : 0) | (me.odT > 0 ? 8 : 0) | (me.overT > 0 ? 16 : 0), me.coins];
      if (me.gpos) pk.s.push(Math.round(me.gpos.x), Math.round(me.gpos.y), +me.gpos.a.toFixed(2));
    }
    if (M.isHost) {
      pk.b = [];
      for (const u of M.list) {
        if (!u.isBot) continue;
        const k = u.kind === 'pilot' ? 'p' : u.kind === 'boss' ? 'B' + u.bossId : 'e' + u.etype;
        const row = [u.id, Math.round(u.x), Math.round(u.y), +u.ang.toFixed(2), Math.round(u.hp), u.maxHp, u.alive ? 1 : 0, k, (u.mirrorT > 0 ? 1 : 0) | (u.droneT > 0 ? 2 : 0)];
        if (u.gpos) row.push(Math.round(u.gpos.x), Math.round(u.gpos.y), +u.gpos.a.toFixed(2));
        pk.b.push(row);
      }
    }
    if (M.outbox.length) { pk.e = M.outbox; M.outbox = []; }
    Net.Room.send(pk);
  }
  function onNet(d) {
    if (!M) return;
    if (d.t === 'join') { // host only: a player joined mid-match
      if (!M.isHost) return;
      if (M.units.has(d.f)) return;
      const r = Object.assign({}, d.p, { isBot: false });
      if (M.mode.rules === 'pve') r.team = 0;
      else if (M.mode.rules === 'teams') { const ts = [0, 0]; M.list.forEach((u) => { if (u.kind === 'pilot' && u.team < 2) ts[u.team]++; }); r.team = ts[0] <= ts[1] ? 0 : 1; }
      else r.team = 100 + M.roster.length + Math.floor(Math.random() * 1000);
      M.roster.push(r);
      addPilot(r);
      const ev = { t: 'add', r }; queue(ev);
      Net.Room.publishMeta(Object.assign({}, M.cfg, { roster: M.roster }));
      return;
    }
    if (d.t === 'leave') { if (M.units.has(d.f)) removeUnit(d.f); return; }
    if (d.t !== 'pk') return;
    const now = performance.now();
    // events first, so a kill event lands before the state row that shows the unit dead
    if (d.e) for (const ev of d.e) { handleEv(ev, d.f); if (!M) return; }
    if (d.s) {
      let u = M.units.get(d.f);
      if (u && !u.local) applyState(u, d.s, now);
    }
    if (d.b && !M.isHost) {
      const seen = new Set();
      for (const row of d.b) {
        let u = M.units.get(row[0]);
        if (!u) {
          const k = row[7];
          if (k[0] === 'e' && ENEMIES[k.slice(1)]) u = makeEnemy(row[0], k.slice(1), 1);
          else if (k[0] === 'B') u = makeBoss(row[0], k.slice(1), 1);
          if (!u) continue;
          u.x = row[1]; u.y = row[2];
          M.units.set(u.id, u); M.list.push(u);
        }
        seen.add(u.id);
        u.tx = row[1]; u.ty = row[2]; u.tang = row[3]; u.hp = row[4]; u.maxHp = row[5];
        const al = !!row[6];
        if (al && !u.alive) { u.alive = true; u.x = u.tx; u.y = u.ty; }
        if (!al && u.alive) u.alive = false;
        u.mirrorT = row[8] & 1 ? Math.max(u.mirrorT, 0.15) : u.mirrorT;
        u.droneT = row[8] & 2 ? Math.max(u.droneT, 0.15) : 0;
        u.gpos = row.length > 9 ? { x: row[9], y: row[10], a: row[11] } : null;
      }
      // drop AI units the host no longer has
      for (const u of M.list.slice()) if (u.isBot && u.kind !== 'pilot' && !seen.has(u.id)) removeUnit(u.id);
    }
  }
  function applyState(u, s, now) {
    u.tx = s[0]; u.ty = s[1]; u.tang = s[2]; u.hp = s[3]; u.maxHp = s[4];
    const al = !!s[5];
    if (al && !u.alive) { u.alive = true; u.x = s[0]; u.y = s[1]; u.inv = 1.5; }
    else if (!al && u.alive) { u.alive = false; }
    u.heat = s[6];
    const fl = s[7];
    u.mirrorT = fl & 1 ? Math.max(u.mirrorT, 0.15) : 0;
    u.droneT = fl & 2 ? Math.max(u.droneT, 0.15) : 0;
    u.shield = fl & 4 ? 1 : 0; u.odT = fl & 8 ? 0.2 : 0; u.overT = fl & 16 ? 0.2 : 0;
    u.coins = s[8] || 0;
    u.gpos = s.length > 9 ? { x: s[9], y: s[10], a: s[11] } : null;
    u.lastNet = now;
  }
  function handleEv(ev, from) {
    switch (ev.t) {
      case 'sh': spawnShot(ev); break;
      case 'hit': onHitEv(ev); break;
      case 'kill': onKillEv(ev); break;
      case 'vent': onVentEv(ev); break;
      case 'ab': onAbEv(ev, false); break;
      case 'boom': onBoomEv(ev); break;
      case 'pu': onPuEv(ev); break;
      case 'pt': { M.pickups.delete(ev.id); break; }
      case 'drop': onDropEv(ev); break;
      case 'wave': onWaveEv(ev); break;
      case 'cl': onCallEv(ev); break;
      case 'add': if (!M.units.has(ev.r.id)) { M.roster.push(ev.r); addPilot(ev.r); } break;
      case 'sb':
        M.timeLeft = ev.tl; M.wave = ev.w; M.waveState = ev.ws; M.zoneOwner = ev.zo;
        for (const [id, k, dd, p, c] of ev.u) { const u = M.units.get(id); if (!u) continue; u.kills = k; u.deaths = dd; u.pts = p; if (!u.local) u.coins = c; }
        break;
      case 'end': if (from === Net.Room.hostId) onEndEv(ev); break;
    }
  }

  // ---------- effects ----------
  function part(x, y, vx, vy, life, col, size) {
    if (M.parts.length > 700) M.parts.shift();
    M.parts.push({ x, y, vx, vy, life, max: life, col, size });
  }
  function ring(x, y, r, col) { M.parts.push({ ring: true, x, y, r, life: 0.4, max: 0.4, col }); }
  function text(x, y, s, col, scale) { M.texts.push({ x, y, s, col, life: 0.9, scale: scale || 1 }); }
  function callout(s, col, scale) { M.callouts.push({ s, col, life: 1.6, scale: scale || 1 }); if (M.callouts.length > 3) M.callouts.shift(); }
  function feed(a, b, bank, ghost, k) { M.feed.unshift({ a, b, bank, ghost, life: 5, mine: k && k.id === M.localId }); if (M.feed.length > 5) M.feed.pop(); }
  function shake(n) { if (Profile.p.settings.shake) cam.shake = Math.min(18, cam.shake + n); }
  function onScreen(x, y, pad) {
    const hw = VW / 2 / zoom + pad, hh = VH / 2 / zoom + pad;
    return Math.abs(x - cam.x) < hw && Math.abs(y - cam.y) < hh;
  }
  function updateParts(dt) {
    for (let i = M.parts.length - 1; i >= 0; i--) {
      const p = M.parts[i]; p.life -= dt;
      if (p.life <= 0) { M.parts.splice(i, 1); continue; }
      if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    }
    for (let i = M.texts.length - 1; i >= 0; i--) { const t = M.texts[i]; t.life -= dt; t.y -= 40 * dt; if (t.life <= 0) M.texts.splice(i, 1); }
    for (let i = M.callouts.length - 1; i >= 0; i--) { const c = M.callouts[i]; c.life -= dt; if (c.life <= 0) M.callouts.splice(i, 1); }
    for (let i = M.feed.length - 1; i >= 0; i--) { const f = M.feed[i]; f.life -= dt; if (f.life <= 0) M.feed.splice(i, 1); }
    M.hurtT = Math.max(0, M.hurtT - dt);
  }

  // ---------- rendering ----------
  function buildMapCanvas() {
    const q = Profile.p.settings.quality === 'low' ? 0.75 : 1;
    const c = document.createElement('canvas'); c.width = WORLD_W * q; c.height = WORLD_H * q;
    const x = c.getContext('2d'); x.scale(q, q);
    const md = M.mapDef;
    x.fillStyle = md.floor; x.fillRect(0, 0, WORLD_W, WORLD_H);
    // hex floor plates
    x.strokeStyle = 'rgba(255,255,255,0.035)'; x.lineWidth = 1;
    const s = 46, h = s * Math.sqrt(3) / 2;
    for (let yy = 0; yy < WORLD_H + s; yy += h) {
      for (let xx = 0; xx < WORLD_W + s; xx += s * 1.5) {
        const ox = xx + ((Math.round(yy / h) % 2) ? s * 0.75 : 0);
        x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.lineTo(ox + Math.cos(a) * s / 2, yy + Math.sin(a) * s / 2); } x.closePath(); x.stroke();
      }
    }
    // rift scars
    const rng = U.rng(M.seed + 7);
    x.strokeStyle = md.accent; x.globalAlpha = 0.07; x.lineWidth = 3;
    for (let i = 0; i < 9; i++) { x.beginPath(); let px = rng() * WORLD_W, py = rng() * WORLD_H; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rng() - 0.5) * 260; py += (rng() - 0.5) * 260; x.lineTo(px, py); } x.stroke(); }
    x.globalAlpha = 1;
    // arena edge
    x.strokeStyle = md.accent; x.lineWidth = 4; x.globalAlpha = 0.6; x.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4); x.globalAlpha = 1;
    // static walls
    for (const w of M.walls) {
      if (w.crystal || w.x < 0 || w.y < 0 || w.x >= WORLD_W || w.y >= WORLD_H) continue;
      x.fillStyle = '#1c2045'; x.fillRect(w.x, w.y, w.w, w.h);
      x.save(); x.beginPath(); x.rect(w.x, w.y, w.w, w.h); x.clip();
      x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 6;
      for (let k = -w.h; k < w.w; k += 16) { x.beginPath(); x.moveTo(w.x + k, w.y + w.h); x.lineTo(w.x + k + w.h, w.y); x.stroke(); }
      x.restore();
      x.strokeStyle = md.accent; x.lineWidth = 2; x.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    }
    mapCanvas = c; mapCanvas.q = q;
  }

  function render(dt) {
    if (!M) return;
    const me = M.units.get(M.localId);
    // camera
    let fx = cam.x, fy = cam.y;
    if (me && me.alive) { fx = me.x + Math.cos(me.ang) * 40; fy = me.y + Math.sin(me.ang) * 40; }
    else {
      const k = M.list.find((u) => u.alive && u.name === M.killer) || M.list.find((u) => u.alive && u.kind === 'pilot');
      if (k) { fx = k.x; fy = k.y; }
    }
    cam.x += (fx - cam.x) * Math.min(1, dt * 6); cam.y += (fy - cam.y) * Math.min(1, dt * 6);
    const hw = VW / 2 / zoom, hh = VH / 2 / zoom;
    if (WORLD_W > hw * 2) cam.x = U.clamp(cam.x, hw - 60, WORLD_W - hw + 60); else cam.x = WORLD_W / 2;
    if (WORLD_H > hh * 2) cam.y = U.clamp(cam.y, hh - 60, WORLD_H - hh + 60); else cam.y = WORLD_H / 2;
    cam.shake *= Math.pow(0.02, dt);
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    const t = M.time;
    const c = cx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#05060f'; c.fillRect(0, 0, VW, VH);
    c.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (VW / 2 - (cam.x + sx) * zoom), dpr * (VH / 2 - (cam.y + sy) * zoom));
    c.drawImage(mapCanvas, 0, 0, mapCanvas.width, mapCanvas.height, 0, 0, WORLD_W, WORLD_H);
    // wells
    for (const w of M.wells) {
      const R = w.map ? 120 : w.R * 0.5;
      c.save(); c.translate(w.x, w.y);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        c.rotate(t * (1.4 + i * 0.4));
        c.strokeStyle = w.map ? M.mapDef.accent : '#ff6b6b'; c.globalAlpha = 0.18 + i * 0.08; c.lineWidth = 3;
        c.beginPath(); for (let a = 0; a < 9; a += 0.25) c.lineTo(Math.cos(a) * a * R / 9, Math.sin(a) * a * R / 9); c.stroke();
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, w.map ? 16 : 9, 0, 7); c.fill();
      if (w.map) { c.globalAlpha = 0.12; c.strokeStyle = M.mapDef.accent; c.setLineDash([6, 10]); c.beginPath(); c.arc(0, 0, w.R, 0, 7); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
      c.restore();
    }
    // zone
    if (M.mode.zone) {
      const [zx, zy, zr] = M.zone;
      const own = M.zoneOwner === 'contested' ? '#ff6b6b' : M.zoneOwner ? (M.zoneOwner === M.localId ? '#9dff6a' : '#ffb347') : '#7d5cff';
      c.globalAlpha = 0.12 + Math.sin(t * 3) * 0.04; c.fillStyle = own; c.beginPath(); c.arc(zx, zy, zr, 0, 7); c.fill();
      c.globalAlpha = 0.8; c.strokeStyle = own; c.lineWidth = 3; c.setLineDash([14, 10]); c.lineDashOffset = -t * 30; c.beginPath(); c.arc(zx, zy, zr, 0, 7); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    }
    // crystals
    for (const w of M.walls) {
      if (!w.crystal) continue;
      const k = w.hp / w.max;
      c.fillStyle = `rgba(255,122,224,${0.18 + k * 0.25})`; c.fillRect(w.x, w.y, w.w, w.h);
      c.strokeStyle = '#ff9df0'; c.lineWidth = 2; c.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(w.x + 4, w.y + w.h * 0.3); c.lineTo(w.x + w.w * 0.4, w.y + 4); c.moveTo(w.x + w.w * 0.6, w.y + w.h - 4); c.lineTo(w.x + w.w - 4, w.y + w.h * 0.6); c.stroke();
      if (k < 0.6) { c.beginPath(); c.moveTo(w.x + w.w * 0.2, w.y + w.h * 0.8); c.lineTo(w.x + w.w * 0.5, w.y + w.h * 0.45); c.lineTo(w.x + w.w * 0.75, w.y + w.h * 0.6); c.stroke(); }
    }
    // stasis fields
    for (const f of M.fields) {
      c.globalAlpha = 0.12 * Math.min(1, f.t); c.fillStyle = '#9dff6a'; c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.fill();
      c.globalAlpha = 0.6 * Math.min(1, f.t); c.strokeStyle = '#9dff6a'; c.lineWidth = 2; c.setLineDash([5, 8]); c.lineDashOffset = t * 20; c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    }
    // pickups
    for (const p of M.pickups.values()) {
      const bob = Math.sin(t * 4 + p.x) * 3;
      c.save(); c.translate(p.x, p.y + bob);
      if (p.k === 'coin') {
        const big = p.v >= 50, s = big ? 13 : 8;
        c.rotate(t * 2); c.fillStyle = big ? '#fff1a8' : '#ffe066'; c.strokeStyle = '#ffb347'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.7, 0); c.lineTo(0, s); c.lineTo(-s * 0.7, 0); c.closePath(); c.fill(); c.stroke();
      } else {
        const col = { hp: '#9dff6a', od: '#ff4fa3', sh: '#4de3ff' }[p.k];
        c.globalAlpha = 0.25; c.fillStyle = col; c.beginPath(); c.arc(0, 0, 20, 0, 7); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = col; c.lineWidth = 3; Art.poly(c, 6, 13, t); c.stroke();
        c.fillStyle = col; c.font = '700 13px "Chakra Petch", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText({ hp: '+', od: '2×', sh: '◆' }[p.k], 0, 1);
      }
      c.restore();
    }
    // decoys
    for (const d of M.decoys) Art.ship(c, { x: d.x, y: d.y, r: 18, ang: d.ang, body: 0, skin: d.skin, weapon: d.weapon, alpha: 0.35 + Math.sin(t * 20) * 0.1 }, t);
    // particles below
    c.globalCompositeOperation = 'lighter';
    for (const p of M.parts) {
      const k = p.life / p.max;
      if (p.ring) { c.globalAlpha = k; c.strokeStyle = p.col; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, p.r * (1.2 - k * 0.7), 0, 7); c.stroke(); continue; }
      c.globalAlpha = k; c.fillStyle = p.col; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // ghosts
    for (const u of M.list) {
      if (!u.gpos) continue;
      for (let k = 2; k >= 0; k--) {
        Art.ship(c, { x: u.gpos.x - Math.cos(u.gpos.a) * k * 6, y: u.gpos.y - Math.sin(u.gpos.a) * k * 6, r: u.r, ang: u.gpos.a, body: u.gpos.a, skin: u.skin, weapon: u.weapon, alpha: 0.12 + (2 - k) * 0.1 }, t);
      }
    }
    // units
    for (const u of M.list) {
      if (!u.alive) continue;
      if (u.inv > 0 && Math.floor(t * 20) % 2 && u.kind === 'pilot') continue;
      if (u.kind === 'pilot') {
        const ring = M.mode.rules === 'teams' ? TEAM_COLORS[u.team] : (u.local ? '#ffffff' : null);
        Art.ship(c, { x: u.x, y: u.y, r: u.r, ang: u.ang, body: u.body, skin: u.skin, weapon: u.weapon, flash: u.flash, ring }, t);
      } else if (u.kind === 'boss') Art.boss(c, u, t);
      else Art.enemy(c, u, t);
      if (u.mirrorT > 0) { c.strokeStyle = 'rgba(200,235,255,.8)'; c.lineWidth = 3; c.beginPath(); c.arc(u.x, u.y, u.r + 10, 0, 7); c.stroke(); }
      if (u.shield > 0) { c.strokeStyle = 'rgba(77,227,255,.7)'; c.lineWidth = 2; Art.poly(c, 6, u.r + 8, 0); c.save(); c.translate(u.x, u.y); Art.poly(c, 6, u.r + 8, t); c.stroke(); c.restore(); }
      if (u.odT > 0) { c.strokeStyle = '#ff4fa3'; c.globalAlpha = 0.5 + Math.sin(t * 20) * 0.3; c.lineWidth = 2; c.beginPath(); c.arc(u.x, u.y, u.r + 5, 0, 7); c.stroke(); c.globalAlpha = 1; }
      if (u.droneT > 0) {
        const dp = dronePos(u);
        c.fillStyle = '#7fffd4'; c.beginPath(); c.arc(dp.x, dp.y, 6, 0, 7); c.fill();
        c.strokeStyle = 'rgba(127,255,212,.25)'; c.beginPath(); c.arc(u.x, u.y, 46, 0, 7); c.stroke();
      }
      // name + hp
      if (u.kind === 'boss') continue;
      const bw = u.kind === 'pilot' ? 40 : 28;
      if (u.kind === 'pilot' || u.hp < u.maxHp) {
        c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(u.x - bw / 2, u.y - u.r - 12, bw, 5);
        const fr = U.clamp(u.hp / u.maxHp, 0, 1);
        const enemyCol = M.mode.rules === 'teams' ? TEAM_COLORS[u.team] : (u.local ? '#9dff6a' : '#ff6b6b');
        c.fillStyle = u.local ? '#9dff6a' : (u.kind === 'pilot' ? (me && !isEnemy(me, u) ? '#4de3ff' : enemyCol) : '#ff6b6b');
        c.fillRect(u.x - bw / 2, u.y - u.r - 12, bw * fr, 5);
      }
      if (u.kind === 'pilot' && !u.local) {
        c.fillStyle = 'rgba(232,234,255,.85)'; c.font = '600 11px "Chakra Petch", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.fillText(u.name + (u.isBot ? '' : ' ★'), u.x, u.y - u.r - 15);
      }
    }
    // bullets
    c.globalCompositeOperation = 'lighter';
    for (const b of M.bullets) {
      if (b.orb) {
        c.globalAlpha = 0.25; c.fillStyle = b.col; c.beginPath(); c.arc(b.x, b.y, b.aura, 0, 7); c.fill();
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#000'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
        c.strokeStyle = '#c3b2ff'; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r + 2 + Math.sin(t * 20) * 2, 0, 7); c.stroke();
        c.globalCompositeOperation = 'lighter';
        continue;
      }
      const sp = Math.hypot(b.vx, b.vy) || 1, tl = Math.min(26, 6 + sp * 0.02);
      c.globalAlpha = b.g ? 0.55 : 1;
      c.strokeStyle = b.b > 0 ? '#ffe066' : b.col; c.lineWidth = b.r * 1.2;
      c.beginPath(); c.moveTo(b.x - (b.vx / sp) * tl, b.y - (b.vy / sp) * tl); c.lineTo(b.x, b.y); c.stroke();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(b.x, b.y, b.r * 0.6, 0, 7); c.fill();
      if (M.mode.bankOnly && b.b === 0) { c.globalAlpha = 0.3; }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // floating text
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const tx of M.texts) {
      c.globalAlpha = Math.min(1, tx.life * 2);
      c.font = `700 ${Math.round(15 * tx.scale)}px "Chakra Petch", sans-serif`;
      c.fillStyle = '#000'; c.fillText(tx.s, tx.x + 1, tx.y + 1);
      c.fillStyle = tx.col; c.fillText(tx.s, tx.x, tx.y);
    }
    c.globalAlpha = 1;
    drawHud(me, t);
  }

  function drawHud(me, t) {
    const c = cx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const safeL = 14;
    let top = 12;
    // hurt vignette
    if (M.hurtT > 0) {
      const g = c.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
      g.addColorStop(0, 'rgba(255,0,60,0)'); g.addColorStop(1, `rgba(255,0,60,${M.hurtT})`);
      c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    }
    if (me) {
      // hp + heat bars
      const bw = Math.min(220, VW * 0.36), x = safeL + 52, y = top + 4;
      c.fillStyle = 'rgba(8,10,24,.7)'; c.fillRect(x - 4, y - 4, bw + 8, 34);
      c.fillStyle = '#2a1020'; c.fillRect(x, y, bw, 12);
      c.fillStyle = me.hp / me.maxHp < 0.3 ? '#ff4f7b' : '#9dff6a'; c.fillRect(x, y, bw * U.clamp(me.hp / me.maxHp, 0, 1), 12);
      if (me.shield > 0) { c.fillStyle = '#4de3ff'; c.fillRect(x, y, bw * U.clamp(me.shield / 50, 0, 1), 3); }
      c.fillStyle = '#1b1b30'; c.fillRect(x, y + 17, bw, 7);
      const hk = me.heat / 100;
      c.fillStyle = me.overT > 0 ? (Math.floor(t * 10) % 2 ? '#ff4f7b' : '#ffffff') : hk > 0.7 ? '#ff6b3d' : hk > 0.45 ? '#ffb347' : '#4de3ff';
      c.fillRect(x, y + 17, bw * hk, 7);
      c.font = '700 11px "Chakra Petch", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#e8eaff';
      c.fillText(Math.ceil(me.hp) + ' / ' + me.maxHp, x + 4, y + 6.5);
      c.fillStyle = 'rgba(232,234,255,.7)'; c.font = '600 9px "Chakra Petch", sans-serif';
      c.fillText(me.overT > 0 ? 'OVERHEATED — VENT!' : 'HEAT', x + bw + 8 > VW * 0.6 ? x + 4 : x + bw - 30, y + 20.5);
    }
    // scoreboard / timer (drops below the health bar on narrow screens)
    const narrow = VW < 640;
    const top0 = top;
    top = narrow ? top0 + 44 : top0;
    c.textAlign = 'center'; c.textBaseline = 'top';
    let label = '';
    if (M.mode.rules === 'pve') label = M.waveState === 'fight' ? (M.mode.bossRush ? 'TITAN ' + M.wave + ' / 4' : 'WAVE ' + M.wave) : 'NEXT WAVE ' + Math.max(0, Math.ceil(M.waveT));
    else {
      const tl = Math.max(0, Math.ceil(M.timeLeft));
      label = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
    }
    c.font = '700 20px "Chakra Petch", sans-serif'; c.fillStyle = '#e8eaff'; c.fillText(label, VW / 2, top);
    c.font = '600 12px "Chakra Petch", sans-serif';
    if (M.mode.rules === 'teams') {
      const ts = teamScores();
      c.fillStyle = TEAM_COLORS[0]; c.fillText(ts[0] + '', VW / 2 - 50, top + 4);
      c.fillStyle = TEAM_COLORS[1]; c.fillText(ts[1] + '', VW / 2 + 50, top + 4);
      c.fillStyle = 'rgba(232,234,255,.6)'; c.fillText('FIRST TO ' + M.mode.target, VW / 2, top + 26);
    } else if (M.mode.rules === 'ffa' && me) {
      const ps = M.list.filter((u) => u.kind === 'pilot').sort((a, b) => score(b) - score(a));
      const lead = ps[0];
      const unit = M.mode.score === 'coins' ? ' coins' : M.mode.score === 'points' ? ' pts' : '';
      c.fillStyle = 'rgba(232,234,255,.75)';
      c.fillText('YOU ' + score(me) + unit + '  ·  #' + (ps.indexOf(me) + 1) + '  ·  LEAD ' + (lead ? score(lead) : 0) + (M.mode.target ? ' / ' + M.mode.target : ''), VW / 2, top + 26);
    } else if (M.mode.rules === 'pve') {
      const boss = M.list.find((u) => u.kind === 'boss' && u.alive);
      if (boss) {
        const bw = Math.min(360, VW * 0.6);
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(VW / 2 - bw / 2, top + 28, bw, 10);
        c.fillStyle = boss.color; c.fillRect(VW / 2 - bw / 2, top + 28, bw * U.clamp(boss.hp / boss.maxHp, 0, 1), 10);
        c.fillStyle = '#e8eaff'; c.fillText(boss.name.toUpperCase(), VW / 2, top + 42);
      } else {
        const left = M.list.filter((u) => u.kind !== 'pilot' && u.alive).length + (M.queue ? M.queue.length : 0);
        if (M.waveState === 'fight') { c.fillStyle = 'rgba(232,234,255,.7)'; c.fillText(left + ' HOSTILES', VW / 2, top + 26); }
      }
    }
    // kill feed (right)
    c.textAlign = 'right'; c.font = '600 11px "Chakra Petch", sans-serif';
    M.feed.forEach((f, i) => {
      c.globalAlpha = Math.min(1, f.life);
      const s = f.a + (f.ghost ? ' ◈ ' : f.bank ? ' ⤳ ' : ' › ') + f.b;
      c.fillStyle = f.mine ? '#ffe066' : 'rgba(232,234,255,.85)';
      c.fillText(s, VW - 14, (narrow ? top + 44 : top) + 6 + i * 16);
    });
    c.globalAlpha = 1;
    // minimap
    const mw = Math.min(150, VW * 0.26), mh = mw * WORLD_H / WORLD_W, mx = 14, my = narrow ? top + 46 : top0 + 46;
    c.fillStyle = 'rgba(8,10,24,.65)'; c.fillRect(mx, my, mw, mh);
    c.strokeStyle = 'rgba(255,255,255,.15)'; c.strokeRect(mx, my, mw, mh);
    const sc = mw / WORLD_W;
    c.fillStyle = 'rgba(140,150,220,.4)';
    for (const w of M.walls) { if (w.x < 0 || w.y < 0 || w.x >= WORLD_W || w.y >= WORLD_H) continue; c.fillRect(mx + w.x * sc, my + w.y * sc, Math.max(1, w.w * sc), Math.max(1, w.h * sc)); }
    for (const u of M.list) {
      if (!u.alive) continue;
      c.fillStyle = u.local ? '#ffffff' : (me && !isEnemy(me, u)) ? '#4de3ff' : u.kind === 'boss' ? '#ff4fa3' : '#ff6b6b';
      const s = u.local ? 4 : u.kind === 'boss' ? 5 : 3;
      c.fillRect(mx + u.x * sc - s / 2, my + u.y * sc - s / 2, s, s);
    }
    if (M.mode.zone) { c.strokeStyle = '#7d5cff'; c.beginPath(); c.arc(mx + M.zone[0] * sc, my + M.zone[1] * sc, M.zone[2] * sc, 0, 7); c.stroke(); }
    // callouts
    c.textAlign = 'center'; c.textBaseline = 'middle';
    M.callouts.forEach((co, i) => {
      const k = co.life / 1.6, pop = 1 + Math.max(0, (k - 0.85) * 3);
      c.globalAlpha = Math.min(1, co.life * 2);
      c.font = `800 ${Math.round(30 * co.scale * pop)}px "Chakra Petch", sans-serif`;
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillText(co.s, VW / 2 + 3, VH * 0.3 + i * 40 + 3);
      c.fillStyle = co.col; c.fillText(co.s, VW / 2, VH * 0.3 + i * 40);
    });
    c.globalAlpha = 1;
    // death overlay
    if (me && !me.alive && !M.over) {
      c.fillStyle = 'rgba(5,6,15,.45)'; c.fillRect(0, VH * 0.42, VW, 70);
      c.fillStyle = '#ff6b6b'; c.font = '800 22px "Chakra Petch", sans-serif';
      c.fillText(M.killer ? 'ELIMINATED BY ' + M.killer.toUpperCase() : 'ELIMINATED', VW / 2, VH * 0.42 + 24);
      c.fillStyle = '#e8eaff'; c.font = '600 13px "Chakra Petch", sans-serif';
      c.fillText(M.mode.rules === 'pve' ? 'You return when the wave is cleared' : 'Respawning in ' + Math.max(0, me.respawnT).toFixed(1) + 's', VW / 2, VH * 0.42 + 50);
    }
    // touch sticks
    for (const k of ['move', 'aim']) {
      const s = input[k]; if (!s) continue;
      c.globalAlpha = 0.35; c.strokeStyle = '#e8eaff'; c.lineWidth = 2; c.beginPath(); c.arc(s.ox, s.oy, 60, 0, 7); c.stroke();
      c.globalAlpha = 0.6; c.fillStyle = k === 'aim' ? '#ff4fa3' : '#4de3ff'; c.beginPath(); c.arc(s.x, s.y, 24, 0, 7); c.fill();
      c.globalAlpha = 1;
    }
    // ability buttons state
    if (me) {
      const set = (el, frac, ready) => { el.style.setProperty('--cd', (frac * 360).toFixed(0) + 'deg'); el.classList.toggle('ready', ready); };
      set(btn.dash, me.dashCd / 2.4, me.dashCd <= 0);
      if (me.ability) set(btn.ability, me.abCd / ABILITIES[me.ability].cd, me.abCd <= 0);
      btn.vent.classList.toggle('show', me.heat >= 45 || me.overT > 0);
    }
  }

  function setPaused(p) { if (M) M.paused = p; }

  return {
    init, start, stop, exit, buildRoster, setPaused,
    // test hook: fast-forward the simulation
    advance(sec) { for (let i = 0; i < sec * 60 && M; i++) step(DT); if (M) render(DT); },
    get active() { return !!M; }, get match() { return M; },
    set onEnd(f) { onEnd = f; }, resize,
  };
})();
