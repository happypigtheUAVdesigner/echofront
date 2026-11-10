'use strict';
// All game content: weapons, abilities, upgrades, cores, modes, maps, enemies, missions.

const WEAPONS = {
  pulse:       { name: 'Pulse Pistol',      price: 0,     tier: 1, dmg: 18,  cd: 0.24,  spd: 640,  life: 1.1, bounce: 2, heat: 7,   spread: 0.03, n: 1, r: 5,  color: '#4de3ff', range: 320,
    desc: 'Reliable bolts that ricochet twice. Every bounce adds +25% damage.' },
  scatter:     { name: 'Scatter Fan',       price: 400,   tier: 2, dmg: 9,   cd: 0.62,  spd: 600,  life: 0.5, bounce: 1, heat: 16,  spread: 0.5,  n: 6, r: 4,  color: '#ffb347', range: 170,
    desc: 'Six-pellet fan. Brutal up close, and pellets bounce once off cover.' },
  needle:      { name: 'Needle SMG',        price: 900,   tier: 2, dmg: 6.5, cd: 0.075, spd: 820,  life: 0.9, bounce: 1, heat: 3.6, spread: 0.13, n: 1, r: 3,  color: '#9dff6a', range: 280,
    desc: 'Hose of needles. Watch the heat bar or you will lock up.' },
  lance:       { name: 'Arc Lance',         price: 1800,  tier: 3, dmg: 52,  cd: 0.95,  spd: 1500, life: 0.9, bounce: 3, heat: 24,  spread: 0,    n: 1, r: 4,  color: '#c38bff', range: 560, pierce: true,
    desc: 'Piercing rail that bounces three times. Line up bank shots for huge hits.' },
  mortar:      { name: 'Gravity Mortar',    price: 3000,  tier: 3, dmg: 34,  cd: 1.05,  spd: 430,  life: 1.2, bounce: 0, heat: 22,  spread: 0,    n: 1, r: 9,  color: '#ff6b6b', range: 420, explode: 80, well: 1.4,
    desc: 'Blasts open a mini gravity well that drags enemies and bends their shots.' },
  prism:       { name: 'Prism Splitter',    price: 4500,  tier: 4, dmg: 15,  cd: 0.3,   spd: 620,  life: 1.2, bounce: 2, heat: 9,   spread: 0.02, n: 1, r: 6,  color: '#ff7ae0', range: 340, split: 3,
    desc: 'Each bolt shatters into three shards when it hits a wall.' },
  swarm:       { name: 'Swarm Hive',        price: 7000,  tier: 4, dmg: 11,  cd: 0.62,  spd: 430,  life: 1.8, bounce: 1, heat: 14,  spread: 0.7,  n: 3, r: 4,  color: '#ffe066', range: 400, homing: 5,
    desc: 'Three homing micro-missiles per trigger pull.' },
  singularity: { name: 'Singularity Cannon', price: 12000, tier: 5, dmg: 7,   cd: 1.8,   spd: 230,  life: 2.6, bounce: 4, heat: 38,  spread: 0,    n: 1, r: 15, color: '#7d5cff', range: 380, orb: true, aura: 72,
    desc: 'A slow black-hole orb that shreds anything near it and eats enemy bullets.' },
};
// Non-shop projectile types used by drones, reflections and bosses
const XWEAPONS = {
  drone: { dmg: 9,  cd: 0.4, spd: 700, life: 0.9, bounce: 1, heat: 0, spread: 0.04, n: 1, r: 3, color: '#7fffd4' },
  refl:  { dmg: 16, cd: 0,   spd: 700, life: 1.0, bounce: 1, heat: 0, spread: 0,    n: 1, r: 5, color: '#ffffff' },
  boss:  { dmg: 12, cd: 0,   spd: 330, life: 3.0, bounce: 1, heat: 0, spread: 0,    n: 1, r: 8, color: '#ff4f7b' },
  bossl: { dmg: 22, cd: 0,   spd: 900, life: 1.2, bounce: 2, heat: 0, spread: 0,    n: 1, r: 5, color: '#ffd166', pierce: true },
};
const WEAPON_ORDER = ['pulse', 'scatter', 'needle', 'lance', 'mortar', 'prism', 'swarm', 'singularity'];
const weaponLevelCost = (id, lv) => Math.round(Math.max(150, WEAPONS[id].price * 0.35) * lv);
const weaponDmgMul = (lv) => 1 + 0.12 * (lv - 1);
const MAX_WLV = 5;

const ABILITIES = {
  echo:   { name: 'Echo',          price: 0,    cd: 9,  desc: 'Summon a ghost of your last 3 seconds. It replays your path and every shot you fired.' },
  blink:  { name: 'Blink',         price: 600,  cd: 6,  desc: 'Teleport forward and leave a decoy that bots love to shoot.' },
  mirror: { name: 'Mirror Shell',  price: 1500, cd: 10, desc: 'For 1.6s, enemy bullets bounce off you and fly back at their owner.' },
  stasis: { name: 'Stasis Field',  price: 2500, cd: 12, desc: 'Drop a field that freezes enemy bullets and slows enemies inside it.' },
  drone:  { name: 'Orbit Drone',   price: 4000, cd: 14, desc: 'A drone circles you for 8s and snipes the nearest enemy.' },
};
const ABILITY_ORDER = ['echo', 'blink', 'mirror', 'stasis', 'drone'];

const UPGRADES = {
  hull:     { name: 'Hull Plating',  desc: '+15 max HP per level',          base: 100, step: 15 },
  thruster: { name: 'Thrusters',     desc: '+12 move speed per level',      base: 230, step: 12 },
  coolant:  { name: 'Coolant Loop',  desc: 'Weapons cool 20% faster per level', base: 34,  step: 7 },
  magnet:   { name: 'Coin Magnet',   desc: 'Bigger pickup radius and +5% coins per level', base: 40, step: 26 },
};
const UPGRADE_ORDER = ['hull', 'thruster', 'coolant', 'magnet'];
const UPGRADE_COST = [250, 550, 1000, 1700, 2600];
const MAX_ULV = 5;

const SKINS = {
  ion:      { name: 'Ion',       price: 0,    lv: 1,  core: '#4de3ff', hull: '#1d2f52', trail: '#4de3ff' },
  ember:    { name: 'Ember',     price: 250,  lv: 1,  core: '#ffb347', hull: '#4a2a16', trail: '#ff8a3d' },
  venom:    { name: 'Venom',     price: 500,  lv: 3,  core: '#9dff6a', hull: '#1f3a22', trail: '#6aff8a' },
  glacier:  { name: 'Glacier',   price: 800,  lv: 5,  core: '#bfe9ff', hull: '#2a3f5c', trail: '#e0f6ff' },
  void:     { name: 'Void',      price: 1500, lv: 8,  core: '#ff4fa3', hull: '#140c22', trail: '#b14fff' },
  solar:    { name: 'Solar Flare', price: 2500, lv: 12, core: '#ffe066', hull: '#5a2a0a', trail: '#ff6b2d', anim: 'flare' },
  gilded:   { name: 'Gilded',    price: 5000, lv: 18, core: '#fff1a8', hull: '#7a5a12', trail: '#ffd166', anim: 'gold' },
  prismatic:{ name: 'Prismatic', price: 9000, lv: 25, core: '#ffffff', hull: '#20203a', trail: '#ffffff', anim: 'rainbow' },
};
const SKIN_ORDER = ['ion', 'ember', 'venom', 'glacier', 'void', 'solar', 'gilded', 'prismatic'];

const DIFFS = {
  rookie:    { name: 'Rookie',    aimErr: 0.32, react: 0.45, dodge: 0.1,  coin: 0.8, hp: 0.8, fire: 0.6 },
  veteran:   { name: 'Veteran',   aimErr: 0.18, react: 0.3,  dodge: 0.3,  coin: 1.0, hp: 1.0, fire: 0.85 },
  elite:     { name: 'Elite',     aimErr: 0.09, react: 0.18, dodge: 0.55, coin: 1.35, hp: 1.15, fire: 1 },
  nightmare: { name: 'Nightmare', aimErr: 0.04, react: 0.1,  dodge: 0.8,  coin: 1.8, hp: 1.35, fire: 1.1 },
};

// rules: ffa | teams | pve. score: kills | points | coins
const MODES = {
  survival: { name: 'Rift Survival', tag: 'PvE', rules: 'pve', icon: 'waves', desc: 'Endless waves of rift drones. A boss tears through every 5th wave. How deep can you go?', online: true, color: '#4de3ff' },
  brawl:    { name: 'Bot Brawl',     tag: 'FFA', rules: 'ffa', score: 'kills', target: 12, time: 180, icon: 'skull', desc: 'Everyone for themselves. First to 12 eliminations wins.', online: true, color: '#ff4fa3' },
  teams:    { name: 'Squad Clash',   tag: '3v3', rules: 'teams', score: 'kills', target: 20, time: 240, icon: 'shield', desc: 'Two squads, one arena. First team to 20 eliminations.', online: true, color: '#ffb347' },
  bank:     { name: 'Bank Shot',     tag: 'FFA', rules: 'ffa', score: 'kills', target: 8, time: 180, bankOnly: true, icon: 'bounce', desc: 'Bullets pass through targets until they ricochet. Only bank shots count.', online: true, color: '#c38bff' },
  glass:    { name: 'Glass Cannon',  tag: 'FFA', rules: 'ffa', score: 'kills', target: 10, time: 150, glass: true, icon: 'glass', desc: 'One hit, one kill. Everyone. Fast respawns, no mercy.', online: true, color: '#9dff6a' },
  gold:     { name: 'Gold Rush',     tag: 'FFA', rules: 'ffa', score: 'coins', time: 120, icon: 'coin', desc: 'Grab coin crystals. Eliminations steal half of a rival\'s haul. You keep what you bank.', online: true, color: '#ffe066' },
  hold:     { name: 'Rift Hold',     tag: 'Zone', rules: 'ffa', score: 'points', target: 60, time: 180, zone: true, icon: 'zone', desc: 'Stand alone in the rift zone to score. Contested zones score nothing.', online: true, color: '#7d5cff' },
  boss:     { name: 'Boss Rush',     tag: 'PvE', rules: 'pve', bossRush: true, icon: 'crown', desc: 'Four rift titans back to back. Bring your best loadout.', online: true, color: '#ff6b6b' },
};
const MODE_ORDER = ['survival', 'brawl', 'teams', 'bank', 'glass', 'gold', 'hold', 'boss'];

// World is 1800 x 1300. Rects are [x, y, w, h]. Crystals are destructible.
const MAPS = {
  foundry: {
    name: 'Neon Foundry', floor: '#10132a', accent: '#4de3ff',
    walls: [[300,250,120,120],[1380,250,120,120],[300,930,120,120],[1380,930,120,120],[800,570,200,160],
      [600,120,30,250],[1170,120,30,250],[600,930,30,250],[1170,930,30,250],[110,630,220,40],[1470,630,220,40]],
    crystals: [[860,250,80,80],[860,970,80,80],[520,610,60,80],[1220,610,60,80]],
    wells: [], zone: [900, 400, 110],
  },
  garden: {
    name: 'Prism Garden', floor: '#120f26', accent: '#ff7ae0',
    walls: [[860,140,80,200],[860,960,80,200],[160,610,240,80],[1400,610,240,80],[560,400,40,40],[1200,400,40,40],[560,860,40,40],[1200,860,40,40]],
    crystals: [[420,240,70,70],[1310,240,70,70],[420,990,70,70],[1310,990,70,70],[700,560,60,60],[1040,560,60,60],[700,680,60,60],[1040,680,60,60],
      [870,600,60,100],[300,450,60,60],[1440,450,60,60],[300,790,60,60],[1440,790,60,60]],
    wells: [], zone: [900, 650, 120],
  },
  core: {
    name: 'Rift Core', floor: '#0d1022', accent: '#7d5cff',
    walls: [[690,420,170,30],[940,420,170,30],[690,850,170,30],[940,850,170,30],[630,470,30,150],[630,680,30,150],[1140,470,30,150],[1140,680,30,150],
      [200,200,160,40],[1440,200,160,40],[200,1060,160,40],[1440,1060,160,40],[200,240,40,120],[1560,240,40,120],[200,940,40,120],[1560,940,40,120]],
    crystals: [[880,180,40,90],[880,1030,40,90],[380,630,90,40],[1330,630,90,40]],
    wells: [[900, 650, 420]], zone: [900, 650, 100],
  },
  maze: {
    name: 'Mirror Maze', floor: '#0f1424', accent: '#9dff6a',
    walls: [[300,180,24,300],[300,820,24,300],[1476,180,24,300],[1476,820,24,300],[520,380,300,24],[980,380,300,24],[520,896,300,24],[980,896,300,24],
      [880,500,40,300],[640,560,24,180],[1136,560,24,180],[120,640,140,24],[1540,640,140,24],[700,140,24,150],[1076,140,24,150],[700,1010,24,150],[1076,1010,24,150]],
    crystals: [[420,600,70,100],[1310,600,70,100],[860,200,80,60],[860,1040,80,60]],
    wells: [[420, 300, 160], [1380, 1000, 160]], zone: [900, 650, 110],
  },
};
const MAP_ORDER = ['foundry', 'garden', 'core', 'maze'];
const WORLD_W = 1800, WORLD_H = 1300;

const ENEMIES = {
  drone:   { name: 'Rift Drone',  hp: 34,  r: 13, spd: 250, weapon: 'pulse',   dmgMul: 0.55, shape: 'tri',    color: '#ff4f7b', from: 1, coins: 6 },
  gunner:  { name: 'Gunner',      hp: 60,  r: 16, spd: 190, weapon: 'needle',  dmgMul: 0.55, shape: 'square', color: '#ffb347', from: 2, coins: 9 },
  brute:   { name: 'Brute',       hp: 130, r: 22, spd: 150, weapon: 'scatter', dmgMul: 0.7,  shape: 'hex',    color: '#ff6b6b', from: 3, coins: 14 },
  bomber:  { name: 'Bomber',      hp: 40,  r: 14, spd: 320, weapon: null,      dmgMul: 1,    shape: 'spike',  color: '#ffe066', from: 4, coins: 10, kamikaze: 42 },
  sniper:  { name: 'Lancer',      hp: 55,  r: 15, spd: 170, weapon: 'lance',   dmgMul: 0.5,  shape: 'diamond',color: '#c38bff', from: 6, coins: 15 },
};
const BOSSES = [
  { id: 'warden', name: 'The Warden',      hp: 1400, r: 46, spd: 120, color: '#ff4f7b' },
  { id: 'hydra',  name: 'Hydra Engine',    hp: 1800, r: 48, spd: 140, color: '#ffb347' },
  { id: 'mking',  name: 'Mirror King',     hp: 2200, r: 44, spd: 160, color: '#bfe9ff' },
  { id: 'sing',   name: 'Event Horizon',   hp: 2800, r: 52, spd: 110, color: '#7d5cff' },
];

const RANKS = [
  { name: 'Spark', min: 0, color: '#8c90c0' },
  { name: 'Flicker', min: 100, color: '#9dff6a' },
  { name: 'Pulse', min: 250, color: '#4de3ff' },
  { name: 'Surge', min: 500, color: '#c38bff' },
  { name: 'Storm', min: 900, color: '#ffb347' },
  { name: 'Nova', min: 1400, color: '#ff4fa3' },
  { name: 'Rift Legend', min: 2200, color: '#ffe066' },
];
const rankFor = (tr) => { let r = RANKS[0]; for (const k of RANKS) if (tr >= k.min) r = k; return r; };

const MISSION_POOL = [
  { id: 'kills20',   text: 'Get 20 eliminations',            stat: 'kills',    goal: 20, reward: 200 },
  { id: 'bank5',     text: 'Land 5 bank-shot eliminations',   stat: 'bankKills', goal: 5, reward: 250 },
  { id: 'echo3',     text: 'Get 3 eliminations with your Echo', stat: 'echoKills', goal: 3, reward: 300 },
  { id: 'wins2',     text: 'Win 2 versus matches',            stat: 'wins',     goal: 2,  reward: 300 },
  { id: 'wave8',     text: 'Reach wave 8 in Rift Survival',   stat: 'maxWave',  goal: 8,  reward: 350, max: true },
  { id: 'gold300',   text: 'Bank 300 coins in Gold Rush',     stat: 'goldBanked', goal: 300, reward: 250 },
  { id: 'online1',   text: 'Finish an online match',          stat: 'onlineMatches', goal: 1, reward: 250 },
  { id: 'vent5',     text: 'Hit enemies with 5 Vent blasts',  stat: 'ventHits', goal: 5, reward: 200 },
  { id: 'dmg3000',   text: 'Deal 3,000 damage',               stat: 'damage',   goal: 3000, reward: 200 },
  { id: 'abil10',    text: 'Use your ability 10 times',       stat: 'abilities', goal: 10, reward: 150 },
  { id: 'boss1',     text: 'Defeat a boss',                   stat: 'bosses',   goal: 1,  reward: 400 },
  { id: 'matches3',  text: 'Play 3 matches',                  stat: 'matches',  goal: 3,  reward: 150 },
];

const ACHIEVEMENTS = [
  { id: 'first',    name: 'First Blood',     text: 'Get your first elimination',   stat: 'kills', goal: 1,    reward: 100 },
  { id: 'k100',     name: 'Centurion',       text: '100 total eliminations',       stat: 'kills', goal: 100,  reward: 600 },
  { id: 'k1000',    name: 'Rift Reaper',     text: '1,000 total eliminations',     stat: 'kills', goal: 1000, reward: 4000 },
  { id: 'bank25',   name: 'Banker',          text: '25 bank-shot eliminations',    stat: 'bankKills', goal: 25, reward: 800 },
  { id: 'echo25',   name: 'Living Echo',     text: '25 Echo eliminations',         stat: 'echoKills', goal: 25, reward: 900 },
  { id: 'win10',    name: 'Contender',       text: 'Win 10 versus matches',        stat: 'wins', goal: 10,   reward: 700 },
  { id: 'win50',    name: 'Champion',        text: 'Win 50 versus matches',        stat: 'wins', goal: 50,   reward: 3000 },
  { id: 'wave15',   name: 'Deep Diver',      text: 'Reach wave 15 in Survival',    stat: 'maxWave', goal: 15, reward: 1200 },
  { id: 'boss4',    name: 'Titan Slayer',    text: 'Defeat 4 bosses',              stat: 'bosses', goal: 4,  reward: 1000 },
  { id: 'friend1',  name: 'Squad Up',        text: 'Add your first friend',        stat: 'friends', goal: 1, reward: 300 },
  { id: 'online10', name: 'Netrunner',       text: 'Finish 10 online matches',     stat: 'onlineMatches', goal: 10, reward: 1000 },
  { id: 'streak5',  name: 'Rampage',         text: 'Get a 5 elimination streak',   stat: 'bestStreak', goal: 5, reward: 500 },
  { id: 'arsenal',  name: 'Arsenal',         text: 'Own 5 weapons',                stat: 'weaponsOwned', goal: 5, reward: 1500 },
  { id: 'lv20',     name: 'Veteran Pilot',   text: 'Reach level 20',               stat: 'level', goal: 20,  reward: 2000 },
];

const DAILY_REWARDS = [100, 150, 200, 300, 400, 550, 'cache'];

const BOT_NAMES = ['Vexa', 'Krill', 'Nox', 'Juno', 'Ratchet', 'Mira', 'Kestrel', 'Bolt', 'Sable', 'Quill', 'Onyx', 'Pike', 'Lumen', 'Hex', 'Tango', 'Fable', 'Zed', 'Wisp', 'Orca', 'Vanta', 'Rook', 'Cinder', 'Pixel', 'Drift'];
const TEAM_COLORS = ['#4de3ff', '#ff6b6b'];
