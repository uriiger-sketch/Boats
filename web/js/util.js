'use strict';
// ---------------------------------------------------------------------------
// Shared math, noise, storage and platform helpers.
// ---------------------------------------------------------------------------

const PI = Math.PI;
const PI2 = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
const angDiff = (from, to) => {
  let d = (to - from) % PI2;
  if (d > PI) d -= PI2;
  if (d < -PI) d += PI2;
  return d;
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise with fractal sum.
function makeNoise(seed) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(256);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const h = (i, j) => vals[perm[(perm[i & 255] + j) & 255]];
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 3) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += n2(x * f + o * 17.3, y * f - o * 9.1) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  }
  return { n2, fbm };
}

// 4x4 ordered-dither thresholds in (0,1).
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];

function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shadeHex(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  const f = (x) => clamp(Math.round(x + amt), 0, 255);
  return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
// Pack RGBA into a little-endian Uint32 pixel.
function packRGBA(r, g, b, a = 255) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function packHex(hex, a = 255) { const [r, g, b] = hexRgb(hex); return packRGBA(r, g, b, a); }

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

// Build a sprite from a string map + palette ('.' is transparent).
function spriteFromMap(rows, pal) {
  const h = rows.length, w = rows[0].length;
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][i];
    if (ch === '.' || ch === ' ' || !pal[ch]) continue;
    x.fillStyle = pal[ch];
    x.fillRect(i, j, 1, 1);
  }
  return c;
}

// --- Persistent storage --------------------------------------------------
const Store = {
  get(k, d) {
    try { const v = localStorage.getItem('bod_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  set(k, v) { try { localStorage.setItem('bod_' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

const Settings = {
  sound: Store.get('sound', true),
  music: Store.get('music', true),
  haptics: Store.get('haptics', true),
  save() { Store.set('sound', this.sound); Store.set('music', this.music); Store.set('haptics', this.haptics); },
};

// --- Haptics: native bridge on iOS, vibrate() elsewhere --------------------
let _lastHaptic = 0;
function haptic(kind) {
  if (!Settings.haptics) return;
  const now = performance.now();
  if (now - _lastHaptic < 40 && kind !== 'heavy' && kind !== 'success') return;
  _lastHaptic = now;
  try {
    const mh = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.haptic;
    if (mh) { mh.postMessage(kind); return; }
  } catch (e) { /* no bridge */ }
  if (navigator.vibrate) {
    const m = { select: 4, light: 8, medium: 16, heavy: 30, success: [12, 40, 12], error: [30, 50, 30] };
    try { navigator.vibrate(m[kind] || 10); } catch (e) { /* ignore */ }
  }
}
