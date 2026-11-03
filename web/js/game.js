'use strict';
// ---------------------------------------------------------------------------
// Core simulation and world rendering.
// ---------------------------------------------------------------------------

const BALL_SPEED = 150;
const GRAV = 260;

const SHIP_TYPES = {
  player: { art: 'player', hp: 100, speed: 47, accel: 28, turn: 1.75, guns: 3, dmg: 10, reload: 1.9, range: 135 },
  sloop: { art: 'sloop', name: 'SLOOP', hp: 30, speed: 39, accel: 24, turn: 1.9, guns: 1, dmg: 7, reload: 2.7, range: 112, gold: 4, score: 100, aimErr: 0.11 },
  brig: { art: 'brig', name: 'BRIG', hp: 70, speed: 33, accel: 18, turn: 1.35, guns: 2, dmg: 8, reload: 3.0, range: 128, gold: 7, score: 220, aimErr: 0.09 },
  frigate: { art: 'frigate', name: 'FRIGATE', hp: 140, speed: 28, accel: 14, turn: 1.0, guns: 3, dmg: 9, reload: 3.2, range: 142, gold: 12, score: 450, aimErr: 0.075 },
  burner: { art: 'burner', name: 'FIRE SHIP', hp: 16, speed: 50, accel: 32, turn: 2.3, guns: 0, dmg: 0, reload: 99, range: 0, gold: 3, score: 150, ram: 26 },
  galleon: { art: 'galleon', name: 'CRIMSON GALLEON', hp: 440, speed: 23, accel: 10, turn: 0.72, guns: 5, dmg: 10, reload: 3.4, range: 152, gold: 60, score: 2500, aimErr: 0.06, boss: true },
};

const TOD = [
  { name: 'DAY', mul: null, a: 0, night: 0 },
  { name: 'GOLDEN HOUR', mul: '#ffdca0', a: 0.42, night: 0.1 },
  { name: 'SUNSET', mul: '#ff9c80', a: 0.55, night: 0.35 },
  { name: 'NIGHT', mul: '#34468e', a: 0.82, night: 1 },
  { name: 'DAWN', mul: '#c8a8e8', a: 0.38, night: 0.2 },
];
const todForWave = (n) => (n <= 2 ? 0 : [1, 2, 3, 4, 0][(n - 3) % 5]);

const UPGRADES = [
  { id: 'hull', name: 'HULL', desc: '+25 MAX HULL', icon: 'heart', max: 6, cost: (l) => 15 + l * 14 },
  { id: 'guns', name: 'CANNONS', desc: '+1 GUN A SIDE', icon: 'cannon', max: 3, cost: (l) => 32 + l * 30 },
  { id: 'powder', name: 'POWDER', desc: '+20% DAMAGE', icon: 'powder', max: 5, cost: (l) => 20 + l * 17 },
  { id: 'crew', name: 'GUN CREW', desc: 'FASTER RELOAD', icon: 'crew', max: 5, cost: (l) => 20 + l * 17 },
  { id: 'sails', name: 'SAILS', desc: '+10% SPEED', icon: 'sails', max: 4, cost: (l) => 18 + l * 15 },
  { id: 'repair', name: 'REPAIR', desc: 'MEND + 1 KEG', icon: 'repair', repeat: true, cost: () => Math.max(4, Math.ceil((playerStats().maxHp - G.player.hp) * 0.3)) },
];

const G = {
  state: 'title', t: 0, wave: 0, score: 0, gold: 0, kills: 0, goldEarned: 0,
  best: Store.get('best', 0), bestWave: Store.get('bestWave', 0), newBest: false,
  player: null, ships: [], balls: [], pending: [], parts: [], texts: [], pickups: [], kegs: [], lights: [],
  cam: { x: 0, y: 0 }, shake: 0, hitstop: 0, hurtFlash: 0, combo: 0, comboT: 0,
  spawnQueue: [], spawnT: 0, banner: null, wind: { a: 0.6, s: 1 }, tod: 1, stateT: 0,
  up: { hull: 0, guns: 0, powder: 0, crew: 0, sails: 0 }, kegCount: 2,
  power: { rapid: 0, fire: 0 }, barrelT: 8, coinStep: 0, coinStepT: 0,
  gulls: [], clouds: [], boss: null, hint: null, hintStep: 0, tutorial: !Store.get('tutorialDone', false),
  moved: 0, firedHit: false, shopPop: {}, goldBump: 0,
};

function playerStats() {
  const u = G.up;
  return {
    maxHp: 100 + u.hull * 25,
    guns: 3 + u.guns,
    dmg: 10 * (1 + u.powder * 0.2),
    reload: 1.9 * Math.pow(0.87, u.crew) * (G.power.rapid > 0 ? 0.4 : 1),
    speedMul: 1 + u.sails * 0.1,
    turnMul: 1 + u.sails * 0.07,
    range: 135 + u.powder * 3 + u.guns * 3,
  };
}

function makeShip(kind, x, y, a) {
  const d = SHIP_TYPES[kind];
  const art = SHIP_ART[d.art];
  const wave = Math.max(1, G.wave);
  const hpMul = kind === 'player' ? 1 : 1 + (wave - 1) * 0.08;
  const hp = kind === 'player' ? playerStats().maxHp : Math.round(d.hp * hpMul);
  return {
    kind, d, art, team: kind === 'player' ? 'player' : 'enemy',
    x, y, a, targetA: a, speed: 0, throttle: kind === 'player' ? 0.4 : 0.8, cruise: 0.4,
    kx: 0, ky: 0, hp, maxHp: hp, alive: true, sinkT: 0, flashT: 0, hpShowT: 0, burn: 0,
    reload: { '-1': rand(0.6, 1.6), '1': rand(0.6, 1.6) },
    orbit: Math.random() < 0.5 ? 1 : -1, orbitT: rand(6, 12), thinkT: 0, mortarT: 4,
    wakeT: 0, smokeT: 0, radius: art.len * 0.38, bobPh: rand(0, PI2), entering: 0,
  };
}

// --- Particles -------------------------------------------------------------
const MAX_PARTS = 1600;
function part(p) {
  if (G.parts.length >= MAX_PARTS) G.parts.splice(0, 64);
  p.life = p.max = p.life || 1;
  p.z = p.z || 0; p.vz = p.vz || 0; p.vx = p.vx || 0; p.vy = p.vy || 0;
  G.parts.push(p);
  return p;
}
function floatText(x, y, text, color, scale = 1, life = 0.9) {
  G.texts.push({ x, y, text: String(text), color, scale, t: 0, max: life });
}
function addLight(x, y, r, c, a = 1) { G.lights.push({ x, y, r, c, a }); }

function smokePuff(x, y, n, color = '#b8b8c4', size = 3, spread = 10) {
  for (let i = 0; i < n; i++) {
    part({ k: 'smoke', x: x + rand(-2, 2), y: y + rand(-2, 2), vx: rand(-spread, spread) + Math.cos(G.wind.a) * 6, vy: rand(-spread, spread) + Math.sin(G.wind.a) * 6, life: rand(0.8, 1.6), s: rand(size * 0.6, size * 1.2), c: color });
  }
}
function splash(x, y, big = false) {
  const n = big ? 16 : 9;
  for (let i = 0; i < n; i++) part({ k: 'drop', x, y, vx: rand(-25, 25), vy: rand(-25, 25), vz: rand(40, big ? 120 : 85), life: 1.2, c: Math.random() < 0.5 ? '#e8fbff' : '#9fdcf2' });
  part({ k: 'ring', x, y, life: 0.7, s: big ? 8 : 5 });
  part({ k: 'ring', x, y, life: 1.0, s: big ? 12 : 8 });
}
function sparks(x, y, n, z = 4) {
  for (let i = 0; i < n; i++) part({ k: 'spark', x, y, z, vx: rand(-60, 60), vy: rand(-60, 60), vz: rand(20, 80), life: rand(0.25, 0.55), c: pick(['#fff6c0', '#ffd23f', '#ff9a3a']) });
}
function splinters(x, y, n) {
  for (let i = 0; i < n; i++) part({ k: 'splinter', x, y, z: 4, vx: rand(-45, 45), vy: rand(-45, 45), vz: rand(30, 90), life: 1.4, c: pick(['#8a5530', '#c99258', '#5a3518']) });
}
function debris(x, y, n) {
  for (let i = 0; i < n; i++) part({ k: 'debris', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-8, 8), vy: rand(-8, 8), life: rand(5, 9), w: randi(2, 4), h: 1, rot: Math.random() < 0.5, c: pick(['#8a5530', '#6a4020', '#b47c47']) });
}

// --- Camera & sound helpers ------------------------------------------------
const view = { w: 384, h: 216, safe: { l: 0, r: 0, t: 0, b: 0 } };
function onScreen(x, y, m = 20) { const sx = x - G.cam.x, sy = y - G.cam.y; return sx > -m && sy > -m && sx < view.w + m && sy < view.h + m; }
function panFor(x) { return clamp((x - G.cam.x - view.w / 2) / (view.w * 0.7), -0.8, 0.8); }
function volFor(x, y) { const d = dist(x, y, G.cam.x + view.w / 2, G.cam.y + view.h / 2); return clamp(1.15 - d / 420, 0.12, 1); }
function addShake(a) { G.shake = Math.min(9, Math.max(G.shake, a)); }

// --- Game flow -------------------------------------------------------------
function initAmbience() {
  G.gulls = Array.from({ length: 4 }, () => ({ x: rand(0, World.W), y: rand(0, World.H), a: rand(0, PI2), r: rand(30, 70), cx: 0, cy: 0, ph: rand(0, PI2), sp: rand(0.4, 0.8) }));
  G.gulls.forEach((g) => { g.cx = g.x; g.cy = g.y; });
  G.clouds = Array.from({ length: 5 }, () => ({ x: rand(0, World.W), y: rand(0, World.H), s: rand(0.8, 1.4), seed: randi(0, 9999) }));
}

function toTitle() {
  World.generate(randi(1, 1e9));
  G.state = 'title'; G.stateT = 0; G.tod = 1; G.wave = 0;
  G.ships = []; G.balls = []; G.pending = []; G.parts = []; G.pickups = []; G.kegs = []; G.texts = [];
  G.up = { hull: 0, guns: 0, powder: 0, crew: 0, sails: 0 };
  G.player = makeShip('player', World.W / 2, World.H / 2, 0);
  G.player.throttle = 0.45;
  G.boss = null; G.banner = null; G.hint = null;
  initAmbience();
  snapCamera();
}

function newGame() {
  G.score = 0; G.gold = 0; G.kills = 0; G.goldEarned = 0; G.newBest = false;
  G.up = { hull: 0, guns: 0, powder: 0, crew: 0, sails: 0 };
  G.kegCount = 2; G.power = { rapid: 0, fire: 0 }; G.combo = 0; G.comboT = 0;
  G.hintStep = 0; G.moved = 0; G.firedHit = false;
  G.wave = 0;
  World.generate(randi(1, 1e9));
  resetField();
  G.player = makeShip('player', World.W / 2, World.H / 2, -PI / 2);
  initAmbience();
  snapCamera();
  startWave(1);
}

function resetField() {
  G.ships = []; G.balls = []; G.pending = []; G.parts = []; G.pickups = []; G.kegs = []; G.texts = [];
  G.boss = null; G.barrelT = 10;
}

function waveRoster(n) {
  if (n % 5 === 0) {
    const esc = n >= 10 ? ['brig', 'brig', 'burner'] : ['sloop', 'sloop'];
    return { boss: true, list: ['galleon', ...esc], title: 'BOSS BATTLE', sub: 'THE CRIMSON GALLEON' };
  }
  const pool = [['sloop', 1, 1, 5], ['brig', 2.2, 2, 4], ['burner', 1.3, 3, 2.5], ['frigate', 4, 4, 2.5]];
  let budget = 2 + n * 1.55;
  const list = [];
  const avail = pool.filter((p) => n >= p[2]);
  while (budget > 0.9 && list.length < 3 + n) {
    const opts = avail.filter((p) => p[1] <= budget + 0.4);
    if (!opts.length) break;
    let tw = opts.reduce((s, p) => s + p[3], 0), r = Math.random() * tw;
    let ch = opts[0];
    for (const p of opts) { r -= p[3]; if (r <= 0) { ch = p; break; } }
    list.push(ch[0]); budget -= ch[1];
  }
  if (n === 1) list.splice(0, list.length, 'sloop', 'sloop', 'sloop');
  const counts = {};
  list.forEach((k) => (counts[k] = (counts[k] || 0) + 1));
  const top = Object.keys(counts).sort((a, b) => counts[b] * SHIP_TYPES[b].hp - counts[a] * SHIP_TYPES[a].hp)[0];
  const subs = { sloop: 'PIRATE SLOOPS SIGHTED', brig: 'THE NAVY GIVES CHASE', burner: 'BEWARE THE FIRE SHIPS', frigate: 'WAR FRIGATES INBOUND' };
  if (n === 3) list.push('burner');
  return { boss: false, list, title: 'WAVE ' + n, sub: subs[top] || 'ENEMY SAILS!' };
}

function startWave(n) {
  G.wave = n;
  G.tod = todForWave(n);
  G.wind.a = rand(0, PI2);
  const r = waveRoster(n);
  G.spawnQueue = r.list.slice();
  G.spawnT = 1.2;
  G.banner = { title: r.title, sub: r.sub + ' - ' + TOD[G.tod].name, t: 0, dur: 3.2, boss: r.boss };
  G.state = 'playing'; G.stateT = 0;
  if (r.boss) Sound.fx.bossHorn(); else Sound.fx.fanfare();
  haptic('medium');
}

function spawnEnemy(kind) {
  const P = G.player;
  let pos = null;
  for (let i = 0; i < 80; i++) {
    const p = World.randomWater(-0.38, P, 230, 1);
    if (dist(p.x, p.y, P.x, P.y) < 230) continue;
    if (onScreen(p.x, p.y, 30) && i < 60) continue;
    pos = p; break;
  }
  if (!pos) pos = World.randomWater(-0.38, P, 160);
  const s = makeShip(kind, pos.x, pos.y, Math.atan2(P.y - pos.y, P.x - pos.x));
  s.speed = s.d.speed * 0.6;
  s.entering = 1;
  G.ships.push(s);
  if (s.d.boss) G.boss = s;
  return s;
}

function enemiesLeft() { return G.ships.filter((s) => s.alive).length + G.spawnQueue.length; }

function waveCleared() {
  G.state = 'clearing'; G.stateT = 0;
  const bonus = 8 + G.wave * 4;
  G.gold += bonus; G.goldEarned += bonus; G.goldBump = 1;
  G.score += 150 * G.wave;
  const ps = playerStats();
  G.player.hp = Math.min(ps.maxHp, G.player.hp + ps.maxHp * 0.15);
  G.kegCount = Math.min(5, G.kegCount + 1);
  G.banner = { title: 'WAVE CLEARED!', sub: '+' + bonus + ' GOLD BOUNTY', t: 0, dur: 2.8 };
  Sound.fx.victory();
  haptic('success');
  if (G.tutorial) { G.tutorial = false; Store.set('tutorialDone', true); G.hint = null; }
}

function openShop() { G.state = 'shop'; G.stateT = 0; G.shopPop = {}; }

function setSail() {
  const hp = G.player.hp;
  World.generate(randi(1, 1e9));
  resetField();
  G.player = makeShip('player', World.W / 2, World.H / 2, rand(0, PI2));
  G.player.hp = hp;
  initAmbience();
  snapCamera();
  startWave(G.wave + 1);
}

function buyUpgrade(u) {
  const lvl = u.repeat ? 0 : G.up[u.id];
  if (!u.repeat && lvl >= u.max) { Sound.fx.deny(); return false; }
  const cost = u.cost(lvl);
  const ps = playerStats();
  if (u.id === 'repair' && G.player.hp >= ps.maxHp && G.kegCount >= 5) { Sound.fx.deny(); return false; }
  if (G.gold < cost) { Sound.fx.deny(); haptic('error'); return false; }
  G.gold -= cost;
  if (u.id === 'repair') { G.player.hp = ps.maxHp; G.kegCount = Math.min(5, G.kegCount + 1); }
  else {
    const before = ps.maxHp;
    G.up[u.id]++;
    if (u.id === 'hull') G.player.hp += playerStats().maxHp - before;
  }
  G.player.maxHp = playerStats().maxHp;
  G.shopPop[u.id] = 1;
  Sound.fx.buy();
  haptic('success');
  return true;
}

function gameOver() {
  G.state = 'gameover'; G.stateT = 0;
  if (G.score > G.best) { G.best = G.score; G.newBest = true; Store.set('best', G.best); }
  if (G.wave > G.bestWave) { G.bestWave = G.wave; Store.set('bestWave', G.bestWave); }
}

function snapCamera() {
  const P = G.player;
  G.cam.x = clamp(P.x - view.w / 2, 0, Math.max(0, World.W - view.w));
  G.cam.y = clamp(P.y - view.h / 2, 0, Math.max(0, World.H - view.h));
}

// --- Combat ----------------------------------------------------------------
function shipStats(s) {
  if (s.team === 'player') return playerStats();
  const w = Math.max(1, G.wave);
  return { guns: s.d.guns, dmg: s.d.dmg * (1 + (w - 1) * 0.05), reload: s.d.reload * Math.max(0.7, 1 - (w - 1) * 0.02), range: s.d.range };
}

function sideNormal(s, side) { return s.a + side * (PI / 2); }

// Best target on a given broadside (side: -1 port, +1 starboard).
function findTarget(s, side, range) {
  const n = sideNormal(s, side);
  let best = null, bd = 1e9;
  const targets = s.team === 'player' ? G.ships : [G.player];
  for (const t of targets) {
    if (!t.alive || t === s) continue;
    const d = dist(s.x, s.y, t.x, t.y);
    if (d > range * 1.08 || d < 8) continue;
    const ang = Math.atan2(t.y - s.y, t.x - s.x);
    if (Math.abs(angDiff(n, ang)) > 0.62) continue;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function fireBroadside(s, side, target) {
  const st = shipStats(s);
  if (s.reload[side] > 0) return false;
  s.reload[side] = st.reload * (s.team === 'player' ? 1 : rand(0.9, 1.25));
  const n = st.guns;
  for (let i = 0; i < n; i++) G.pending.push({ s, side, i, n, target, delay: i * 0.075 + (s.team === 'player' ? 0 : rand(0, 0.03)), st });
  return true;
}

function launchBall(p) {
  const { s, side, i, n, target, st } = p;
  if (!s.alive) return;
  const ca = Math.cos(s.a), sa = Math.sin(s.a);
  const L = s.art.len;
  const gu = n === 1 ? 0 : lerp(-0.32, 0.28, i / (n - 1)) * L;
  const norm = sideNormal(s, side);
  const hw = Math.max(1, hullHalf(gu, s.art));
  const gx = s.x + ca * gu + Math.cos(norm) * (hw + 1.5);
  const gy = s.y + sa * gu + Math.sin(norm) * (hw + 1.5);
  let dir = norm + rand(-0.04, 0.04);
  let range = st.range * 0.86;
  if (target && target.alive) {
    let px = target.x, py = target.y;
    const tvx = Math.cos(target.a) * target.speed, tvy = Math.sin(target.a) * target.speed;
    for (let k = 0; k < 2; k++) {
      const T = dist(gx, gy, px, py) / BALL_SPEED;
      px = target.x + tvx * T; py = target.y + tvy * T;
    }
    const aim = Math.atan2(py - gy, px - gx);
    const dev = angDiff(norm, aim);
    const err = s.team === 'player' ? 0.02 : (s.d.aimErr || 0.08) * Math.max(0.5, 1 - (G.wave - 1) * 0.04);
    dir = norm + clamp(dev, -0.55, 0.55) + rand(-err, err);
    range = clamp(dist(gx, gy, px, py) * (1 + rand(-err, err)), 20, st.range);
    // Spread the shot pattern slightly along the target so broadsides "walk" across it.
    if (n > 1) dir += ((i / (n - 1)) - 0.5) * (s.team === 'player' ? 0.05 : 0.08);
  }
  const T = range / BALL_SPEED;
  G.balls.push({
    x: gx, y: gy, z: 3, vx: Math.cos(dir) * BALL_SPEED, vy: Math.sin(dir) * BALL_SPEED, vz: (GRAV * T) / 2,
    team: s.team, dmg: st.dmg * rand(0.88, 1.12), fire: s.team === 'player' && G.power.fire > 0, owner: s,
  });
  // Muzzle blast.
  const fx = Math.cos(norm), fy = Math.sin(norm);
  part({ k: 'flash', x: gx + fx * 2, y: gy + fy * 2, life: 0.09, s: 3 });
  for (let k = 0; k < 3; k++) part({ k: 'smoke', x: gx + fx * 3, y: gy + fy * 3, vx: fx * rand(18, 34) + rand(-6, 6), vy: fy * rand(18, 34) + rand(-6, 6), life: rand(0.7, 1.3), s: rand(2, 3.5), c: '#d4d4dc' });
  sparks(gx + fx * 2, gy + fy * 2, 2, 3);
  addLight(gx, gy, 24, '#ffcf70', 1);
  s.kx -= fx * 3.5; s.ky -= fy * 3.5;
  if (onScreen(gx, gy, 80)) Sound.fx.cannon(volFor(gx, gy) * (s.team === 'player' ? 0.9 : 0.6), panFor(gx));
  if (s.team === 'player') { addShake(1.6); if (i === 0) haptic('light'); }
}

function damageShip(s, amount, x, y, opts = {}) {
  if (!s.alive) return;
  amount = Math.max(1, Math.round(amount));
  s.hp -= amount;
  s.flashT = 0.09; s.hpShowT = 3;
  splinters(x, y, 6);
  smokePuff(x, y, 3, '#9a9aa6', 2.5, 12);
  sparks(x, y, 5);
  if (s.team === 'player') {
    addShake(4); G.hurtFlash = 0.35;
    floatText(x, y - 6, '-' + amount, '#ff6a5a');
    Sound.fx.hurt(); haptic('medium');
  } else {
    floatText(x, y - 6, amount, opts.fire ? '#ff9a3a' : '#ffe27a');
    G.score += amount;
    if (onScreen(x, y)) Sound.fx.hit(volFor(x, y), panFor(x));
    if (opts.fire) s.burn = Math.max(s.burn, 4);
    G.firedHit = true;
    haptic('select');
  }
  if (s.hp <= 0) sinkShip(s);
}

function sinkShip(s) {
  s.alive = false; s.hp = 0; s.sinkT = 0;
  const big = s.d.boss;
  explode(s.x, s.y, big ? 30 : 18, 0, 'none', big ? 2 : 1);
  debris(s.x, s.y, big ? 18 : 9);
  Sound.fx.sink(panFor(s.x));
  if (s.team === 'enemy') {
    G.kills++;
    G.combo = G.comboT > 0 ? G.combo + 1 : 1;
    G.comboT = 4.5;
    const mult = 1 + (G.combo - 1) * 0.5;
    const pts = Math.round(s.d.score * mult);
    G.score += pts;
    floatText(s.x, s.y - 14, '+' + pts, '#ffffff', 1, 1.4);
    if (G.combo >= 2) floatText(s.x, s.y - 24, G.combo + '× COMBO!', '#ffd23f', 1, 1.6);
    G.hitstop = big ? 0.22 : 0.07;
    addShake(big ? 9 : 5);
    haptic('heavy');
    const gold = Math.round(s.d.gold * (1 + (G.wave - 1) * 0.08));
    const coins = Math.min(gold, big ? 36 : 14);
    for (let i = 0; i < coins; i++) {
      const v = Math.floor(gold / coins) + (i < gold % coins ? 1 : 0);
      const a = rand(0, PI2), sp = rand(15, 55);
      G.pickups.push({ k: 'coin', x: s.x, y: s.y, z: 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(50, 110), v, t: 0, ph: rand(0, PI2) });
    }
    if (big || Math.random() < 0.2) {
      const k = Math.random() < 0.5 ? 'rapid' : 'fire';
      G.pickups.push({ k, x: s.x, y: s.y, z: 4, vx: rand(-10, 10), vy: rand(-10, 10), vz: 70, t: 0, ph: 0 });
    }
    if (G.boss === s) G.boss = null;
  } else {
    G.hitstop = 0.15; addShake(8); haptic('error');
    Sound.fx.gameover();
    G.state = 'sinking'; G.stateT = 0;
  }
}

function explode(x, y, r, dmg, team, power = 1) {
  part({ k: 'flash', x, y, life: 0.16, s: r * 0.45 });
  part({ k: 'ring', x, y, life: 0.5, s: r * 0.6, c: '#fff2c0' });
  part({ k: 'ring', x, y, life: 0.9, s: r, c: '#ffffff' });
  smokePuff(x, y, 8 * power, '#4a4650', 4 * power, 18);
  smokePuff(x, y, 5 * power, '#ff9a3a', 2.5, 22);
  sparks(x, y, 14 * power, 6);
  splinters(x, y, 8 * power);
  splash(x, y, true);
  addLight(x, y, 52, '#ffb050', 1);
  G.lights.push({ x, y, r: 52, c: '#ffb050', a: 1, persist: 0.25 });
  const d = dist(x, y, G.player.x, G.player.y);
  addShake(clamp(8 - d / 40, 1, 8) * power);
  if (onScreen(x, y, 120)) Sound.fx.explode(volFor(x, y) * Math.min(1.2, 0.7 + power * 0.3), panFor(x));
  if (dmg > 0) {
    const targets = team === 'player' ? G.ships : team === 'enemy' ? [G.player] : [];
    for (const s of targets) {
      if (!s.alive) continue;
      const dd = dist(x, y, s.x, s.y);
      if (dd > r + s.radius) continue;
      const f = 1 - clamp(dd / (r + s.radius), 0, 1) * 0.5;
      const a = Math.atan2(s.y - y, s.x - x);
      s.kx += Math.cos(a) * 25 * f; s.ky += Math.sin(a) * 25 * f;
      damageShip(s, dmg * f, s.x, s.y);
    }
  }
}

function dropKeg() {
  const P = G.player;
  if (G.kegCount <= 0 || !P.alive) { Sound.fx.deny(); return; }
  G.kegCount--;
  const bx = P.x - Math.cos(P.a) * (P.art.len * 0.6), by = P.y - Math.sin(P.a) * (P.art.len * 0.6);
  G.kegs.push({ x: bx, y: by, t: 0, z: 6, vz: 30 });
  Sound.fx.keg();
  haptic('light');
}

// --- Player input -> ship --------------------------------------------------
function playerControl(dt) {
  const P = G.player;
  if (!P.alive) { P.throttle = 0; return; }
  const ctl = Input.control();
  if (ctl.stick) {
    P.targetA = ctl.angle;
    P.throttle = 0.3 + 0.7 * ctl.mag;
    P.cruise = Math.max(0.35, P.throttle * 0.75);
    G.moved += P.speed * dt;
  } else if (ctl.turn !== 0 || ctl.throttle !== 0) {
    P.targetA = P.a + ctl.turn * 0.7;
    if (ctl.throttle > 0) P.throttle = 1;
    else if (ctl.throttle < 0) P.throttle = 0.12;
    else P.throttle = Math.max(P.throttle, 0.55);
    P.cruise = P.throttle;
    G.moved += P.speed * dt;
  } else {
    P.targetA = P.a;
    P.throttle = P.cruise;
  }

  const st = playerStats();
  const tryFire = (side, forced) => {
    if (P.reload[side] > 0) return false;
    const t = findTarget(P, side, st.range);
    if (!t && !forced) return false;
    return fireBroadside(P, side, t);
  };
  if (ctl.firePort) tryFire(-1, true);
  if (ctl.fireStar) tryFire(1, true);
  if (ctl.fire) {
    const a = tryFire(-1, false), b = tryFire(1, false);
    if (!a && !b && ctl.fireEdge) {
      // No target in either arc: shoot the side that faces the nearest enemy.
      let side = -1, best = 1e9;
      for (const e of G.ships) {
        if (!e.alive) continue;
        const d = dist(P.x, P.y, e.x, e.y);
        if (d < best) { best = d; side = angDiff(P.a, Math.atan2(e.y - P.y, e.x - P.x)) > 0 ? 1 : -1; }
      }
      if (!tryFire(side, true)) tryFire(-side, true);
    }
  }
  if (ctl.keg) dropKeg();
}

// --- Ship physics & AI ---------------------------------------------------------
function enemyAI(s, dt) {
  const P = G.player;
  s.thinkT -= dt;
  s.orbitT -= dt;
  if (s.orbitT <= 0) { s.orbit *= -1; s.orbitT = rand(7, 14); }
  const dx = P.x - s.x, dy = P.y - s.y;
  const d = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  if (!P.alive) { s.targetA = phi + PI / 2; s.throttle = 0.4; return; }
  if (s.kind === 'burner') {
    const T = d / (s.d.speed + 1);
    s.targetA = Math.atan2(P.y + Math.sin(P.a) * P.speed * T * 0.6 - s.y, P.x + Math.cos(P.a) * P.speed * T * 0.6 - s.x);
    s.throttle = 1;
    if (d < s.radius + P.radius + 3) { explode(s.x, s.y, 22, s.d.ram * (1 + (G.wave - 1) * 0.05), 'enemy', 1.2); s.alive = false; s.sinkT = 2; G.kills++; }
  } else if (s.thinkT <= 0) {
    s.thinkT = 0.15;
    const R = s.d.range * 0.68;
    const k = clamp((d - R) / R, -1, 1);
    let desired = phi + s.orbit * (PI / 2 - k * 1.05);
    s.throttle = d > s.d.range * 1.5 ? 1 : 0.72;
    s.targetA = desired;
  }
  // Steer around land.
  const probe = (a, L) => World.heightAt(s.x + Math.cos(a) * L, s.y + Math.sin(a) * L) > LAND - 0.1;
  const look = s.art.len * 0.6 + 16;
  if (probe(s.targetA, look) || probe(s.targetA, look * 0.5)) {
    for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
      const a = s.targetA + off * s.orbit;
      if (!probe(a, look) && !probe(a, look * 0.5)) { s.targetA = a; break; }
    }
  }
  // Keep a little distance from friends.
  for (const o of G.ships) {
    if (o === s || !o.alive) continue;
    const dd = dist(s.x, s.y, o.x, o.y);
    if (dd < s.radius + o.radius + 10) s.targetA += angDiff(s.targetA, Math.atan2(s.y - o.y, s.x - o.x)) * 0.25;
  }
  // Fire when the player crosses a broadside arc.
  if (s.d.guns > 0 && s.entering <= 0) {
    for (const side of [-1, 1]) {
      if (s.reload[side] > 0) continue;
      const t = findTarget(s, side, s.d.range);
      if (t && Math.abs(angDiff(sideNormal(s, side), phi)) < 0.42) fireBroadside(s, side, t);
    }
  }
  // Boss mortar volley.
  if (s.d.boss) {
    s.mortarT -= dt;
    if (s.mortarT <= 0 && d < 260) {
      s.mortarT = Math.max(4.5, 7 - G.wave * 0.1);
      for (let i = 0; i < 3; i++) {
        const T = 1.6 + i * 0.18;
        const tx = P.x + Math.cos(P.a) * P.speed * T + rand(-22, 22);
        const ty = P.y + Math.sin(P.a) * P.speed * T + rand(-22, 22);
        G.balls.push({ x: s.x, y: s.y, z: 6, vx: (tx - s.x) / T, vy: (ty - s.y) / T, vz: (GRAV * T) / 2, team: 'enemy', dmg: 14, shell: true, tx, ty, T, owner: s, t: 0 });
      }
      Sound.fx.cannon(0.8, panFor(s.x)); Sound.fx.whistle();
      smokePuff(s.x, s.y, 6, '#d4d4dc', 4, 14);
      addLight(s.x, s.y, 36, '#ffcf70');
    }
  }
}

function updateShip(s, dt) {
  if (!s.alive) {
    s.sinkT += dt;
    s.speed *= Math.exp(-dt * 1.5);
    s.a += dt * 0.25 * s.orbit;
    if (Math.random() < dt * 14) part({ k: 'bubble', x: s.x + rand(-s.radius, s.radius), y: s.y + rand(-s.radius * 0.6, s.radius * 0.6), life: rand(0.4, 0.9) });
    if (Math.random() < dt * 6 && s.sinkT < 1.5) smokePuff(s.x + rand(-6, 6), s.y + rand(-4, 4), 1, '#3a3640', 3, 6);
    s.x += (Math.cos(s.a) * s.speed + s.kx) * dt; s.y += (Math.sin(s.a) * s.speed + s.ky) * dt;
    return;
  }
  const isP = s.team === 'player';
  const ps = isP ? playerStats() : null;
  const maxSp = s.d.speed * (isP ? ps.speedMul : 1) * (0.86 + 0.18 * Math.cos(s.a - G.wind.a) * G.wind.s);
  const turnBase = s.d.turn * (isP ? ps.turnMul : 1);
  const turn = turnBase * (0.5 + 0.5 * clamp(Math.abs(s.speed) / s.d.speed, 0, 1));
  s.a += clamp(angDiff(s.a, s.targetA), -turn * dt, turn * dt);
  s.speed = approach(s.speed, s.throttle * maxSp, s.d.accel * dt);
  s.kx *= Math.exp(-dt * 2.5); s.ky *= Math.exp(-dt * 2.5);
  const ox = s.x, oy = s.y;
  s.x += (Math.cos(s.a) * s.speed + s.kx) * dt;
  s.y += (Math.sin(s.a) * s.speed + s.ky) * dt;
  for (const k of ['-1', '1']) s.reload[k] = Math.max(0, s.reload[k] - dt);
  s.flashT = Math.max(0, s.flashT - dt);
  s.hpShowT = Math.max(0, s.hpShowT - dt);
  if (s.entering > 0) s.entering = Math.max(0, s.entering - dt * 0.5);

  // Land collision: test bow, midships and stern.
  const ca = Math.cos(s.a), sa = Math.sin(s.a), half = s.art.len * 0.42;
  let hitLand = false;
  for (const u of [half, 0, -half]) {
    const px = s.x + ca * u, py = s.y + sa * u;
    if (World.heightAt(px, py) > LAND) {
      hitLand = true;
      const n = World.normalAt(px, py);
      s.kx += n.x * 30; s.ky += n.y * 30;
    }
  }
  if (hitLand) {
    s.x = ox; s.y = oy;
    if (s.speed > 18 && isP) {
      damageShip(s, 2, s.x + ca * half, s.y + sa * half);
      addShake(3);
    }
    s.speed *= 0.6;
    if (Math.random() < 0.5) part({ k: 'dust', x: s.x + ca * half, y: s.y + sa * half, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.7, s: 2, c: '#d8c08a' });
  }

  // Wake & bow spray.
  s.wakeT -= dt;
  const spd = Math.abs(s.speed);
  if (s.wakeT <= 0 && spd > 4) {
    s.wakeT = 0.05;
    const sx = s.x - ca * s.art.len * 0.5, sy = s.y - sa * s.art.len * 0.5;
    const nx = -sa, ny = ca;
    for (const side of [-1, 1]) part({ k: 'wake', x: sx + nx * side * 2, y: sy + ny * side * 2, vx: nx * side * 9, vy: ny * side * 9, life: 1.6 + spd / 40 });
    if (spd > 20) {
      const bx = s.x + ca * s.art.len * 0.5, by = s.y + sa * s.art.len * 0.5;
      part({ k: 'wake', x: bx + rand(-1, 1), y: by + rand(-1, 1), vx: nx * rand(-12, 12), vy: ny * rand(-12, 12), life: 0.6 });
    }
  }
  // Damage smoke and fire.
  s.smokeT -= dt;
  const hpf = s.hp / s.maxHp;
  if ((hpf < 0.45 || s.burn > 0) && s.smokeT <= 0) {
    s.smokeT = hpf < 0.2 || s.burn > 0 ? 0.08 : 0.2;
    const ox2 = rand(-0.3, 0.3) * s.art.len;
    smokePuff(s.x + ca * ox2, s.y + sa * ox2, 1, hpf < 0.25 ? '#3a3640' : '#8a8a96', 2.5, 4);
    if (hpf < 0.25 || s.burn > 0) part({ k: 'fire', x: s.x + ca * ox2 + rand(-2, 2), y: s.y + sa * ox2 + rand(-2, 2), vz: rand(10, 24), life: rand(0.3, 0.6) });
  }
  if (s.burn > 0) {
    s.burn -= dt;
    s.burnTick = (s.burnTick || 0) + dt;
    if (s.burnTick > 0.5) { s.burnTick = 0; damageShip(s, 2, s.x, s.y, { fire: true }); }
    addLight(s.x, s.y, 16, '#ff8a3a', 0.8);
  }
  if (hpf < 0.25) addLight(s.x, s.y, 14, '#ff8a3a', 0.6);
}

function shipCollisions() {
  const all = [G.player, ...G.ships];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (!a.alive || !b.alive) continue;
    const d = dist(a.x, a.y, b.x, b.y);
    const r = a.radius + b.radius;
    if (d >= r || d === 0) continue;
    const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
    const push = (r - d) * 0.5;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const rv = Math.hypot(Math.cos(a.a) * a.speed - Math.cos(b.a) * b.speed, Math.sin(a.a) * a.speed - Math.sin(b.a) * b.speed);
    a.kx -= nx * 18; a.ky -= ny * 18; b.kx += nx * 18; b.ky += ny * 18;
    if (a.team !== b.team && rv > 12) {
      const p = a.team === 'player' ? a : b, e = a.team === 'player' ? b : a;
      if (e.kind === 'burner') continue;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      damageShip(e, rv * 0.45, cx, cy);
      damageShip(p, rv * 0.18, cx, cy);
      addShake(5);
    }
  }
}

function updateBalls(dt) {
  for (let i = G.balls.length - 1; i >= 0; i--) {
    const b = G.balls[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vz -= GRAV * dt; b.z += b.vz * dt;
    if (b.shell) b.t += dt;
    if (Math.random() < dt * 20) part({ k: 'trail', x: b.x, y: b.y, z: b.z, life: 0.25 });
    let hit = false;
    if (!b.shell && b.z < 11) {
      const targets = b.team === 'player' ? G.ships : [G.player];
      for (const s of targets) {
        if (!s.alive || s.entering > 0.6) continue;
        const dx = b.x - s.x, dy = b.y - s.y;
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        const hu = s.art.len / 2 + 1.5, hv = s.art.beam / 2 + 2;
        if ((u * u) / (hu * hu) + (v * v) / (hv * hv) < 1) {
          damageShip(s, b.dmg, b.x, b.y, { fire: b.fire });
          if (b.team === 'player' && s.kind !== 'galleon') G.hitstop = Math.max(G.hitstop, 0.025);
          addLight(b.x, b.y, 20, '#ffb050');
          hit = true; break;
        }
      }
    }
    if (!hit && b.z <= 0) {
      if (b.shell) explode(b.x, b.y, 18, b.dmg * (1 + (G.wave - 1) * 0.04), 'enemy', 0.8);
      else if (World.heightAt(b.x, b.y) > LAND) { part({ k: 'dust', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.6, s: 3, c: '#d8c08a' }); smokePuff(b.x, b.y, 2, '#c9b48a', 2, 8); }
      else { splash(b.x, b.y); if (onScreen(b.x, b.y)) Sound.fx.splash(volFor(b.x, b.y) * 0.8, panFor(b.x)); }
      hit = true;
    }
    if (hit || b.x < -50 || b.y < -50 || b.x > World.W + 50 || b.y > World.H + 50) G.balls.splice(i, 1);
  }
  for (let i = G.pending.length - 1; i >= 0; i--) {
    const p = G.pending[i];
    p.delay -= dt;
    if (p.delay <= 0) { launchBall(p); G.pending.splice(i, 1); }
  }
}

function updateParts(dt) {
  const wx = Math.cos(G.wind.a) * 5, wy = Math.sin(G.wind.a) * 5;
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    switch (p.k) {
      case 'smoke':
        p.vx = p.vx * Math.exp(-dt * 2) + wx * dt * 2; p.vy = p.vy * Math.exp(-dt * 2) + wy * dt * 2;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += dt * 8;
        break;
      case 'spark': case 'drop': case 'splinter':
        p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= GRAV * dt; p.z += p.vz * dt;
        if (p.z <= 0) { if (p.k === 'splinter' && Math.random() < 0.3) part({ k: 'debris', x: p.x, y: p.y, vx: 0, vy: 0, life: rand(2, 4), w: 2, h: 1, c: p.c }); p.life = 0; }
        break;
      case 'fire':
        p.z += p.vz * dt; p.x += wx * dt; p.y += wy * dt;
        break;
      case 'wake': case 'debris': case 'dust':
        p.vx *= Math.exp(-dt * 1.5); p.vy *= Math.exp(-dt * 1.5);
        p.x += p.vx * dt; p.y += p.vy * dt;
        break;
      case 'sparkle':
        p.x += p.vx * dt; p.y += p.vy * dt;
        break;
      default: break;
    }
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.t += dt;
    if (t.t >= t.max) G.texts.splice(i, 1);
  }
}

function updatePickups(dt) {
  const P = G.player;
  const strongMagnet = G.state === 'clearing';
  G.coinStepT -= dt;
  if (G.coinStepT <= 0) G.coinStep = 0;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const c = G.pickups[i];
    c.t += dt;
    if (c.z > 0 || c.vz > 0) {
      c.vz -= GRAV * dt; c.z += c.vz * dt;
      if (c.z <= 0) { c.z = 0; if (c.vz < -40) { c.vz = -c.vz * 0.3; part({ k: 'ring', x: c.x, y: c.y, life: 0.4, s: 3 }); } else c.vz = 0; }
    }
    c.vx *= Math.exp(-dt * 1.8); c.vy *= Math.exp(-dt * 1.8);
    if (P.alive) {
      const d = dist(c.x, c.y, P.x, P.y);
      const mag = strongMagnet ? 9999 : c.k === 'coin' ? 46 : 28;
      if (d < mag && c.t > 0.45) {
        const pull = strongMagnet ? 260 : 160 * (1 - d / mag) + 40;
        c.vx += ((P.x - c.x) / d) * pull * dt * 3; c.vy += ((P.y - c.y) / d) * pull * dt * 3;
      }
      if (d < P.radius + 4 && c.t > 0.35) { collect(c); G.pickups.splice(i, 1); continue; }
    }
    c.x += c.vx * dt; c.y += c.vy * dt;
    const life = c.k === 'coin' ? 28 : 30;
    if (c.t > life) G.pickups.splice(i, 1);
  }
  // Floating repair barrels drift in now and then.
  if (G.state === 'playing') {
    G.barrelT -= dt;
    if (G.barrelT <= 0) {
      G.barrelT = rand(16, 24);
      if (G.pickups.filter((p) => p.k === 'repair').length < 2) {
        const pos = World.randomWater(-0.25, null, 0);
        if (dist(pos.x, pos.y, P.x, P.y) > 60) G.pickups.push({ k: 'repair', x: pos.x, y: pos.y, z: 0, vx: rand(-4, 4), vy: rand(-4, 4), vz: 0, t: 0, ph: rand(0, PI2) });
      }
    }
  }
}

function collect(c) {
  const P = G.player;
  const ps = playerStats();
  for (let i = 0; i < 5; i++) part({ k: 'sparkle', x: c.x + rand(-3, 3), y: c.y + rand(-3, 3), vx: rand(-10, 10), vy: rand(-22, -6), life: rand(0.3, 0.6) });
  if (c.k === 'coin') {
    G.gold += c.v; G.goldEarned += c.v; G.goldBump = 1;
    Sound.fx.coin(G.coinStep); G.coinStep++; G.coinStepT = 0.5;
    G.score += 5 * c.v;
    haptic('select');
  } else if (c.k === 'repair') {
    P.hp = Math.min(ps.maxHp, P.hp + 25);
    floatText(P.x, P.y - 16, '+25 HULL', '#7dff9a', 1, 1.2);
    Sound.fx.repair(); haptic('light');
  } else if (c.k === 'rapid') {
    G.power.rapid = 10; P.reload['-1'] = 0; P.reload['1'] = 0;
    floatText(P.x, P.y - 16, 'RAPID FIRE!', '#ffe060', 1, 1.4);
    Sound.fx.pickup(); haptic('success');
  } else if (c.k === 'fire') {
    G.power.fire = 12;
    floatText(P.x, P.y - 16, 'FIRE SHOT!', '#ff8a3a', 1, 1.4);
    Sound.fx.pickup(); haptic('success');
  }
}

function updateKegs(dt) {
  for (let i = G.kegs.length - 1; i >= 0; i--) {
    const k = G.kegs[i];
    k.t += dt;
    if (k.z > 0) { k.vz -= GRAV * dt; k.z = Math.max(0, k.z + k.vz * dt); if (k.z === 0) splash(k.x, k.y); }
    let boom = k.t > 16;
    if (k.t > 0.8) for (const s of G.ships) if (s.alive && dist(s.x, s.y, k.x, k.y) < s.radius + 12) boom = true;
    if (Math.floor(k.t * 3) % 2 === 0) addLight(k.x, k.y, 10, '#ff4030', 0.8);
    if (boom) { explode(k.x, k.y, 32, 55 * (1 + G.up.powder * 0.2), 'player', 1.4); G.kegs.splice(i, 1); }
  }
}

function updateAmbience(dt) {
  for (const g of G.gulls) {
    g.ph += dt * g.sp;
    g.x = g.cx + Math.cos(g.ph) * g.r; g.y = g.cy + Math.sin(g.ph) * g.r * 0.6;
    g.cx += Math.cos(G.wind.a) * 4 * dt; g.cy += Math.sin(G.wind.a) * 4 * dt;
    if (g.cx < -80) g.cx = World.W + 60; if (g.cx > World.W + 80) g.cx = -60;
    if (g.cy < -80) g.cy = World.H + 60; if (g.cy > World.H + 80) g.cy = -60;
  }
  for (const c of G.clouds) {
    c.x += Math.cos(G.wind.a) * 6 * dt; c.y += Math.sin(G.wind.a) * 6 * dt;
    if (c.x < -120) c.x = World.W + 100; if (c.x > World.W + 120) c.x = -100;
    if (c.y < -120) c.y = World.H + 100; if (c.y > World.H + 120) c.y = -100;
  }
  G.wind.a += Math.sin(G.t * 0.05) * dt * 0.02;
}

function updateCamera(dt) {
  const P = G.player;
  const lead = 0.7;
  const tx = P.x + Math.cos(P.a) * P.speed * lead - view.w / 2;
  const ty = P.y + Math.sin(P.a) * P.speed * lead - view.h / 2;
  const k = 1 - Math.exp(-dt * 3.5);
  G.cam.x = clamp(lerp(G.cam.x, tx, k), 0, Math.max(0, World.W - view.w));
  G.cam.y = clamp(lerp(G.cam.y, ty, k), 0, Math.max(0, World.H - view.h));
}

function updateHints(dt) {
  if (!G.tutorial || G.state !== 'playing') { G.hint = null; return; }
  const touch = Input.touchMode;
  const steps = [
    { text: touch ? 'DRAG ON THE LEFT TO STEER' : 'STEER WITH WASD / ARROWS', done: () => G.moved > 120, focus: 'stick' },
    { text: 'RED ARROWS POINT TO ENEMIES', done: (t) => t > 3.5 },
    { text: touch ? 'HOLD FIRE WHEN A SHIP IS AT YOUR SIDE' : 'HOLD SPACE WHEN A SHIP IS AT YOUR SIDE', done: () => G.firedHit, focus: 'fire' },
    { text: 'SINK THEM AND GRAB THE GOLD!', done: (t) => t > 4 },
  ];
  if (G.hintStep >= steps.length) { G.hint = null; return; }
  if (!G.hint || G.hint.step !== G.hintStep) G.hint = { step: G.hintStep, t: 0, ...steps[G.hintStep] };
  G.hint.t += dt;
  if (G.hint.done(G.hint.t)) G.hintStep++;
}

function update(dt) {
  G.t += dt;
  G.stateT += dt;
  G.shake = Math.max(0, G.shake - dt * 18);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt);
  G.goldBump = Math.max(0, G.goldBump - dt * 4);
  for (const k in G.shopPop) G.shopPop[k] = Math.max(0, G.shopPop[k] - dt * 3);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
  G.lights = G.lights.filter((l) => l.persist && (l.persist -= dt) > 0);

  if (G.state === 'shop' || G.state === 'gameover' || G.state === 'paused') {
    if (G.state !== 'paused') { updateParts(dt * 0.5); updateAmbience(dt); }
    return;
  }
  if (G.hitstop > 0) { G.hitstop -= dt; return; }

  const P = G.player;
  if (G.state === 'title') {
    P.targetA = P.a + 0.35;
    P.throttle = 0.5;
    // Keep the attract-mode ship in open water.
    const ahead = World.heightAt(P.x + Math.cos(P.a) * 40, P.y + Math.sin(P.a) * 40);
    if (ahead > LAND - 0.15) P.targetA = P.a + 1.2;
  } else {
    playerControl(dt);
  }
  updateShip(P, dt);
  for (const s of G.ships) {
    if (s.alive && G.state !== 'title') enemyAI(s, dt);
    updateShip(s, dt);
  }
  G.ships = G.ships.filter((s) => s.alive || s.sinkT < 2.6);
  shipCollisions();
  updateBalls(dt);
  updateKegs(dt);
  updatePickups(dt);
  updateParts(dt);
  updateAmbience(dt);
  updateCamera(dt);
  updateHints(dt);
  for (const k in G.power) G.power[k] = Math.max(0, G.power[k] - dt);
  G.comboT = Math.max(0, G.comboT - dt);
  if (G.comboT === 0) G.combo = 0;

  // Lanterns at dusk and night.
  if (TOD[G.tod].night > 0.2) {
    for (const s of [P, ...G.ships]) if (s.alive) addLight(s.x - Math.cos(s.a) * s.art.len * 0.4, s.y - Math.sin(s.a) * s.art.len * 0.4, s.d.boss ? 24 : 14, '#ffd27a', 0.8);
  }

  if (G.state === 'playing') {
    G.spawnT -= dt;
    const alive = G.ships.filter((s) => s.alive).length;
    if (G.spawnQueue.length && (G.spawnT <= 0 || alive === 0)) {
      const burst = G.stateT < 2 ? Math.min(G.spawnQueue.length, 1 + Math.floor(G.wave / 3)) : 1;
      for (let i = 0; i < burst; i++) spawnEnemy(G.spawnQueue.shift());
      G.spawnT = rand(5, 8) - Math.min(2.5, G.wave * 0.15);
    }
    if (!G.spawnQueue.length && alive === 0 && G.stateT > 2) waveCleared();
  } else if (G.state === 'clearing') {
    if (G.stateT > 3.2 && !G.pickups.some((p) => p.k === 'coin')) openShop();
    else if (G.stateT > 6) openShop();
  } else if (G.state === 'sinking') {
    if (G.stateT > 2.6) gameOver();
  }
}

// ---------------------------------------------------------------------------
// Rendering of the world layer.
// ---------------------------------------------------------------------------
function pixCircle(ctx, cx, cy, r, color, fill = false) {
  ctx.fillStyle = color;
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y);
    if (fill ? d <= r + 0.3 : Math.abs(d - r) < 0.55) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
  }
}
function pixTri(ctx, ax, ay, bx, by, cx, cy, color) {
  ctx.fillStyle = color;
  const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx));
  const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  const e = (x1_, y1_, x2_, y2_, px, py) => (x2_ - x1_) * (py - y1_) - (y2_ - y1_) * (px - x1_);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = e(bx, by, cx, cy, px, py), w1 = e(cx, cy, ax, ay, px, py), w2 = e(ax, ay, bx, by, px, py);
    if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) ctx.fillRect(x, y, 1, 1);
  }
}
function pixLineDotted(ctx, pts, color, gap = 3, phase = 0) {
  ctx.fillStyle = color;
  let acc = phase;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s < L; s += 1) {
      acc += 1;
      if (acc % gap < 1) ctx.fillRect(Math.round(x0 + ((x1 - x0) * s) / L), Math.round(y0 + ((y1 - y0) * s) / L), 1, 1);
    }
  }
}

function drawShip(ctx, s, cx, cy) {
  const spr = Art.ships[s.d.art];
  const fi = Art.shipFrame(s.kind, s.a);
  const S = spr.size;
  const bob = Math.round(Math.sin(G.t * 2 + s.bobPh) * 0.6);
  const x = Math.round(s.x - cx - S / 2), y = Math.round(s.y - cy - S / 2) + bob;
  if (!s.alive) {
    const k = clamp(s.sinkT / 2.6, 0, 1);
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(spr.frames[fi], x, y + Math.round(k * 3));
    ctx.globalAlpha = 1;
    if (Math.floor(G.t * 8) % 2 === 0) ctx.drawImage(Art.ring(Math.round(s.radius * (0.8 + k)), '#d8f4ff'), Math.round(s.x - cx - s.radius * (0.8 + k)) - 1, Math.round(s.y - cy - s.radius * (0.8 + k)) - 1);
    return;
  }
  ctx.drawImage(spr.shadows[fi], x, y - bob);
  const enter = s.entering;
  if (enter > 0) ctx.globalAlpha = 1 - enter * 0.7;
  ctx.drawImage(s.flashT > 0 ? spr.flashes[fi] : spr.frames[fi], x, y);
  ctx.globalAlpha = 1;
  // Pennant on the main mast streaming downwind.
  const m = s.art.masts[0] * s.art.len * 0.5;
  const mx = Math.round(s.x - cx + Math.cos(s.a) * m), my = Math.round(s.y - cy + Math.sin(s.a) * m) + bob;
  const fl = Math.floor(G.t * 6 + s.bobPh) % 2;
  const wx = Math.cos(G.wind.a), wy = Math.sin(G.wind.a);
  const flagC = s.team === 'player' ? '#ff4a4a' : s.d.boss ? '#f0c04a' : s.kind === 'brig' ? '#4a8aff' : '#141418';
  ctx.fillStyle = flagC;
  for (let i = 1; i <= 3; i++) ctx.fillRect(Math.round(mx + wx * i + (i === 3 && fl ? -wy : 0)), Math.round(my + wy * i - 1 + (i === 3 && fl ? wx : 0)), 1, 1);
}

function drawPickup(ctx, c, cx, cy) {
  const bob = Math.sin(G.t * 3 + c.ph) * 0.8;
  const x = Math.round(c.x - cx), y = Math.round(c.y - cy);
  const zy = Math.round(c.z * 0.6 + (c.z === 0 ? bob : 0));
  const life = c.k === 'coin' ? 28 : 30;
  if (c.t > life - 4 && Math.floor(c.t * 8) % 2) return;
  ctx.fillStyle = 'rgba(6,20,44,0.35)';
  ctx.fillRect(x - 2, y + 2, 5, 1);
  if (c.k === 'coin') {
    const f = Math.floor(G.t * 8 + c.ph * 3) % 4;
    const w = [4, 3, 1, 3][f];
    ctx.fillStyle = '#7a4a0a'; ctx.fillRect(x - Math.ceil(w / 2) - 1 + 1, y - zy - 2, w + 1, 5);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - Math.ceil(w / 2), y - zy - 2, w, 4);
    ctx.fillStyle = '#fff6c0'; if (w > 1) ctx.fillRect(x - Math.ceil(w / 2), y - zy - 2, 1, 1);
    ctx.fillStyle = '#d68a1a'; ctx.fillRect(x - Math.ceil(w / 2), y - zy + 1, w, 1);
  } else if (c.k === 'repair') {
    const Y = y - zy - 4;
    ctx.fillStyle = '#24140c'; ctx.fillRect(x - 4, Y - 1, 9, 9);
    ctx.fillStyle = '#9a6234'; ctx.fillRect(x - 3, Y, 7, 7);
    ctx.fillStyle = '#c4884e'; ctx.fillRect(x - 3, Y, 7, 1);
    ctx.fillStyle = '#5a3518'; ctx.fillRect(x - 3, Y + 2, 7, 1); ctx.fillRect(x - 3, Y + 5, 7, 1);
    ctx.fillStyle = '#5dff7a'; ctx.fillRect(x, Y + 1, 1, 5); ctx.fillRect(x - 2, Y + 3, 5, 1);
  } else {
    const Y = y - zy - 5;
    const icon = Art.icons[c.k];
    if (Math.floor(G.t * 4) % 2) pixCircle(ctx, x, Y + 3, 6, c.k === 'rapid' ? '#ffe060' : '#ff8a3a');
    ctx.fillStyle = '#24140c'; ctx.fillRect(x - 5, Y - 2, 11, 11);
    ctx.fillStyle = '#c99258'; ctx.fillRect(x - 4, Y - 1, 9, 9);
    ctx.drawImage(icon, x - 3, Y);
  }
}

function drawCloudShadow(ctx, c, cx, cy) {
  const x0 = Math.round(c.x - cx), y0 = Math.round(c.y - cy);
  const R = 34 * c.s;
  if (x0 < -R * 2 || y0 < -R || x0 > view.w + R * 2 || y0 > view.h + R) return;
  ctx.fillStyle = 'rgba(6,20,44,0.16)';
  const blobs = [[0, 0, 1], [-0.9, 0.15, 0.7], [0.95, 0.1, 0.75], [0.3, -0.35, 0.6]];
  for (const [bx, by, br] of blobs) {
    const r = R * br * 0.6;
    const X = x0 + bx * R, Y = y0 + by * R * 0.7;
    for (let y = -r * 0.6; y <= r * 0.6; y += 2) {
      const w = Math.sqrt(Math.max(0, 1 - (y / (r * 0.6)) ** 2)) * r;
      ctx.fillRect(Math.round(X - w), Math.round(Y + y), Math.round(w * 2), 2);
    }
  }
}

function drawGull(ctx, g, cx, cy) {
  const x = Math.round(g.x - cx), y = Math.round(g.y - cy);
  if (x < -10 || y < -10 || x > view.w + 10 || y > view.h + 10) return;
  ctx.fillStyle = 'rgba(6,20,44,0.25)';
  ctx.fillRect(x + 6, y + 14, 3, 1);
  const up = Math.floor(G.t * 5 + g.ph * 3) % 2;
  ctx.fillStyle = '#f4f4f8';
  if (up) { ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); ctx.fillRect(x - 1, y, 3, 1); }
  else { ctx.fillRect(x - 2, y, 2, 1); ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x, y + 1, 1, 1); }
  ctx.fillStyle = '#9a9aa8'; ctx.fillRect(x, y, 1, 1);
}

function drawParticle(ctx, p, cx, cy, layer) {
  const a = clamp(p.life / p.max, 0, 1);
  const x = Math.round(p.x - cx), y = Math.round(p.y - cy - p.z * 0.6);
  switch (p.k) {
    case 'wake':
      if (layer !== 0) return;
      ctx.fillStyle = `rgba(235,250,255,${0.55 * a})`;
      ctx.fillRect(x, y, a > 0.6 ? 2 : 1, 1);
      break;
    case 'ring':
      if (layer !== 0) return;
      ctx.globalAlpha = a * 0.8;
      { const r = Math.round(p.s * (1.15 - a * 0.6)); ctx.drawImage(Art.ring(r, p.c || '#e8fbff'), x - r - 1, y - r - 1); }
      ctx.globalAlpha = 1;
      break;
    case 'debris':
      if (layer !== 0) return;
      ctx.globalAlpha = Math.min(1, a * 3);
      ctx.fillStyle = p.c; ctx.fillRect(x, y, p.rot ? 1 : p.w, p.rot ? p.w : 1);
      ctx.globalAlpha = 1;
      break;
    case 'bubble':
      if (layer !== 0) return;
      ctx.fillStyle = '#dff6ff'; if (a > 0.5) ctx.fillRect(x, y, 1, 1); else { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); }
      break;
    case 'dust':
      if (layer !== 1) return;
      ctx.globalAlpha = a; ctx.drawImage(Art.puff(p.s * (1.4 - a * 0.4), p.c), x - Math.round(p.s), y - Math.round(p.s)); ctx.globalAlpha = 1;
      break;
    case 'smoke': {
      if (layer !== 1) return;
      const r = Math.max(1, Math.round(p.s * (1.6 - a * 0.7)));
      ctx.globalAlpha = Math.min(1, a * 1.4) * 0.85;
      ctx.drawImage(Art.puff(r, p.c), x - r, y - r);
      ctx.globalAlpha = 1;
      break;
    }
    case 'flash': {
      if (layer !== 1) return;
      const r = Math.max(1, Math.round(p.s * (1.3 - a * 0.3)));
      ctx.drawImage(Art.puff(r, a > 0.5 ? '#fff8d8' : '#ffb84a'), x - r, y - r);
      break;
    }
    case 'spark': case 'drop': case 'splinter': case 'sparkle':
      if (layer !== 1) return;
      ctx.fillStyle = p.k === 'sparkle' ? (a > 0.5 ? '#ffffff' : '#ffd23f') : p.c;
      ctx.fillRect(x, y, 1, 1);
      if (p.k === 'sparkle' && a > 0.5) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      break;
    case 'fire':
      if (layer !== 1) return;
      ctx.fillStyle = a > 0.66 ? '#fff0a0' : a > 0.33 ? '#ffa030' : '#c83a1a';
      ctx.fillRect(x, y, a > 0.5 ? 2 : 1, a > 0.5 ? 2 : 1);
      break;
    case 'trail':
      if (layer !== 1) return;
      ctx.fillStyle = `rgba(220,220,230,${0.4 * a})`; ctx.fillRect(x, y, 1, 1);
      break;
    default: break;
  }
}

function drawBall(ctx, b, cx, cy) {
  const x = Math.round(b.x - cx), y = Math.round(b.y - cy);
  ctx.fillStyle = 'rgba(6,20,44,0.4)';
  ctx.fillRect(x, y, 2, 1);
  const by = Math.round(y - b.z * 0.6);
  const big = b.shell;
  ctx.fillStyle = '#0e0e14'; ctx.fillRect(x - (big ? 1 : 0), by - 1, big ? 4 : 3, big ? 4 : 3);
  ctx.fillStyle = b.fire ? '#ff7a2a' : '#3a3a48'; ctx.fillRect(x, by, big ? 2 : 1, big ? 2 : 1);
  if (b.fire) { ctx.fillStyle = '#ffe060'; ctx.fillRect(x, by, 1, 1); }
}

function drawWorldLayer(ctx) {
  const shx = G.shake > 0.2 ? Math.round(rand(-G.shake, G.shake)) : 0;
  const shy = G.shake > 0.2 ? Math.round(rand(-G.shake, G.shake)) : 0;
  const cx = Math.round(G.cam.x) - shx, cy = Math.round(G.cam.y) - shy;
  World.draw(ctx, { x: cx, y: cy }, G.t, view.w, view.h);
  for (const p of G.parts) drawParticle(ctx, p, cx, cy, 0);
  for (const c of G.pickups) drawPickup(ctx, c, cx, cy);
  for (const k of G.kegs) {
    const x = Math.round(k.x - cx), y = Math.round(k.y - cy - k.z * 0.6 + Math.sin(G.t * 3 + k.x) * 0.7);
    ctx.drawImage(Art.icons.keg, x - 3, y - 4);
    if (Math.floor(k.t * (k.t > 12 ? 10 : 3)) % 2 === 0) { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(x, y - 5, 1, 1); }
  }
  for (const b of G.balls) if (b.shell) {
    const r = 9 + Math.round(Math.sin(G.t * 14) * 1.5);
    const k = clamp(b.t / b.T, 0, 1);
    ctx.globalAlpha = 0.35 + k * 0.5;
    ctx.drawImage(Art.ring(r, '#ff3a2a'), Math.round(b.tx - cx) - r - 1, Math.round(b.ty - cy) - r - 1);
    ctx.drawImage(Art.ring(Math.max(1, Math.round(r * (1 - k))), '#ffb0a0'), Math.round(b.tx - cx) - Math.round(r * (1 - k)) - 1, Math.round(b.ty - cy) - Math.round(r * (1 - k)) - 1);
    ctx.globalAlpha = 1;
  }
  const ships = [G.player, ...G.ships].filter(Boolean).sort((a, b) => a.y - b.y);
  for (const s of ships) drawShip(ctx, s, cx, cy);
  for (const b of G.balls) drawBall(ctx, b, cx, cy);
  for (const p of G.parts) drawParticle(ctx, p, cx, cy, 1);
  for (const c of G.clouds) drawCloudShadow(ctx, c, cx, cy);
  for (const g of G.gulls) drawGull(ctx, g, cx, cy);

  // Time of day grading + lights.
  const tod = TOD[G.tod];
  if (tod.mul) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = tod.a;
    ctx.fillStyle = tod.mul;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    const nightK = tod.night;
    const lights = G.lights.slice();
    if (nightK > 0.3) for (const l of World.lights) lights.push({ ...l, a: 0.7 });
    for (const l of lights) {
      const x = l.x - cx, y = l.y - cy;
      if (x < -60 || y < -60 || x > view.w + 60 || y > view.h + 60) continue;
      const g = Art.glow(l.r, l.c);
      ctx.globalAlpha = clamp(l.a * (0.25 + nightK * 0.75), 0, 1);
      ctx.drawImage(g.c, Math.round(x - g.r), Math.round(y - g.r));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  return { cx, cy };
}
