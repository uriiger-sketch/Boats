'use strict';
// ---------------------------------------------------------------------------
// HUD, touch controls, menus and the harbor shop - all drawn as pixel art.
// ---------------------------------------------------------------------------

const INK = '#1a1220';
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Safari on iOS in a normal tab (not already installed, not inside the native app).
const CAN_INSTALL_IOS = IS_IOS && /^https?:$/.test(location.protocol) && !navigator.standalone && !(window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
const _shadeCache = new Map();
const sh = (c, a) => { const k = c + a; let v = _shadeCache.get(k); if (!v) { v = shadeHex(c, a); _shadeCache.set(k, v); } return v; };

function txt(ctx, s, x, y, color = '#fff', o = {}) { return Font.draw(ctx, s, x, y, color, { outline: INK, ...o }); }

function drawPanel(ctx, x, y, w, h, style = 'wood') {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  if (style === 'wood') {
    ctx.fillStyle = '#8a5530'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#b8774a'; ctx.fillRect(x + 2, y + 1, w - 4, 1);
    ctx.fillStyle = '#5a3518'; ctx.fillRect(x + 2, y + h - 2, w - 4, 1);
    ctx.fillStyle = '#3a2416'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = '#f0deb0'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = '#e4cc98'; ctx.fillRect(x + 4, y + h - 7, w - 8, 3);
    ctx.fillStyle = '#fbf0cc'; ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillStyle = '#e8b85a';
    for (const [nx, ny] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(nx, ny, 1, 1);
  } else if (style === 'card') {
    ctx.fillStyle = '#5a3518'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#7a4a28'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#8f5a32'; ctx.fillRect(x + 2, y + 2, w - 4, 1);
  } else {
    ctx.fillStyle = 'rgba(10,20,40,0.8)'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(160,200,240,0.3)'; ctx.fillRect(x + 2, y + 1, w - 4, 1);
  }
}

function drawButton(ctx, id, x, y, w, h, label, onTap, o = {}) {
  x = Math.round(x); y = Math.round(y);
  uiButton(id, x, y, w, h, onTap);
  const pressed = UI.pressed === id;
  const c = o.disabled ? '#6a6a76' : o.color || '#d8433b';
  const oy = pressed ? 1 : 0;
  ctx.fillStyle = INK;
  ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = sh(c, -50); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1 + oy, w - 2, h - 4);
  ctx.fillStyle = sh(c, 45); ctx.fillRect(x + 2, y + 1 + oy, w - 4, 1);
  let tx = x + w / 2;
  if (o.icon) {
    const iw = o.icon.width;
    const tw = Font.width(label) + iw + 3;
    ctx.drawImage(o.icon, Math.round(x + w / 2 - tw / 2), Math.round(y + (h - 3 - o.icon.height) / 2) + oy);
    tx = x + w / 2 + (iw + 3) / 2;
  }
  Font.draw(ctx, label, tx, y + Math.floor((h - 3 - 7) / 2) + oy, '#ffffff', { align: 'center', outline: sh(c, -80) });
}

function drawBar(ctx, x, y, w, h, f, color, back = '#2a1a22') {
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(f, 0, 1));
  ctx.fillStyle = color; ctx.fillRect(x, y, fw, h);
  ctx.fillStyle = sh(color, 50); ctx.fillRect(x, y, fw, 1);
  if (h > 2) { ctx.fillStyle = sh(color, -45); ctx.fillRect(x, y + h - 1, fw, 1); }
}

// Cached solid pixel discs for the touch buttons.
const _discs = new Map();
function disc(r, fill, rim, hi) {
  const k = r + fill + rim + hi;
  let c = _discs.get(k);
  if (c) return c;
  const s = r * 2 + 3;
  c = makeCanvas(s, s);
  const x = c.getContext('2d');
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const dx = i - r - 1, dy = j - r - 1, d = Math.hypot(dx, dy);
    if (d > r + 1.3) continue;
    x.fillStyle = d > r + 0.3 ? INK : d > r - 1.2 ? rim : (dx + dy < -r * 0.6 && d > r * 0.55) ? hi : fill;
    x.fillRect(i, j, 1, 1);
  }
  _discs.set(k, c);
  return c;
}

const _ringPix = new Map();
function ringPixels(r) {
  let a = _ringPix.get(r);
  if (a) return a;
  a = [];
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (Math.abs(d - r) < 0.75) a.push({ x, y, ang: Math.atan2(y + 0.5, x + 0.5) });
  }
  _ringPix.set(r, a);
  return a;
}

// --- In-game overlays --------------------------------------------------------
function drawAim(ctx, cam) {
  const P = G.player;
  if (!P.alive || G.state !== 'playing') return;
  const st = playerStats();
  for (const side of [-1, 1]) {
    const t = findTarget(P, side, st.range);
    if (!t) continue;
    const ready = P.reload[side] <= 0;
    const n = sideNormal(P, side);
    const hw = P.art.beam / 2 + 2;
    const gx = P.x + Math.cos(n) * hw, gy = P.y + Math.sin(n) * hw;
    const d = dist(gx, gy, t.x, t.y);
    const peak = (GRAV * Math.pow(d / BALL_SPEED, 2)) / 8;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      pts.push([lerp(gx, t.x, k) - cam.cx, lerp(gy, t.y, k) - cam.cy - 4 * peak * k * (1 - k) * 0.6]);
    }
    pixLineDotted(ctx, pts, ready ? 'rgba(255,236,170,0.85)' : 'rgba(200,205,220,0.35)', 4, Math.floor(G.t * 12));
    if (ready) {
      const r = Math.round(t.art.len / 2 + 3 + (Math.floor(G.t * 6) % 2));
      const x = Math.round(t.x - cam.cx), y = Math.round(t.y - cam.cy);
      ctx.fillStyle = '#ffe27a';
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(x + sx * r - (sx > 0 ? 2 : 0), y + sy * r, 3, 1);
        ctx.fillRect(x + sx * r, y + sy * r - (sy > 0 ? 2 : 0), 1, 3);
      }
    }
  }
}

function drawShipBars(ctx, cam) {
  for (const s of G.ships) {
    if (!s.alive || s.d.boss || (s.hpShowT <= 0 && s.hp >= s.maxHp)) continue;
    const w = Math.round(s.art.len * 0.8);
    const x = Math.round(s.x - cam.cx - w / 2), y = Math.round(s.y - cam.cy - s.art.len * 0.5 - 6);
    drawBar(ctx, x, y, w, 2, s.hp / s.maxHp, s.hp / s.maxHp > 0.35 ? '#ff6a4a' : '#ff3a2a');
  }
}

function drawFloatTexts(ctx, cam) {
  for (const t of G.texts) {
    const k = t.t / t.max;
    const y = t.y - cam.cy - easeOutCubic(k) * 14;
    if (k > 0.75 && Math.floor(t.t * 20) % 2) continue;
    txt(ctx, t.text, t.x - cam.cx, y, t.color, { align: 'center', scale: t.scale });
  }
}

function drawArrows(ctx) {
  const cx = view.w / 2, cy = view.h / 2;
  for (const s of G.ships) {
    if (!s.alive) continue;
    const sx = s.x - G.cam.x, sy = s.y - G.cam.y;
    if (sx > 0 && sy > 0 && sx < view.w && sy < view.h) continue;
    const a = Math.atan2(sy - cy, sx - cx);
    const m = 12;
    const kx = (view.w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), ky = (view.h / 2 - m) / Math.abs(Math.sin(a) || 1e-6);
    const k = Math.min(kx, ky);
    const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    const pulse = Math.floor(G.t * 4) % 2;
    const sz = (s.d.boss ? 7 : 5) + pulse;
    const ca = Math.cos(a), sa = Math.sin(a);
    const col = s.d.boss ? '#ffd23f' : s.kind === 'burner' ? '#ff9a3a' : '#ff4a4a';
    pixTri(ctx, x + ca * sz + ca, y + sa * sz + sa, x - sa * sz * 0.7 - ca * 2, y + ca * sz * 0.7 - sa * 2, x + sa * sz * 0.7 - ca * 2, y - ca * sz * 0.7 - sa * 2, INK);
    pixTri(ctx, x + ca * sz, y + sa * sz, x - sa * sz * 0.6 - ca, y + ca * sz * 0.6 - sa, x + sa * sz * 0.6 - ca, y - ca * sz * 0.6 - sa, col);
  }
}

function drawHUD(ctx) {
  const s = view.safe;
  const L = Math.round(s.l + 5), T = Math.round(s.t + 4), R = Math.round(view.w - s.r - 5);
  const P = G.player, ps = playerStats();
  const hpf = P.hp / ps.maxHp;
  // Hull.
  ctx.drawImage(Art.icons.heart, L, T);
  const hc = hpf > 0.5 ? '#5dd36a' : hpf > 0.25 ? '#ffc23f' : (Math.floor(G.t * 5) % 2 ? '#ff4a4a' : '#ff8a7a');
  const bw = Math.round(52 + G.up.hull * 6);
  drawBar(ctx, L + 10, T + 1, bw, 5, hpf, hc);
  ctx.fillStyle = 'rgba(26,18,32,0.5)';
  for (let i = 25; i < ps.maxHp; i += 25) ctx.fillRect(L + 10 + Math.round((bw * i) / ps.maxHp), T + 1, 1, 5);
  // Gold & kegs.
  const bump = G.goldBump > 0 ? 1 : 0;
  ctx.drawImage(Art.icons.coin, L, T + 10);
  txt(ctx, G.gold, L + 9, T + 10 - bump, '#ffd23f');
  const kx = L + 12 + Font.width(String(G.gold)) + 6;
  ctx.drawImage(Art.icons.keg, kx, T + 9);
  txt(ctx, '×' + G.kegCount, kx + 8, T + 10, '#ffffff');
  // Power-ups.
  let px = L;
  for (const k of ['rapid', 'fire']) {
    if (G.power[k] <= 0) continue;
    if (G.power[k] < 2.5 && Math.floor(G.t * 8) % 2) { px += 24; continue; }
    ctx.drawImage(Art.icons[k], px, T + 20);
    drawBar(ctx, px + 9, T + 23, 12, 2, G.power[k] / (k === 'rapid' ? 10 : 12), k === 'rapid' ? '#ffe060' : '#ff8a3a');
    px += 26;
  }
  // Wave + enemies.
  const cx = Math.round(view.w / 2);
  txt(ctx, 'WAVE ' + G.wave, cx, T, '#ffffff', { align: 'center' });
  const left = enemiesLeft();
  const lw = Font.width(String(left)) + 10;
  ctx.drawImage(Art.icons.skull, cx - Math.round(lw / 2), T + 9);
  txt(ctx, left, cx - Math.round(lw / 2) + 10, T + 9, left ? '#ff8a7a' : '#7dff9a');
  // Boss bar.
  if (G.boss && G.boss.alive) {
    const w = Math.min(150, view.w - 140);
    txt(ctx, G.boss.d.name, cx, T + 19, '#ffd23f', { align: 'center' });
    drawBar(ctx, cx - Math.round(w / 2), T + 28, w, 4, G.boss.hp / G.boss.maxHp, '#c2304a');
  }
  // Score, pause, wind.
  drawButton(ctx, 'pause', R - 15, T - 1, 16, 14, '', pauseGame, { color: '#3d6fb8' });
  ctx.drawImage(Art.icons.pause, R - 11, T + 2 + (UI.pressed === 'pause' ? 1 : 0));
  txt(ctx, String(G.score).padStart(6, '0'), R - 19, T + 1, '#ffffff', { align: 'right' });
  const wx = R - 26, wy = T + 17;
  ctx.drawImage(disc(5, 'rgba(10,20,40,0.6)', 'rgba(160,200,240,0.5)', 'rgba(10,20,40,0.6)'), wx - 6, wy - 6);
  const wa = G.wind.a;
  for (let i = -3; i <= 3; i++) { ctx.fillStyle = i > 1 ? '#ffffff' : '#9fd4f0'; ctx.fillRect(Math.round(wx + Math.cos(wa) * i) , Math.round(wy + Math.sin(wa) * i), 1, 1); }
  txt(ctx, 'WIND', wx - 9, wy - 3, '#9fd4f0', { align: 'right' });
  // Voyage saved toast.
  if (G.savedT > 0 && (G.savedT > 0.6 || Math.floor(G.t * 10) % 2)) {
    const y = Math.round(view.h - view.safe.b - 14);
    const label = 'VOYAGE SAVED';
    const w = Font.width(label) + 22;
    drawPanel(ctx, cx - Math.round(w / 2), y - 4, w, 15, 'dark');
    ctx.drawImage(Art.icons.anchor, cx - Math.round(w / 2) + 5, y - 1);
    txt(ctx, label, cx + 5, y, '#7dff9a', { align: 'center' });
  }
  // Combo.
  if (G.combo >= 2 && G.comboT > 0) {
    const y = T + (G.boss && G.boss.alive ? 38 : 20);
    txt(ctx, G.combo + '× COMBO', cx, y, Math.floor(G.t * 8) % 2 ? '#ffd23f' : '#ffffff', { align: 'center' });
    drawBar(ctx, cx - 18, y + 9, 36, 1, G.comboT / 4.5, '#ffd23f');
  }
}

function drawControls(ctx) {
  const s = view.safe;
  const P = G.player;
  const st = playerStats();
  const fx = Math.round(view.w - s.r - 32), fy = Math.round(view.h - s.b - 30);
  const fr = 20;
  UI.zones.fire = { x: fx, y: fy, r: fr };
  const kx = fx - 42, ky = fy + 8, kr = 11;
  UI.zones.keg = { x: kx, y: ky, r: kr };
  if (!Input.touchMode) {
    const lines = ['WASD/ARROWS STEER', 'SPACE FIRE  Q/E SIDES', 'K KEG   P PAUSE'];
    lines.forEach((l, i) => txt(ctx, l, view.w - s.r - 5, view.h - s.b - 28 + i * 9, 'rgba(255,255,255,0.7)', { align: 'right' }));
    return;
  }
  const pressed = Input.fireHeld;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(disc(fr, pressed ? '#9a2a24' : '#c8352e', pressed ? '#6a1a16' : '#e8584a', pressed ? '#b8352e' : '#ff7a6a'), fx - fr - 1, fy - fr - 1 + (pressed ? 1 : 0));
  ctx.globalAlpha = 1;
  ctx.drawImage(Art.icons.cannon, fx - 8, fy - 10 + (pressed ? 1 : 0), 16, 14);
  Font.draw(ctx, 'FIRE', fx, fy + 6 + (pressed ? 1 : 0), '#ffffff', { align: 'center', outline: '#5a1410' });
  // Reload ring: left half = port, right half = starboard.
  const ring = ringPixels(fr + 3);
  const prog = { '-1': 1 - P.reload['-1'] / st.reload, '1': 1 - P.reload['1'] / st.reload };
  const hasT = { '-1': !!findTarget(P, -1, st.range), '1': !!findTarget(P, 1, st.range) };
  const blink = Math.floor(G.t * 6) % 2;
  for (const p of ring) {
    const side = Math.cos(p.ang) < 0 ? '-1' : '1';
    const f = (Math.sin(p.ang) + 1) / 2;
    const fill = 1 - f <= prog[side];
    ctx.fillStyle = fill ? (prog[side] >= 1 ? (hasT[side] && blink ? '#ffffff' : '#ffd23f') : '#d8d8e4') : 'rgba(26,18,32,0.55)';
    ctx.fillRect(fx + p.x, fy + p.y, 1, 1);
  }
  // Powder keg button.
  const kp = UI.pressed === 'keg';
  ctx.drawImage(disc(kr, G.kegCount ? '#3d6fb8' : '#4a4a56', G.kegCount ? '#6a9ae0' : '#6a6a76', '#8ab8ff'), kx - kr - 1, ky - kr - 1 + (kp ? 1 : 0));
  ctx.drawImage(Art.icons.keg, kx - 3, ky - 6 + (kp ? 1 : 0));
  txt(ctx, G.kegCount, kx + 5, ky + 2, '#ffffff');
  // Joystick.
  const stck = Input.stick;
  if (stck.active) {
    const dx = stck.x - stck.ox, dy = stck.y - stck.oy, d = Math.hypot(dx, dy), m = Math.min(d, stck.R);
    const nx = d ? (dx / d) * m : 0, ny = d ? (dy / d) * m : 0;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(Art.ring(stck.R, '#ffffff'), Math.round(stck.ox) - stck.R - 1, Math.round(stck.oy) - stck.R - 1);
    ctx.drawImage(Art.ring(stck.R - 1, '#1a1220'), Math.round(stck.ox) - stck.R, Math.round(stck.oy) - stck.R);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(disc(9, '#e8e8f0', '#ffffff', '#ffffff'), Math.round(stck.ox + nx) - 10, Math.round(stck.oy + ny) - 10);
    ctx.globalAlpha = 1;
  } else {
    const gx = Math.round(s.l + 40), gy = Math.round(view.h - s.b - 34);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(Art.ring(stck.R, '#ffffff'), gx - stck.R - 1, gy - stck.R - 1);
    ctx.drawImage(disc(9, '#e8e8f0', '#ffffff', '#ffffff'), gx - 10, gy - 10);
    ctx.globalAlpha = 0.6;
    Font.draw(ctx, 'STEER', gx, gy + stck.R + 3, '#ffffff', { align: 'center' });
    ctx.globalAlpha = 1;
    UI.zones.stickGhost = { x: gx, y: gy };
  }
}

function drawBanner(ctx) {
  const b = G.banner;
  if (!b) return;
  const tin = clamp(b.t / 0.35, 0, 1), tout = clamp((b.dur - b.t) / 0.35, 0, 1);
  const sc = Font.width(b.title, 3) < view.w - 20 ? 3 : 2;
  const y0 = Math.round(view.h * 0.3 - (1 - easeOutBack(tin)) * 50 - (1 - tout) * 12);
  ctx.globalAlpha = Math.min(1, tout * 1.4);
  ctx.fillStyle = b.boss ? 'rgba(60,8,20,0.6)' : 'rgba(10,20,40,0.55)';
  ctx.fillRect(0, y0 - 6, view.w, 7 * sc + 24);
  ctx.fillStyle = b.boss ? '#c2304a' : '#e8b85a';
  ctx.fillRect(0, y0 - 6, view.w, 1); ctx.fillRect(0, y0 + 7 * sc + 17, view.w, 1);
  txt(ctx, b.title, view.w / 2, y0, b.boss ? '#ff6a7a' : '#ffd23f', { align: 'center', scale: sc, shadow: '#5a1a10', shadowOff: sc });
  txt(ctx, b.sub, view.w / 2, y0 + 7 * sc + 6, '#ffffff', { align: 'center' });
  ctx.globalAlpha = 1;
}

function drawHint(ctx) {
  const h = G.hint;
  if (!h) return;
  const w = Font.width(h.text) + 14;
  const x = Math.round(view.w / 2 - w / 2), y = Math.round(view.safe.t + (G.boss && G.boss.alive ? 40 : 24));
  if (G.banner) return;
  drawPanel(ctx, x, y, w, 15, 'dark');
  txt(ctx, h.text, view.w / 2, y + 4, Math.floor(h.t * 3) % 2 ? '#ffffff' : '#ffe27a', { align: 'center' });
  const pulse = 3 + (Math.floor(G.t * 6) % 3);
  if (h.focus === 'fire' && UI.zones.fire && Input.touchMode) {
    const z = UI.zones.fire; const r = z.r + 4 + pulse;
    ctx.drawImage(Art.ring(r, '#ffe27a'), z.x - r - 1, z.y - r - 1);
  }
  if (h.focus === 'stick' && UI.zones.stickGhost && Input.touchMode) {
    const z = UI.zones.stickGhost; const r = 26 + pulse;
    ctx.drawImage(Art.ring(r, '#ffe27a'), z.x - r - 1, z.y - r - 1);
  }
}

function drawVignette(ctx) {
  const P = G.player;
  const low = P && P.alive && G.state === 'playing' && P.hp / playerStats().maxHp < 0.25;
  const a = Math.max(G.hurtFlash * 1.6, low ? 0.25 + Math.sin(G.t * 6) * 0.15 : 0);
  if (a <= 0.01) return;
  ctx.fillStyle = `rgba(220,30,30,${clamp(a, 0, 0.6)})`;
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 1 - i * 0.25;
    ctx.fillRect(0, i * 2, view.w, 2); ctx.fillRect(0, view.h - i * 2 - 2, view.w, 2);
    ctx.fillRect(i * 2, 0, 2, view.h); ctx.fillRect(view.w - i * 2 - 2, 0, 2, view.h);
  }
  ctx.globalAlpha = 1;
}

// --- Screens -------------------------------------------------------------------
function dim(ctx, a = 0.5) { ctx.fillStyle = `rgba(6,12,24,${a})`; ctx.fillRect(0, 0, view.w, view.h); }

function toggleRow(ctx, x, y, w, h, gap) {
  const items = [
    ['snd', 'SOUND ' + (Settings.sound ? 'ON' : 'OFF'), () => Sound.setSound(!Settings.sound), Settings.sound],
    ['mus', 'MUSIC ' + (Settings.music ? 'ON' : 'OFF'), () => Sound.setMusic(!Settings.music), Settings.music],
    ['hap', 'BUZZ ' + (Settings.haptics ? 'ON' : 'OFF'), () => { Settings.haptics = !Settings.haptics; Settings.save(); haptic('medium'); }, Settings.haptics],
  ];
  const n = items.length;
  const bw = Math.floor((w - gap * (n - 1)) / n);
  items.forEach(([id, label, fn, on], i) => drawButton(ctx, id, x + i * (bw + gap), y, bw, h, label, fn, { color: on ? '#3d6fb8' : '#5a5a6a' }));
}

function drawTitle(ctx) {
  for (let y = 0; y < view.h * 0.5; y += 2) { ctx.fillStyle = `rgba(6,12,30,${0.55 * (1 - y / (view.h * 0.5))})`; ctx.fillRect(0, y, view.w, 2); }
  for (let y = view.h * 0.7; y < view.h; y += 2) { ctx.fillStyle = `rgba(6,12,30,${0.5 * ((y - view.h * 0.7) / (view.h * 0.3))})`; ctx.fillRect(0, Math.round(y), view.w, 2); }
  const sc = Font.width('BROADSIDE', 4) < view.w - 24 ? 4 : 3;
  const bob = Math.round(Math.sin(G.t * 1.6) * 2);
  const ty = Math.round(view.h * 0.12) + bob;
  const tin = clamp(G.stateT / 0.6, 0, 1);
  const off = Math.round((1 - easeOutBack(tin)) * -60);
  txt(ctx, 'BROADSIDE', view.w / 2, ty + off, '#ffd23f', { align: 'center', scale: sc, shadow: '#8a3a1a', shadowOff: sc, thick: 1 });
  txt(ctx, 'OF THE DEEP', view.w / 2, ty + off + 7 * sc + 6, '#ffffff', { align: 'center', scale: 2, shadow: '#1a3a6a', shadowOff: 2 });
  const by = Math.round(view.h * 0.56);
  const pw = Math.min(view.w - 30, 200);
  const pulse = Math.floor(G.t * 2.5) % 2;
  const save = loadRun();
  if (save) {
    const cw = 118, nw = 76, gap = 6, x0 = Math.round(view.w / 2 - (cw + nw + gap) / 2);
    drawButton(ctx, 'continue', x0, by, cw, 20, 'CONTINUE: WAVE ' + save.wave, continueGame, { color: pulse ? '#d8433b' : '#e8564c' });
    drawButton(ctx, 'play', x0 + cw + gap, by, nw, 20, 'NEW GAME', () => { newGame(); }, { color: '#8a5530' });
  } else {
    drawButton(ctx, 'play', view.w / 2 - 50, by, 100, 20, 'SET SAIL!', () => { newGame(); }, { color: pulse ? '#d8433b' : '#e8564c' });
  }
  toggleRow(ctx, view.w / 2 - pw / 2, by + 26, pw, 14, 4);
  const best = save ? 'SAVED: ' + save.gold + ' GOLD   SCORE ' + save.score : G.best ? 'BEST ' + G.best + '   WAVE ' + G.bestWave : 'SINK THE ENEMY FLEET, WAVE BY WAVE';
  txt(ctx, best, view.w / 2, by + 46, '#ffe27a', { align: 'center' });
  if (!Input.touchMode && !IS_IOS) txt(ctx, 'ENTER TO START', view.w / 2, view.h - view.safe.b - 11, 'rgba(255,255,255,0.75)', { align: 'center' });
  else if (CAN_INSTALL_IOS) txt(ctx, 'TIP: SHARE > ADD TO HOME SCREEN TO INSTALL', view.w / 2, view.h - view.safe.b - 11, '#9fd4f0', { align: 'center' });
}

function drawShop(ctx) {
  dim(ctx, 0.55);
  const w = Math.min(view.w - 12 - view.safe.l - view.safe.r, 392), h = Math.min(view.h - 10, 200);
  const x = Math.round(view.w / 2 - w / 2), y = Math.round(view.h / 2 - h / 2);
  const pin = easeOutBack(clamp(G.stateT / 0.35, 0, 1));
  const py = y + Math.round((1 - pin) * 40);
  drawPanel(ctx, x, py, w, h, 'wood');
  txt(ctx, 'HARBOR', x + 10, py + 9, '#ffd23f', { scale: 2, shadow: '#5a1a10', shadowOff: 2 });
  Font.draw(ctx, 'WAVE ' + G.wave + ' CLEARED - SPEND YOUR PLUNDER', x + 10, py + 27, '#5a3518');
  ctx.drawImage(Art.icons.coin, x + w - 14 - Font.width(String(G.gold), 2) - 10, py + 11);
  txt(ctx, G.gold, x + w - 12, py + 9, '#ffd23f', { align: 'right', scale: 2 });

  const cols = w >= 330 ? 3 : 2;
  const rows = Math.ceil(UPGRADES.length / cols);
  const gap = 4, top = py + 38, bottom = py + h - 30;
  const cw = Math.floor((w - 16 - gap * (cols - 1)) / cols);
  const ch = Math.min(50, Math.floor((bottom - top - gap * (rows - 1)) / rows));
  UPGRADES.forEach((u, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const cx = x + 8 + c * (cw + gap);
    const cy = top + r * (ch + gap) - Math.round((G.shopPop[u.id] || 0) * 3);
    const lvl = u.repeat ? 0 : G.up[u.id];
    const maxed = !u.repeat && lvl >= u.max;
    const cost = u.cost(lvl);
    const afford = G.gold >= cost;
    const full = u.id === 'repair' && G.player.hp >= playerStats().maxHp && G.kegCount >= 5;
    uiButton('u_' + u.id, cx, cy, cw, ch, () => buyUpgrade(u));
    const pressed = UI.pressed === 'u_' + u.id;
    drawPanel(ctx, cx, cy + (pressed ? 1 : 0), cw, ch, 'card');
    const oy = cy + (pressed ? 1 : 0);
    ctx.drawImage(Art.icons[u.icon], cx + 5, oy + 5, Art.icons[u.icon].width * 2, Art.icons[u.icon].height * 2);
    const tx = cx + 23;
    txt(ctx, u.name, tx, oy + 4, '#ffffff');
    Font.draw(ctx, u.desc, tx, oy + 13, '#f0deb0');
    if (!u.repeat) {
      for (let p = 0; p < u.max; p++) {
        ctx.fillStyle = INK; ctx.fillRect(tx + p * 5, oy + 23, 4, 4);
        ctx.fillStyle = p < lvl ? '#ffd23f' : '#4a2a18'; ctx.fillRect(tx + p * 5 + 1, oy + 24, 2, 2);
      }
    } else {
      const ps = playerStats();
      drawBar(ctx, tx, oy + 24, Math.min(40, cw - 60), 2, G.player.hp / ps.maxHp, '#5dd36a');
    }
    const label = maxed ? 'MAX' : full ? 'FULL' : String(cost);
    const col = maxed || full ? '#9adfa0' : afford ? '#ffd23f' : '#ff6a5a';
    const lw = Font.width(label);
    txt(ctx, label, cx + cw - 5, oy + ch - 12, col, { align: 'right' });
    if (!maxed && !full) ctx.drawImage(Art.icons.coin, cx + cw - 5 - lw - 8, oy + ch - 12);
  });
  const ps = playerStats();
  Font.draw(ctx, 'HULL ' + Math.ceil(G.player.hp) + '/' + ps.maxHp + '   GUNS ' + ps.guns + '   KEGS ' + G.kegCount, x + 10, py + h - 20, '#5a3518');
  drawButton(ctx, 'sail', x + w - 96, py + h - 25, 86, 18, 'SAVE + SAIL >', setSail, { color: '#4a9a3a' });
}

function drawGameOver(ctx) {
  dim(ctx, 0.55);
  const w = Math.min(view.w - 20, 230), h = Math.min(view.h - 12, 140);
  const x = Math.round(view.w / 2 - w / 2), y = Math.round(view.h / 2 - h / 2);
  const pin = easeOutBack(clamp(G.stateT / 0.4, 0, 1));
  const py = y + Math.round((1 - pin) * 50);
  drawPanel(ctx, x, py, w, h, 'wood');
  txt(ctx, 'SHIP LOST!', view.w / 2, py + 10, '#ff6a5a', { align: 'center', scale: 2, shadow: '#5a1a10', shadowOff: 2 });
  const rows = [['WAVE REACHED', G.wave], ['SHIPS SUNK', G.kills], ['GOLD PLUNDERED', G.goldEarned]];
  rows.forEach(([k, v], i) => {
    Font.draw(ctx, k, x + 16, py + 34 + i * 11, '#5a3518');
    Font.draw(ctx, String(v), x + w - 16, py + 34 + i * 11, '#3a2416', { align: 'right' });
  });
  Font.draw(ctx, 'SCORE', x + 16, py + 72, '#5a3518');
  txt(ctx, G.score, x + w - 16, py + 69, '#ffd23f', { align: 'right', scale: 2 });
  if (G.newBest) { if (Math.floor(G.t * 4) % 2) txt(ctx, 'NEW BEST!', view.w / 2, py + 88, '#ff6a5a', { align: 'center' }); }
  else Font.draw(ctx, 'BEST ' + G.best, view.w / 2, py + 88, '#5a3518', { align: 'center' });
  const bw = Math.floor((w - 36) / 2);
  drawButton(ctx, 'again', x + 14, py + h - 30, bw, 18, 'SAIL AGAIN', newGame, { color: '#d8433b' });
  drawButton(ctx, 'menu', x + w - 14 - bw, py + h - 30, bw, 18, 'MENU', toTitle, { color: '#3d6fb8' });
}

function drawPause(ctx) {
  dim(ctx, 0.6);
  const w = Math.min(view.w - 20, 220), h = Math.min(view.h - 12, 132);
  const x = Math.round(view.w / 2 - w / 2), y = Math.round(view.h / 2 - h / 2);
  drawPanel(ctx, x, y, w, h, 'wood');
  txt(ctx, 'PAUSED', view.w / 2, y + 10, '#ffd23f', { align: 'center', scale: 2, shadow: '#5a1a10', shadowOff: 2 });
  drawButton(ctx, 'resume', x + 14, y + 32, w - 28, 20, 'RESUME', resumeGame, { color: '#d8433b' });
  toggleRow(ctx, x + 14, y + 58, w - 28, 14, 4);
  const bw = Math.floor((w - 32) / 2);
  drawButton(ctx, 'restart', x + 14, y + 80, bw, 16, 'RESTART', newGame, { color: '#8a5530' });
  drawButton(ctx, 'quit', x + w - 14 - bw, y + 80, bw, 16, 'MENU', toTitle, { color: '#8a5530' });
  Font.draw(ctx, 'WAVE ' + G.wave + '   SCORE ' + G.score, view.w / 2, y + h - 20, '#5a3518', { align: 'center' });
}

function drawRotate(ctx) {
  ctx.fillStyle = '#0b2238'; ctx.fillRect(0, 0, view.w, view.h);
  const cx = Math.round(view.w / 2), cy = Math.round(view.h / 2);
  const f = Math.floor(G.t * 1.5) % 2;
  ctx.fillStyle = INK;
  if (f) { ctx.fillRect(cx - 9, cy - 34, 18, 30); ctx.fillStyle = '#e8e8f0'; ctx.fillRect(cx - 8, cy - 33, 16, 28); ctx.fillStyle = '#3d6fb8'; ctx.fillRect(cx - 7, cy - 31, 14, 23); }
  else { ctx.fillRect(cx - 15, cy - 28, 30, 18); ctx.fillStyle = '#e8e8f0'; ctx.fillRect(cx - 14, cy - 27, 28, 16); ctx.fillStyle = '#3d6fb8'; ctx.fillRect(cx - 12, cy - 26, 23, 14); }
  txt(ctx, 'ROTATE', cx, cy + 4, '#ffd23f', { align: 'center' });
  txt(ctx, 'YOUR', cx, cy + 14, '#ffffff', { align: 'center' });
  txt(ctx, 'DEVICE', cx, cy + 24, '#ffffff', { align: 'center' });
}

function pauseGame() {
  if (G.state !== 'playing' && G.state !== 'clearing' && G.state !== 'sinking') return;
  G.prevState = G.state; G.state = 'paused';
  Input.clearAll();
}
function resumeGame() { if (G.state === 'paused') { G.state = G.prevState || 'playing'; Input.clearAll(); } }
