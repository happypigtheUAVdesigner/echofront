'use strict';
// Player profile: coins, XP, unlocks, stats, missions, friends. Saved locally and to the cloud relay.
const Profile = (() => {
  const STATS = ['kills', 'deaths', 'bankKills', 'echoKills', 'wins', 'matches', 'onlineMatches', 'maxWave', 'goldBanked', 'ventHits', 'damage', 'abilities', 'bosses', 'bestStreak'];
  const fresh = () => ({
    v: 1, uid: U.code(8), key: U.code(16), name: '', coins: 300, xp: 0, level: 1, trophies: 0,
    owned: { weapons: { pulse: 1 }, abilities: { echo: true }, skins: { ion: true } },
    upgrades: { hull: 0, thruster: 0, coolant: 0, magnet: 0 },
    equip: { weapon: 'pulse', ability: 'echo', skin: 'ion' },
    stats: Object.fromEntries(STATS.map((s) => [s, 0])),
    daily: { day: '', missions: [] },
    login: { lastDay: '', streak: 0, claimedToday: false },
    ach: {}, caches: 1, friends: {},
    settings: { sound: true, shake: true, quality: 'high' },
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  let p = U.store.get('profile', null);
  if (!p || !p.uid) p = fresh();
  // fill any missing fields after updates
  const base = fresh();
  for (const k in base) if (p[k] === undefined) p[k] = base[k];
  for (const s of STATS) if (p.stats[s] === undefined) p.stats[s] = 0;

  let cloudTimer = null;
  const listeners = new Set();
  function save(cloud) {
    p.updatedAt = Date.now();
    U.store.set('profile', p);
    listeners.forEach((f) => f());
    if (cloud !== false) {
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(() => { if (window.Net) Net.saveCloud(p); }, 1500);
    }
  }
  const xpNeed = (lv) => 120 + (lv - 1) * 70;

  function addCoins(n) { p.coins = Math.max(0, Math.round(p.coins + n)); save(); }
  function addXp(n) {
    const events = [];
    p.xp += Math.round(n);
    while (p.xp >= xpNeed(p.level)) {
      p.xp -= xpNeed(p.level); p.level++;
      const reward = 100 + p.level * 25;
      p.coins += reward;
      const ev = { level: p.level, coins: reward };
      if (p.level % 5 === 0) { p.caches++; ev.cache = true; }
      events.push(ev);
    }
    save();
    return events;
  }
  function stat(name, delta, isMax) {
    if (isMax) p.stats[name] = Math.max(p.stats[name] || 0, delta);
    else p.stats[name] = (p.stats[name] || 0) + delta;
    for (const m of p.daily.missions) {
      const def = MISSION_POOL.find((x) => x.id === m.id);
      if (!def || def.stat !== name || m.done) continue;
      if (def.max) m.progress = Math.max(m.progress, delta); else m.progress += delta;
      if (m.progress >= def.goal) { m.progress = def.goal; m.done = true; }
    }
  }
  function derived(name) {
    if (name === 'level') return p.level;
    if (name === 'friends') return Object.keys(p.friends).length;
    if (name === 'weaponsOwned') return Object.keys(p.owned.weapons).length;
    return p.stats[name] || 0;
  }
  function achProgress(a) { return Math.min(a.goal, derived(a.stat)); }
  function claimableCount() {
    let n = 0;
    for (const a of ACHIEVEMENTS) if (!p.ach[a.id] && achProgress(a) >= a.goal) n++;
    for (const m of p.daily.missions) if (m.done && !m.claimed) n++;
    if (!p.login.claimedToday) n++;
    return n;
  }
  function rollDaily() {
    const today = U.dayKey();
    if (p.daily.day !== today) {
      const pool = MISSION_POOL.slice();
      const ms = [];
      while (ms.length < 3 && pool.length) ms.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      p.daily = { day: today, missions: ms.map((m) => ({ id: m.id, progress: 0, done: false, claimed: false })) };
    }
    if (p.login.lastDay !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yKey = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
      if (p.login.lastDay !== yKey) p.login.streak = 0;
      p.login.claimedToday = false;
    }
    save(false);
  }
  function claimLogin() {
    if (p.login.claimedToday) return null;
    const today = U.dayKey();
    const r = DAILY_REWARDS[p.login.streak % 7];
    p.login.streak++; p.login.lastDay = today; p.login.claimedToday = true;
    if (r === 'cache') p.caches++; else p.coins += r;
    save();
    return r;
  }
  function loadout() {
    const e = p.equip;
    return {
      weapon: e.weapon, wlv: p.owned.weapons[e.weapon] || 1, ability: e.ability, skin: e.skin,
      hp: UPGRADES.hull.base + UPGRADES.hull.step * p.upgrades.hull,
      spd: UPGRADES.thruster.base + UPGRADES.thruster.step * p.upgrades.thruster,
      cool: UPGRADES.coolant.base + UPGRADES.coolant.step * p.upgrades.coolant,
      mag: UPGRADES.magnet.base + UPGRADES.magnet.step * p.upgrades.magnet,
      coinMul: 1 + 0.05 * p.upgrades.magnet,
    };
  }
  function openCache() {
    if (p.caches <= 0) return null;
    p.caches--;
    const roll = Math.random();
    let r;
    const unownedSkins = SKIN_ORDER.filter((s) => !p.owned.skins[s]);
    if (roll < 0.12 && unownedSkins.length) { const s = U.pick(unownedSkins); p.owned.skins[s] = true; r = { kind: 'skin', id: s, label: SKINS[s].name + ' core' }; }
    else if (roll < 0.24 && (p.owned.weapons[p.equip.weapon] || 1) < MAX_WLV) { p.owned.weapons[p.equip.weapon]++; r = { kind: 'wlv', id: p.equip.weapon, label: WEAPONS[p.equip.weapon].name + ' Lv ' + p.owned.weapons[p.equip.weapon] }; }
    else if (roll < 0.45) { const c = U.randi(800, 1600); p.coins += c; r = { kind: 'coins', amount: c, label: c + ' coins', big: true }; }
    else { const c = U.randi(150, 600); p.coins += c; r = { kind: 'coins', amount: c, label: c + ' coins' }; }
    save();
    return r;
  }
  function importSave(obj) {
    if (!obj || !obj.uid) return false;
    p = obj; for (const k in base) if (p[k] === undefined) p[k] = base[k];
    save(false); return true;
  }
  rollDaily();
  return {
    get p() { return p; }, save, addCoins, addXp, stat, xpNeed, rollDaily, claimLogin, loadout, openCache,
    achProgress, claimableCount, importSave, derived,
    onChange(f) { listeners.add(f); },
  };
})();
