'use strict';
// ---------------------------------------------------------------------------
// Campaign: four seas of five hand-designed waves, then endless voyages.
// Each sea introduces a new threat, a sea condition and its own boss.
// Bonus boats: defeat a boss, or sink every merchant of a treasure convoy.
// ---------------------------------------------------------------------------

const LIFE_CAP = 9;

Object.assign(SHIP_ART, {
  corsair: {
    len: 20, beam: 7, masts: [0.18, -0.25], span: [1.0, 1.08], guns: 2,
    pal: { trim: '#c23a3a', hull: '#1c1c24', deck1: '#6a5040', deck2: '#5a4436', qdeck: '#7a5a46', sail: '#2e2a34', stripe: '#c23a3a', yard: '#120c0c', lantern: '#ff6a4a', outline: '#08060a' },
  },
  ketch: {
    len: 22, beam: 11, masts: [-0.3], span: [1.0], guns: 1, barrels: true,
    pal: { trim: '#a08850', hull: '#4a3a2a', deck1: '#8a6a4a', deck2: '#7a5c3e', qdeck: '#96764e', sail: '#cdbb90', stripe: null, yard: '#2a1c10', lantern: '#ffb050', outline: '#140c06' },
  },
  ironclad: {
    len: 30, beam: 12, masts: [0.02], span: [0.8], guns: 4,
    pal: { trim: '#9aa0a8', hull: '#3a3e46', deck1: '#5a5e66', deck2: '#50545c', qdeck: '#686c74', sail: '#a4a4a8', stripe: null, yard: '#22252a', lantern: '#ffb060', outline: '#0c0d10' },
  },
  merchant: {
    len: 26, beam: 13, masts: [0.25, -0.2], span: [0.95, 1.0], guns: 0, barrels: true,
    pal: { trim: '#e0c070', hull: '#7a5a32', deck1: '#c8a46a', deck2: '#b8945a', qdeck: '#d4b07a', sail: '#fff8e8', stripe: '#2a8a4a', yard: '#5a3a18', lantern: '#ffe27a', outline: '#1e1408' },
  },
  leviathan: {
    len: 42, beam: 16, masts: [0.3, -0.2], span: [0.8, 0.85], guns: 6,
    pal: { trim: '#b0302a', hull: '#2c3038', deck1: '#4e525a', deck2: '#464a52', qdeck: '#5a5e66', sail: '#7a7a82', stripe: '#b0302a', yard: '#16181c', lantern: '#ff8a4a', outline: '#08090c' },
  },
  ghost: {
    len: 38, beam: 14, masts: [0.42, 0.05, -0.3], span: [0.9, 1.08, 0.95], guns: 5,
    pal: { trim: '#9af0dc', hull: '#2e5a5a', deck1: '#4a7a74', deck2: '#3e6a64', qdeck: '#5a8a84', sail: '#c8f4ec', stripe: '#7ad8c8', yard: '#1a3a3a', lantern: '#9affea', outline: '#06201e' },
  },
  flagship: {
    len: 44, beam: 16, masts: [0.45, 0.08, -0.3], span: [0.95, 1.12, 1.0], guns: 7,
    pal: { trim: '#f0c04a', hull: '#1f2f6a', deck1: '#8a6a4a', deck2: '#7a5c40', qdeck: '#9a7a54', sail: '#f4f4f8', stripe: '#2a4aa8', yard: '#141c3a', lantern: '#ffe27a', outline: '#080c1e' },
  },
});

SHIP_TYPES.galleon.mortar = { cd: 7.5, n: 3, dmg: 11, spread: 22 };
SHIP_TYPES.galleon.flag = '#f0c04a';
SHIP_TYPES.brig.flag = '#4a8aff';
Object.assign(SHIP_TYPES, {
  corsair: { art: 'corsair', name: 'CORSAIR', hp: 42, speed: 46, accel: 30, turn: 2.2, guns: 2, dmg: 8, reload: 2.3, range: 118, gold: 8, score: 320, aimErr: 0.07, ai: 'skirmish', flag: '#c23a3a' },
  ketch: { art: 'ketch', name: 'BOMB KETCH', hp: 60, speed: 25, accel: 12, turn: 1.0, guns: 1, dmg: 7, reload: 3.4, range: 115, gold: 10, score: 380, aimErr: 0.09, ai: 'artillery', mortar: { cd: 5.5, n: 2, dmg: 12, spread: 18 }, flag: '#e0a030' },
  ironclad: { art: 'ironclad', name: 'IRONCLAD', hp: 160, armor: 0.45, speed: 23, accel: 10, turn: 0.9, guns: 3, dmg: 11, reload: 3.3, range: 140, gold: 16, score: 650, aimErr: 0.065, flag: '#8a9098' },
  merchant: { art: 'merchant', name: 'MERCHANT', hp: 50, speed: 32, accel: 16, turn: 1.2, guns: 0, dmg: 0, reload: 99, range: 0, gold: 22, score: 300, ai: 'flee', escape: 55, flag: '#2a8a4a' },
  leviathan: { art: 'leviathan', name: 'IRON LEVIATHAN', hp: 480, armor: 0.4, speed: 20, accel: 8, turn: 0.6, guns: 5, dmg: 9, reload: 3.8, range: 150, gold: 80, score: 4000, aimErr: 0.06, boss: true, mortar: { cd: 7, n: 5, dmg: 10, spread: 34 }, flag: '#b0302a' },
  ghost: { art: 'ghost', name: 'GHOST GALLEON', hp: 520, speed: 30, accel: 14, turn: 0.95, guns: 4, dmg: 10, reload: 3.5, range: 150, gold: 100, score: 5500, aimErr: 0.05, boss: true, phase: { cd: 9, dur: 2.2 }, glow: '#9affea', flag: '#9affea' },
  flagship: { art: 'flagship', name: "ADMIRAL'S FLAGSHIP", hp: 720, speed: 22, accel: 9, turn: 0.7, guns: 5, dmg: 10, reload: 3.6, range: 158, gold: 130, score: 8000, aimErr: 0.055, boss: true, mortar: { cd: 8, n: 3, dmg: 11, spread: 22 }, summon: { kind: 'burner', cd: 13, n: 2 }, enrage: true, flag: '#2a4aa8' },
});

// --- The voyage ----------------------------------------------------------------
const M = 'merchant';
const SEAS = [
  {
    name: 'THE SHALLOWS',
    waves: [
      { list: ['sloop', 'sloop', 'sloop'], sub: 'PIRATE SLOOPS SIGHTED' },
      { list: ['sloop', 'brig', 'sloop', 'sloop'], sub: 'THE NAVY GIVES CHASE' },
      { convoy: true, list: [M, M, M, 'sloop', 'sloop'], title: 'TREASURE CONVOY', sub: 'SINK EVERY MERCHANT FOR A BONUS BOAT' },
      { list: ['brig', 'burner', 'sloop', 'brig', 'burner'], sub: 'BEWARE THE FIRE SHIPS' },
      { boss: 'galleon', list: ['galleon', 'sloop', 'sloop'] },
    ],
  },
  {
    name: "SMUGGLERS' REACH",
    waves: [
      { list: ['corsair', 'corsair', 'sloop', 'sloop'], sub: 'NEW: CORSAIRS - FAST AND SLIPPERY' },
      { mod: 'fog', list: ['corsair', 'brig', 'brig', 'burner', 'sloop'], sub: 'FOG ROLLS IN - WATCH THE ARROWS' },
      { convoy: true, list: [M, M, M, M, 'corsair', 'brig'], title: 'TREASURE CONVOY', sub: 'SINK EVERY MERCHANT FOR A BONUS BOAT' },
      { list: ['ketch', 'frigate', 'brig', 'sloop', 'burner'], sub: 'NEW: BOMB KETCHES - DODGE THE RED RINGS' },
      { boss: 'leviathan', list: ['leviathan', 'brig', 'ketch'] },
    ],
  },
  {
    name: 'STORMWATER',
    waves: [
      { mod: 'storm', list: ['ironclad', 'brig', 'brig', 'corsair'], sub: 'NEW: IRONCLADS - POWDER KEGS PIERCE ARMOR' },
      { list: ['frigate', 'ketch', 'ketch', 'corsair', 'burner', 'burner'], sub: 'CROSSFIRE' },
      { mod: 'storm', convoy: true, list: [M, M, M, M, 'ironclad', 'corsair', 'corsair'], title: 'STORM CONVOY', sub: 'SINK EVERY MERCHANT FOR A BONUS BOAT' },
      { mod: 'fog', list: ['ironclad', 'frigate', 'corsair', 'corsair', 'ketch', 'burner'], sub: 'GHOSTS IN THE FOG' },
      { boss: 'ghost', list: ['ghost', 'corsair', 'corsair', 'burner'] },
    ],
  },
  {
    name: 'THE ABYSS',
    waves: [
      { list: ['ironclad', 'ironclad', 'ketch', 'corsair', 'corsair', 'burner'], sub: 'THE ADMIRAL SENDS HIS BEST' },
      { mod: 'storm', list: ['frigate', 'frigate', 'ketch', 'ketch', 'corsair', 'burner', 'burner'], sub: 'THE TEMPEST' },
      { mod: 'fog', convoy: true, list: [M, M, M, M, M, 'ironclad', 'frigate', 'corsair'], title: 'GOLD FLEET', sub: 'SINK EVERY MERCHANT FOR A BONUS BOAT' },
      { list: ['ironclad', 'ironclad', 'frigate', 'ketch', 'ketch', 'corsair', 'corsair', 'burner'], sub: 'THE LAST LINE' },
      { boss: 'flagship', list: ['flagship', 'ironclad', 'corsair', 'burner'] },
    ],
  },
];
const PLAN_LEN = SEAS.length * 5;
const BOSS_SUBS = {
  galleon: 'THE CRIMSON GALLEON - BEAT IT FOR A BONUS BOAT',
  leviathan: 'THE IRON LEVIATHAN - KEGS PIERCE ITS ARMOR',
  ghost: 'THE GHOST GALLEON - IT VANISHES AND REAPPEARS',
  flagship: "THE ADMIRAL'S FLAGSHIP - FINAL BATTLE",
};

function planFor(n) {
  const i = (n - 1) % PLAN_LEN;
  return { sea: Math.floor(i / 5), entry: SEAS[Math.floor(i / 5)].waves[i % 5], loop: Math.floor((n - 1) / PLAN_LEN) };
}

// Enemy toughness: mostly from composition, with gentle stat growth.
function difficulty(n) {
  const w = Math.max(1, n);
  // Smooth growth that keeps rising through endless voyages; the sea plan adds the rhythm.
  const e = w - 1, loop = Math.floor(e / PLAN_LEN);
  return { hp: 1 + 0.03 * e + 0.0016 * e * e, dmg: 1 + 0.02 * e + 0.001 * e * e, aim: Math.max(0.4, 1 - 0.02 * e), loop };
}

function waveRoster(n) {
  const { sea, entry, loop } = planFor(n);
  let list = entry.list.slice();
  let mod = entry.mod || null;
  if (loop > 0) {
    // Endless voyages: tougher crews, more ships, unpredictable weather.
    list = list.map((k) => (k === 'sloop' ? 'corsair' : k === 'brig' && Math.random() < 0.6 ? 'frigate' : k === 'frigate' && Math.random() < 0.3 ? 'ironclad' : k));
    const extra = 2 + Math.ceil(list.length * 0.3 * loop);
    for (let i = 0; i < extra; i++) list.push(pick(['corsair', 'frigate', 'ketch', 'ironclad', 'burner']));
    if (!mod && !entry.boss && Math.random() < 0.4) mod = pick(['fog', 'storm']);
  }
  // A lost boat last wave earns a slightly gentler next one.
  if (G.ease) {
    for (let i = list.length - 1; i > 0; i--) if (list[i] !== M && !SHIP_TYPES[list[i]].boss) { list.splice(i, 1); break; }
  }
  const merchants = list.filter((k) => k === M).length;
  const seaStart = (n - 1) % 5 === 0 && n > 1;
  let title = entry.title || 'WAVE ' + n;
  let sub = entry.boss ? BOSS_SUBS[entry.boss] : entry.sub;
  if (seaStart) { title = SEAS[sea].name; sub = 'SEA ' + (sea + 1) + (loop ? ' (ENDLESS ' + (loop + 1) + ')' : '') + ' - ' + entry.sub; }
  else if (entry.boss) title = 'BOSS BATTLE';
  if (loop > 0 && !seaStart) sub = 'ENDLESS ' + (loop + 1) + ' - ' + sub;
  return {
    list, title, sub, mod, boss: !!entry.boss, convoy: merchants > 0 ? merchants : 0,
    burst: merchants ? merchants + 1 : Math.min(list.length, 1 + Math.floor(Math.min(n, 20) / 4)),
  };
}

function wavePreview(n, maxW = 1e9) {
  const { entry } = planFor(n);
  const what = entry.boss ? SHIP_TYPES[entry.boss].name : entry.convoy ? 'TREASURE CONVOY' : null;
  const mod = entry.mod ? ' (' + entry.mod.toUpperCase() + ')' : '';
  const bonus = entry.boss || entry.convoy ? ' - BONUS BOAT' : '';
  const long = 'NEXT: WAVE ' + n + (what ? ' ' + what : '') + mod + bonus;
  if (Font.width(long) <= maxW) return long;
  const mid = 'WAVE ' + n + (what ? ' ' + (entry.boss ? 'BOSS' : 'CONVOY') : '') + mod + (bonus ? ' +BOAT' : '');
  return Font.width(mid) <= maxW ? mid : 'NEXT: WAVE ' + n;
}

// Rewards granted when a wave is cleared.
function waveRewards() {
  const { entry } = planFor(G.wave);
  if (entry.boss) return { boats: 1, why: 'BOSS SUNK' };
  if (G.convoy && G.convoy.total > 0 && G.convoy.escaped === 0) return { boats: 1, why: 'CONVOY PLUNDERED' };
  return { boats: 0, why: G.convoy && G.convoy.escaped > 0 ? G.convoy.escaped + ' MERCHANT' + (G.convoy.escaped > 1 ? 'S' : '') + ' ESCAPED' : '' };
}

function escapeShip(s) {
  s.alive = false; s.escaped = true; s.sinkT = 0;
  if (G.convoy) G.convoy.escaped++;
  floatText(s.x, s.y - 14, 'ESCAPED!', '#ff8a7a', 1, 1.4);
  splash(s.x, s.y, false);
  Sound.fx.deny();
}

// --- Special abilities --------------------------------------------------------
function fireMortar(s, cfg) {
  const P = G.player;
  const dm = difficulty(G.wave).dmg;
  for (let i = 0; i < cfg.n; i++) {
    const T = 1.6 + i * 0.16;
    let tx = P.x + Math.cos(P.a) * P.speed * T, ty = P.y + Math.sin(P.a) * P.speed * T;
    if (cfg.n >= 5) { const a = (i / cfg.n) * PI2; tx += Math.cos(a) * cfg.spread; ty += Math.sin(a) * cfg.spread; }
    else { tx += rand(-cfg.spread, cfg.spread); ty += rand(-cfg.spread, cfg.spread); }
    G.balls.push({ x: s.x, y: s.y, z: 6, vx: (tx - s.x) / T, vy: (ty - s.y) / T, vz: (GRAV * T) / 2, team: 'enemy', dmg: cfg.dmg * dm, shell: true, tx, ty, T, owner: s, t: 0 });
  }
  if (onScreen(s.x, s.y, 120)) { Sound.fx.cannon(0.8, panFor(s.x)); Sound.fx.whistle(); }
  smokePuff(s.x, s.y, 5, '#d4d4dc', 4, 14);
  addLight(s.x, s.y, 36, '#ffcf70');
}

function bossAbilities(s, dt, d) {
  const P = G.player;
  if (s.d.phase) {
    s.phaseT = (s.phaseT == null ? s.d.phase.cd : s.phaseT) - dt;
    if (s.phaseT <= 0 && d < 300) {
      s.phaseT = s.d.phase.cd * (s.enraged ? 0.7 : 1);
      // Vanish, then surface beside or behind the player.
      for (let i = 0; i < 16; i++) {
        const a = P.a + PI + rand(-1.3, 1.3), r = rand(95, 130);
        const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
        if (World.heightAt(x, y) < LAND - 0.25 && World.heightAt(x + 15, y) < LAND - 0.2 && World.heightAt(x - 15, y) < LAND - 0.2) {
          part({ k: 'ring', x: s.x, y: s.y, life: 0.8, s: 16, c: '#9affea' });
          s.x = x; s.y = y; s.a = Math.atan2(P.y - y, P.x - x) + PI / 2 * s.orbit;
          s.invuln = s.d.phase.dur;
          part({ k: 'ring', x, y, life: 0.9, s: 18, c: '#9affea' });
          Sound.fx.whistle();
          break;
        }
      }
    }
  }
  if (s.d.summon) {
    s.summonT = (s.summonT == null ? s.d.summon.cd * 0.6 : s.summonT) - dt;
    const burners = G.ships.filter((o) => o.alive && o.kind === s.d.summon.kind).length;
    if (s.summonT <= 0 && burners < 4) {
      s.summonT = s.d.summon.cd * (s.enraged ? 0.7 : 1);
      for (let i = 0; i < s.d.summon.n; i++) {
        const side = i % 2 ? 1 : -1;
        const x = s.x - Math.cos(s.a) * s.art.len * 0.6 + Math.cos(s.a + PI / 2) * side * 14;
        const y = s.y - Math.sin(s.a) * s.art.len * 0.6 + Math.sin(s.a + PI / 2) * side * 14;
        const b = makeShip(s.d.summon.kind, x, y, s.a + side * 0.8);
        b.entering = 0.6; b.speed = 20;
        G.ships.push(b);
        splash(x, y, false);
      }
      floatText(s.x, s.y - 22, 'FIRE SHIPS LAUNCHED!', '#ff9a3a', 1, 1.4);
    }
  }
}

function checkEnrage(s) {
  if (!s.d.enrage || s.enraged || s.hp > s.maxHp * 0.5) return;
  s.enraged = true;
  G.banner = { title: 'ENRAGED!', sub: s.d.name + ' FIGHTS HARDER', t: 0, dur: 2, boss: true };
  Sound.fx.bossHorn();
  addShake(5);
}

// --- Sea conditions ---------------------------------------------------------------
let _fog = null;
function fogMask() {
  const W = view.w * 2, H = view.h * 2;
  if (_fog && _fog.width === W && _fog.height === H) return _fog;
  _fog = makeCanvas(W, H);
  const x = _fog.getContext('2d');
  const img = x.createImageData(W, H);
  const R0 = Math.min(view.w, view.h) * 0.42, R1 = R0 * 1.9;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const d = Math.hypot(i - W / 2, j - H / 2);
    const f = clamp((d - R0) / (R1 - R0), 0, 1) * 4;
    const lv = Math.floor(f) + (f - Math.floor(f) > bayer(i, j) ? 1 : 0);
    const k = (j * W + i) * 4;
    img.data[k] = 196; img.data[k + 1] = 210; img.data[k + 2] = 222;
    img.data[k + 3] = [0, 70, 130, 185, 228][Math.min(4, lv)];
  }
  x.putImageData(img, 0, 0);
  return _fog;
}

function updateWeather(dt) {
  if (G.mod !== 'storm' || G.state === 'title') return;
  G.lightningT = (G.lightningT == null ? rand(3, 7) : G.lightningT) - dt;
  if (G.lightningT <= 0) {
    G.lightningT = rand(6, 12);
    G.flashT = 0.16;
    Sound.fx.thunder();
    haptic('light');
  }
  G.flashT = Math.max(0, (G.flashT || 0) - dt);
}

// Fog sits under the time-of-day grading so it darkens at night.
function drawWeatherUnder(ctx, cx, cy) {
  if (G.mod === 'fog' && G.player) {
    const f = fogMask();
    const px = Math.round(G.player.x - cx - f.width / 2), py = Math.round(G.player.y - cy - f.height / 2);
    ctx.drawImage(f, px, py);
    ctx.fillStyle = 'rgba(196,210,222,0.89)';
    if (px > 0) ctx.fillRect(0, 0, px, view.h);
    if (py > 0) ctx.fillRect(0, 0, view.w, py);
    if (px + f.width < view.w) ctx.fillRect(px + f.width, 0, view.w, view.h);
    if (py + f.height < view.h) ctx.fillRect(0, py + f.height, view.w, view.h);
  }
}

function drawWeatherOver(ctx) {
  if (G.mod !== 'storm') return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(110,128,160,0.55)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.globalCompositeOperation = 'source-over';
  const W = view.w + 20, H = view.h + 20, t = G.t;
  const sx = Math.cos(G.wind.a) > 0 ? 1 : -1;
  for (let i = 0; i < 140; i++) {
    const x = ((i * 97.31 + t * 90 * sx) % W + W) % W - 10;
    const y = ((i * 53.77 + i * i * 0.37 + t * 330) % H) - 10;
    ctx.fillStyle = i % 3 ? 'rgba(190,210,240,0.45)' : 'rgba(230,240,255,0.6)';
    ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
    ctx.fillRect(Math.round(x + sx), Math.round(y + 2), 1, 2);
  }
  if (G.flashT > 0) {
    ctx.fillStyle = `rgba(235,240,255,${clamp(G.flashT * 4, 0, 0.6)})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}
