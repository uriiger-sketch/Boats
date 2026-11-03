'use strict';
// ---------------------------------------------------------------------------
// Procedural pixel-art: ships are rasterised pixel-by-pixel for each heading
// so every rotation stays crisp, outlined and lit from the same sun.
// ---------------------------------------------------------------------------

const DIRS = 32;
const LIGHT = { x: -0.6, y: -0.8 };

const SHIP_ART = {
  player: {
    len: 26, beam: 10, masts: [0.3, -0.18], span: [0.95, 1.08], guns: 3,
    pal: { trim: '#e8b85a', hull: '#8a4f2a', deck1: '#c99258', deck2: '#b47c47', qdeck: '#d6a066', sail: '#f6edd6', stripe: '#d8433b', yard: '#5a3518', lantern: '#ffe27a', outline: '#24140c' },
  },
  sloop: {
    len: 18, beam: 7, masts: [0.08], span: [1.15], guns: 2,
    pal: { trim: '#8f6c4c', hull: '#523523', deck1: '#7d5638', deck2: '#6c4a30', qdeck: '#8a6242', sail: '#b9b3a6', stripe: null, yard: '#3a2416', lantern: '#ffd36a', outline: '#1a0f09' },
  },
  brig: {
    len: 24, beam: 9, masts: [0.3, -0.2], span: [1.0, 1.08], guns: 3,
    pal: { trim: '#e0c776', hull: '#2f4268', deck1: '#9a7650', deck2: '#876646', qdeck: '#a8845c', sail: '#eef2f6', stripe: '#3d6fb8', yard: '#3a2a1c', lantern: '#ffe27a', outline: '#111827' },
  },
  frigate: {
    len: 31, beam: 11, masts: [0.42, 0.02, -0.36], span: [0.9, 1.08, 0.95], guns: 4,
    pal: { trim: '#c2423a', hull: '#2b2730', deck1: '#6e5844', deck2: '#5f4b3a', qdeck: '#7a6350', sail: '#3a3542', stripe: '#5a5266', yard: '#1c1418', lantern: '#ff9b5a', outline: '#0b080c' },
  },
  burner: {
    len: 14, beam: 6, masts: [0.15], span: [1.0], guns: 0, barrels: true,
    pal: { trim: '#a8582a', hull: '#5e2f17', deck1: '#7a4a2a', deck2: '#6b3f22', qdeck: '#80502e', sail: '#ef8a32', stripe: '#c4442a', yard: '#3a1c0c', lantern: '#ffcc55', outline: '#1d0c05' },
  },
  galleon: {
    len: 40, beam: 15, masts: [0.45, 0.06, -0.32], span: [0.92, 1.1, 1.0], guns: 6,
    pal: { trim: '#f0c04a', hull: '#45203f', deck1: '#7c5a40', deck2: '#6a4c36', qdeck: '#8c6a4c', sail: '#a3263a', stripe: '#f0c04a', yard: '#24101e', lantern: '#ffdf6a', outline: '#12060f' },
  },
};

function hullHalf(u, art) {
  const half = art.len / 2;
  const t = u / half;
  if (t > 1 || t < -1) return -1;
  const w = t >= 0 ? Math.pow(Math.max(0, 1 - t * t), 0.55) : 1 - 0.28 * Math.pow(-t, 4);
  return (w * art.beam) / 2;
}

function renderShipFrames(art) {
  const L = art.len, B = art.beam, half = L / 2;
  const sp = Math.max(...art.span);
  const reach = Math.max(half + L * 0.15, Math.hypot(half, B / 2 + 2), Math.hypot(half * 0.5 + B * 0.4, B * 0.6 * sp + 1));
  let S = Math.ceil(reach * 2) + 10;
  if (S % 2) S++;
  const N = S * S;
  const P = {};
  for (const k in art.pal) if (art.pal[k]) P[k] = art.pal[k];
  const C = {
    trim: packHex(P.trim), trimL: packHex(shadeHex(P.trim, 40)), trimD: packHex(shadeHex(P.trim, -50)),
    hull: packHex(P.hull), hullD: packHex(shadeHex(P.hull, -25)),
    deck1: packHex(P.deck1), deck2: packHex(P.deck2), qdeck: packHex(P.qdeck), rail: packHex(shadeHex(P.deck1, -40)),
    hatch: packHex(shadeHex(P.deck2, -55)), port: packHex('#140c08'), barrel: packHex('#2b2b30'), barrelL: packHex('#5a5a66'),
    sail: packHex(P.sail), sailL: packHex(shadeHex(P.sail, 28)), sailD: packHex(shadeHex(P.sail, -38)),
    stripe: P.stripe ? packHex(P.stripe) : 0, stripeD: P.stripe ? packHex(shadeHex(P.stripe, -30)) : 0,
    yard: packHex(P.yard), mast: packHex(shadeHex(P.yard, 25)), lantern: packHex(P.lantern), outline: packHex(P.outline),
    keg: packHex('#7a4422'), kegBand: packHex('#c23a2a'),
  };
  const frames = [], shadows = [], flashes = [];
  const gunsU = [];
  for (let i = 0; i < art.guns; i++) gunsU.push(art.guns === 1 ? 0 : lerp(-0.32, 0.28, i / (art.guns - 1)) * L);

  for (let fi = 0; fi < DIRS; fi++) {
    const a = (fi / DIRS) * PI2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const buf = new Uint32Array(N);
    const hullM = new Uint8Array(N), sailM = new Uint8Array(N);
    const sailC = new Uint32Array(N);

    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = px + 0.5 - S / 2, y = py + 0.5 - S / 2;
      const u = x * ca + y * sa, v = -x * sa + y * ca;
      const idx = py * S + px;
      const hw = hullHalf(u, art);
      const av = Math.abs(v);
      if (hw > 0 && av <= hw) {
        const e = hw - av, es = u + half;
        const edge = Math.min(e, es);
        let c;
        if (edge < 1.05) {
          let nx, ny;
          if (es < e) { nx = -ca; ny = -sa; } else { const sv = v >= 0 ? 1 : -1; const fwd = clamp(u / half, 0, 1) * 0.8; nx = -sa * sv + ca * fwd; ny = ca * sv + sa * fwd; }
          const lit = nx * LIGHT.x + ny * LIGHT.y;
          c = lit > 0.25 ? C.trimL : lit < -0.3 ? C.trimD : C.trim;
          if (es >= e) for (const g of gunsU) if (Math.abs(u - g) < 0.8) c = C.port;
        } else if (edge < 2.0) {
          c = C.hullD;
        } else if (u < -half * 0.42) {
          c = Math.abs(u + half * 0.42) < 0.6 ? C.rail : C.qdeck;
        } else {
          c = (Math.floor(v * 0.9 + 40) & 1) ? C.deck1 : C.deck2;
          if (B >= 9 && Math.abs(u + L * 0.05) < 1.3 && av < 1.3) c = C.hatch;
          if (art.barrels && Math.abs(u - L * 0.05) < 2.2 && av < 2) c = (Math.abs(u - L * 0.05) < 0.6) ? C.kegBand : C.keg;
        }
        if (Math.abs(u + half - 1.4) < 0.75 && av < 0.75) c = C.lantern;
        buf[idx] = c; hullM[idx] = 1;
      } else {
        if (hw > 0) {
          for (const g of gunsU) if (Math.abs(u - g) < 0.6 && av > hw && av < hw + 1.8) { buf[idx] = (av < hw + 0.9) ? C.barrel : C.barrelL; hullM[idx] = 2; }
        }
        if (u > half - 1 && u < half + L * 0.14 && av < 0.6) { buf[idx] = C.yard; hullM[idx] = 2; }
      }

      // Sails (billowed crescents in front of each yard).
      for (let m = 0; m < art.masts.length; m++) {
        const um = art.masts[m] * half;
        const Sv = B * 0.58 * art.span[m];
        const bulge = B * 0.3 + 0.6;
        if (av <= Sv) {
          const thick = Math.max(1.05, bulge * (1 - (v / Sv) * (v / Sv)));
          const du = u - um;
          if (du >= 0 && du <= thick) {
            const f = du / thick;
            let c = f > 0.62 ? C.sailL : f < 0.28 ? C.sailD : C.sail;
            if (C.stripe && (Math.floor((v + Sv) * 0.7) & 1) && f >= 0.28) c = f > 0.62 ? C.stripe : C.stripeD;
            if (av > Sv - 0.8) c = C.sailD;
            if (du * du + v * v < 1.1) c = C.mast;
            sailM[idx] = 1; sailC[idx] = c;
          } else if (du < 0 && du > -1.0 && av <= Sv + 0.7) {
            sailM[idx] = 2; sailC[idx] = C.yard;
          }
        }
      }
    }

    // Hull outline.
    const out = new Uint8Array(N);
    for (let py = 1; py < S - 1; py++) for (let px = 1; px < S - 1; px++) {
      const i = py * S + px;
      if (hullM[i]) continue;
      if (hullM[i - 1] || hullM[i + 1] || hullM[i - S] || hullM[i + S]) { buf[i] = C.outline; out[i] = 1; }
    }
    // Sail shadow falls down-right onto the deck.
    for (let py = 0; py < S - 1; py++) for (let px = 0; px < S - 1; px++) {
      const i = py * S + px;
      if (!sailM[i]) continue;
      const j = i + S + 1;
      if (!sailM[j] && hullM[j] === 1) {
        const c = buf[j];
        buf[j] = packRGBA((c & 255) * 0.62, ((c >> 8) & 255) * 0.62, ((c >> 16) & 255) * 0.7);
      }
    }
    for (let i = 0; i < N; i++) if (sailM[i]) buf[i] = sailC[i];
    // Sail outline where it overhangs water.
    for (let py = 1; py < S - 1; py++) for (let px = 1; px < S - 1; px++) {
      const i = py * S + px;
      if (sailM[i] || hullM[i] || out[i]) continue;
      if (sailM[i - 1] || sailM[i + 1] || sailM[i - S] || sailM[i + S]) buf[i] = C.outline;
    }

    const toCanvas = (arr) => {
      const c = makeCanvas(S, S);
      const x = c.getContext('2d');
      const img = x.createImageData(S, S);
      new Uint32Array(img.data.buffer).set(arr);
      x.putImageData(img, 0, 0);
      return c;
    };
    frames.push(toCanvas(buf));

    // Drop shadow: hull near the water, sails cast further.
    const sh = new Uint32Array(N), fl = new Uint32Array(N);
    const shade = packRGBA(6, 20, 44, 105);
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const i = py * S + px;
      if (buf[i]) fl[i] = packRGBA(255, 255, 255, 255);
      const off = sailM[i] ? 4 : (hullM[i] || out[i]) ? 2 : 0;
      if (!off) continue;
      const tx = px + off - 1, ty = py + off;
      if (tx < S && ty < S) sh[ty * S + tx] = shade;
    }
    shadows.push(toCanvas(sh));
    flashes.push(toCanvas(fl));
  }
  return { size: S, frames, shadows, flashes };
}

const Art = {
  ships: {},
  puffs: new Map(),
  rings: new Map(),
  glows: new Map(),
  icons: {},

  init() {
    for (const k in SHIP_ART) this.ships[k] = renderShipFrames(SHIP_ART[k]);
    this.buildIcons();
  },

  shipFrame(kind, a) {
    const i = ((Math.round((a / PI2) * DIRS) % DIRS) + DIRS) % DIRS;
    return i;
  },

  // Shaded pixel ball used for smoke, flashes and dust.
  puff(r, color) {
    r = Math.max(1, Math.min(14, Math.round(r)));
    const key = r + color;
    let c = this.puffs.get(key);
    if (c) return c;
    const s = r * 2 + 1;
    c = makeCanvas(s, s);
    const x = c.getContext('2d');
    const light = shadeHex(color, 30), dark = shadeHex(color, -35);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const dx = i - r, dy = j - r;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3) continue;
      const lx = (dx + r * 0.35) / r, ly = (dy + r * 0.35) / r;
      const l = Math.hypot(lx, ly);
      x.fillStyle = l < 0.45 ? light : (d > r - 1.2 && dx + dy > 0) ? dark : color;
      x.fillRect(i, j, 1, 1);
    }
    this.puffs.set(key, c);
    return c;
  },

  ring(r, color = '#ffffff') {
    r = Math.max(1, Math.min(30, Math.round(r)));
    const key = r + color;
    let c = this.rings.get(key);
    if (c) return c;
    const s = r * 2 + 3;
    c = makeCanvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = color;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const d = Math.hypot(i - r - 1, j - r - 1);
      if (Math.abs(d - r) < 0.55) x.fillRect(i, j, 1, 1);
    }
    this.rings.set(key, c);
    return c;
  },

  // Banded, dithered radial glow for lights at dusk/night.
  glow(r, color) {
    const sizes = [10, 16, 24, 36, 52];
    let rr = sizes[0];
    for (const s of sizes) if (Math.abs(s - r) < Math.abs(rr - r)) rr = s;
    const key = rr + color;
    let c = this.glows.get(key);
    if (c) return { c, r: rr };
    const s = rr * 2;
    c = makeCanvas(s, s);
    const x = c.getContext('2d');
    const [cr, cg, cb] = hexRgb(color);
    const img = x.createImageData(s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const d = Math.hypot(i - rr + 0.5, j - rr + 0.5) / rr;
      if (d >= 1) continue;
      let lv = (1 - d) * 4;
      const base = Math.floor(lv), fr = lv - base;
      const level = base + (fr > bayer(i, j) ? 1 : 0);
      const a = [0, 40, 80, 130, 190][Math.min(4, level)];
      const k = (j * s + i) * 4;
      img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb; img.data[k + 3] = a;
    }
    x.putImageData(img, 0, 0);
    this.glows.set(key, c);
    return { c, r: rr };
  },

  buildIcons() {
    const K = '#1a1220';
    this.icons.heart = spriteFromMap([
      '.kk.kk.',
      'krrkrwk',
      'krrrrrk',
      'krrrrrk',
      '.krrrk.',
      '..krk..',
      '...k...',
    ], { k: K, r: '#e8404a', w: '#ffd0d0' });
    this.icons.coin = spriteFromMap([
      '.kkkk.',
      'kyywyk',
      'kyoyyk',
      'kyoyyk',
      'koyyok',
      '.kkkk.',
    ], { k: K, y: '#ffd23f', o: '#d68a1a', w: '#fff6c0' });
    this.icons.skull = spriteFromMap([
      '.kkkkk.',
      'kwwwwwk',
      'kwkwkwk',
      'kwwwwwk',
      '.kwkwk.',
      '..kkk..',
    ], { k: K, w: '#efe8dc' });
    this.icons.keg = spriteFromMap([
      '.kkkk.',
      'kbbbbk',
      'krrrrk',
      'kbbbbk',
      'krrrrk',
      'kbbbbk',
      '.kkkk.',
    ], { k: K, b: '#8a5530', r: '#d0402c' });
    this.icons.cannon = spriteFromMap([
      '........',
      '.kkkkkk.',
      'kgggggwk',
      'kgggggkk',
      '.kbbbk..',
      'kbkkkbk.',
      '.k...k..',
    ], { k: K, g: '#4a4a56', w: '#9a9aaa', b: '#8a5530' });
    this.icons.powder = spriteFromMap([
      '...y...',
      '..yoy..',
      '.kkkkk.',
      'kgggggk',
      'kgwgggk',
      'kgggggk',
      '.kkkkk.',
    ], { k: K, g: '#3a3a44', w: '#8a8a9a', y: '#ffe060', o: '#ff8a2a' });
    this.icons.crew = spriteFromMap([
      '..kkk..',
      '.krrrk.',
      '.kssk..',
      '.ksssk.',
      'kbbbbbk',
      'kbwbwbk',
      '.kbbbk.',
    ], { k: K, r: '#d8433b', s: '#e8b88a', b: '#2f4268', w: '#efe8dc' });
    this.icons.sails = spriteFromMap([
      '...k...',
      '..kwk..',
      '.kwwrk.',
      '.kwwwk.',
      'kwwrwwk',
      '.kkkkk.',
      'kbbbbbk',
    ], { k: K, w: '#f6edd6', r: '#d8433b', b: '#8a5530' });
    this.icons.repair = spriteFromMap([
      '.kk....',
      'kggk...',
      '.kggk..',
      '..kggk.',
      '...kbbk',
      '....kbk',
      '.....k.',
    ], { k: K, g: '#b8b8c8', b: '#8a5530' });
    this.icons.rapid = spriteFromMap([
      '...kk.',
      '..kyk.',
      '.kyk..',
      'kyyyyk',
      '..kyk.',
      '.kyk..',
      '.kk...',
    ], { k: K, y: '#ffe060' });
    this.icons.fire = spriteFromMap([
      '...k...',
      '..kok..',
      '.koyok.',
      'koyyyok',
      'koywyok',
      '.koook.',
      '..kkk..',
    ], { k: K, o: '#ff7a2a', y: '#ffd23f', w: '#fff6c0' });
    this.icons.pause = spriteFromMap([
      'kkk.kkk',
      'kwk.kwk',
      'kwk.kwk',
      'kwk.kwk',
      'kwk.kwk',
      'kkk.kkk',
    ], { k: K, w: '#ffffff' });
    this.icons.anchor = spriteFromMap([
      '..kkk..',
      '..kwk..',
      '.kkwkk.',
      '..kwk..',
      'k.kwk.k',
      'kwkwkwk',
      '.kwwwk.',
      '..kkk..',
    ], { k: K, w: '#e8e8f0' });
  },
};
