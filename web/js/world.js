'use strict';
// ---------------------------------------------------------------------------
// Procedural archipelago: heightmap -> dithered pixel-art sea, beaches,
// jungle and rock reefs, plus animated shoreline foam and wave glints.
// ---------------------------------------------------------------------------

const LAND = 0.15;

const World = {
  W: 960, H: 640,
  h: null, rock: null,
  base: null, foam: [],
  glints: [], lights: [], seed: 1,

  heightAt(x, y) {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) return 1;
    return this.h[yi * this.W + xi];
  },
  isLand(x, y) { return this.heightAt(x, y) > LAND; },
  normalAt(x, y) {
    const gx = this.heightAt(x + 2, y) - this.heightAt(x - 2, y);
    const gy = this.heightAt(x, y + 2) - this.heightAt(x, y - 2);
    const l = Math.hypot(gx, gy) || 1;
    return { x: -gx / l, y: -gy / l };
  },
  randomWater(minDepth = -0.35, avoid = null, minDist = 0, tries = 200) {
    for (let i = 0; i < tries; i++) {
      const x = rand(50, this.W - 50), y = rand(50, this.H - 50);
      if (this.heightAt(x, y) > minDepth) continue;
      if (avoid && dist(x, y, avoid.x, avoid.y) < minDist) continue;
      return { x, y };
    }
    return { x: this.W / 2, y: this.H / 2 };
  },

  generate(seed) {
    this.seed = seed;
    const W = this.W, H = this.H;
    const rng = mulberry32(seed);
    const noise = makeNoise(seed);
    const detail = makeNoise(seed * 7 + 3);
    const h = new Float32Array(W * H);
    const rock = new Uint8Array(W * H);

    // Open sea with gentle depth variation.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      h[y * W + x] = -0.55 + (noise.fbm(x / 110, y / 110, 3) - 0.5) * 0.45;
    }
    // Rocky reef ring keeps the battle inside the cove.
    const EDGE = 46;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const de = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (de >= EDGE) continue;
      const f = 1 - de / EDGE;
      const i = y * W + x;
      const v = -0.62 + f * f * 1.5 + (detail.fbm(x / 16, y / 16, 3) - 0.5) * 0.55 * f;
      if (v > h[i]) { h[i] = v; if (v > LAND - 0.02) rock[i] = 1; }
    }

    const stamp = (cx, cy, r, isRock) => {
      const R = r * 2.1;
      const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
      const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const f = 1 - d / (r * 2);
        if (f <= 0) continue;
        const i = y * W + x;
        const v = -0.62 + f * 1.35 + (detail.fbm(x / 13, y / 13, 2) - 0.5) * 0.34 * f;
        if (v > h[i]) { h[i] = v; rock[i] = isRock ? 1 : 0; }
      }
    };

    // Islands kept clear of the central spawn area.
    const islands = [];
    const count = 4 + Math.floor(rng() * 3);
    for (let n = 0, tries = 0; n < count && tries < 400; tries++) {
      const cx = 110 + rng() * (W - 220), cy = 100 + rng() * (H - 200);
      if (Math.hypot(cx - W / 2, cy - H / 2) < 150) continue;
      if (islands.some((o) => Math.hypot(o.x - cx, o.y - cy) < 150)) continue;
      islands.push({ x: cx, y: cy });
      const blobs = 2 + Math.floor(rng() * 4);
      for (let b = 0; b < blobs; b++) {
        const r = 13 + rng() * 22;
        stamp(cx + (rng() - 0.5) * 50, cy + (rng() - 0.5) * 36, r, false);
      }
      n++;
    }
    // Sea stacks.
    for (let n = 0, tries = 0; n < 9 && tries < 300; tries++) {
      const cx = 80 + rng() * (W - 160), cy = 80 + rng() * (H - 160);
      if (Math.hypot(cx - W / 2, cy - H / 2) < 120) continue;
      if (islands.some((o) => Math.hypot(o.x - cx, o.y - cy) < 80)) continue;
      stamp(cx, cy, 3.5 + rng() * 3, true);
      n++;
    }
    this.h = h; this.rock = rock;

    // --- Colourise -----------------------------------------------------------
    const WATER = ['#9af0dc', '#6adbd0', '#47c0cf', '#33a3c8', '#2a87bb', '#2470aa', '#1f5e98', '#1a4f86', '#164375'].map(hexRgb);
    const SAND = ['#b3925c', '#dcc285', '#ecd8a0', '#f7e8be'].map(hexRgb);
    const GRASS = ['#24512b', '#326f33', '#46903c', '#5fad49', '#82c45a'].map(hexRgb);
    const ROCK = ['#2f2f3a', '#4a4a56', '#6a6a76', '#8e8e9a', '#b6b6c0'].map(hexRgb);
    const base = makeCanvas(W, H);
    const bctx = base.getContext('2d');
    const img = bctx.createImageData(W, H);
    const px = new Uint32Array(img.data.buffer);
    const put = (i, c) => { px[i] = packRGBA(c[0], c[1], c[2]); };

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = h[i];
      if (v <= LAND) {
        const t = LAND - v + (detail.n2(x / 9, y / 9) - 0.5) * 0.03;
        const f = Math.pow(clamp(t / 0.95, 0, 1), 0.55) * (WATER.length - 1);
        const b = Math.floor(f);
        const k = clamp(b + (f - b > bayer(x, y) ? 1 : 0), 0, WATER.length - 1);
        put(i, WATER[k]);
      } else {
        const gx = this.heightAt(x + 1, y) - this.heightAt(x - 1, y);
        const gy = this.heightAt(x, y + 1) - this.heightAt(x, y - 1);
        const lit = -(gx * LIGHT.x + gy * LIGHT.y) * 18;
        const light = lit > 0.35 ? 1 : lit < -0.35 ? -1 : 0;
        const dn = detail.n2(x / 3, y / 3);
        if (rock[i]) {
          const k = clamp(2 + light + (dn > 0.72 ? 1 : dn < 0.22 ? -1 : 0) + (v > 0.5 ? 0 : 0), 0, 4);
          put(i, ROCK[k]);
        } else if (v < 0.24) {
          const k = v < 0.168 ? 0 : clamp(1 + light + (dn > 0.8 ? 1 : 0), 1, 3);
          put(i, SAND[k]);
        } else {
          let k = v < 0.3 ? 3 : v < 0.44 ? 2 : 1;
          const f = (dn - 0.5) * 1.4;
          k = clamp(k + light + (f > bayer(x, y) ? 1 : f < -bayer(x, y) ? -1 : 0), 0, 4);
          put(i, GRASS[k]);
        }
      }
    }
    bctx.putImageData(img, 0, 0);

    // --- Decorations ---------------------------------------------------------
    this.lights = [];
    const palm = spriteFromMap([
      '..g...g..',
      '.gGg.gGg.',
      'gGGGgGGGg',
      '..gGtGg..',
      '.gG.t.Gg.',
      'g...t...g',
      '....t....',
      '....T....',
      '...TtT...',
    ], { g: '#24512b', G: '#5fad49', t: '#9a6a3a', T: '#6a4020' });
    const hut = spriteFromMap([
      '...yy...',
      '..yYYy..',
      '.yYYYYy.',
      'yyyyyyyy',
      '.wwwdww.',
      '.wwwdww.',
      '.wwwkww.',
    ], { y: '#a07a3a', Y: '#d8b060', w: '#c8a880', d: '#8a6a4a', k: '#3a2416' });
    const placed = [];
    let palms = 0, huts = 0;
    for (let tries = 0; tries < 4000 && palms < 70; tries++) {
      const x = Math.floor(rng() * W), y = Math.floor(rng() * H);
      const v = this.heightAt(x, y);
      if (v < 0.28 || this.rock[y * W + x]) continue;
      if (placed.some((p) => Math.abs(p.x - x) < 7 && Math.abs(p.y - y) < 7)) continue;
      placed.push({ x, y });
      if (huts < 5 && v > 0.32 && v < 0.5 && rng() < 0.08) {
        bctx.fillStyle = 'rgba(10,30,20,0.35)'; bctx.fillRect(x - 3, y + 2, 9, 2);
        bctx.drawImage(hut, x - 4, y - 5);
        this.lights.push({ x: x, y: y, r: 22, c: '#ffb050' });
        huts++;
      } else {
        bctx.fillStyle = 'rgba(10,30,20,0.35)'; bctx.fillRect(x - 2, y + 3, 7, 2);
        bctx.drawImage(palm, x - 4, y - 6);
        palms++;
      }
    }
    this.base = base;

    // --- Shore foam animation frames ------------------------------------------
    this.foam = [];
    for (let k = 0; k < 4; k++) {
      const c = makeCanvas(W, H);
      const x = c.getContext('2d');
      const fi = x.createImageData(W, H);
      const fp = new Uint32Array(fi.data.buffer);
      const white = packRGBA(240, 255, 250, 230), soft = packRGBA(220, 250, 245, 120);
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx;
        const t = LAND - h[i];
        if (t < 0 || t > 0.07) continue;
        if (t < 0.012) { if (((xx + y + k) & 1) === 0 || k % 2 === 0) fp[i] = white; continue; }
        const ph = t * 150 + detail.n2(xx / 6, y / 6) * 5 + k * (PI / 2);
        const s = Math.sin(ph);
        if (s > 0.75) fp[i] = white; else if (s > 0.55 && ((xx ^ y) & 1)) fp[i] = soft;
      }
      x.putImageData(fi, 0, 0);
      this.foam.push(c);
    }

    // --- Wave glints ---------------------------------------------------------
    this.glints = [];
    for (let i = 0; i < 520; i++) {
      const x = rng() * W, y = rng() * H;
      if (this.heightAt(x, y) > -0.12) continue;
      this.glints.push({ x, y, ph: rng() * PI2, sp: 0.8 + rng() * 1.4, w: rng() < 0.3 ? 5 : 3 });
    }
  },

  draw(ctx, cam, t, VW, VH) {
    const sx = Math.round(cam.x), sy = Math.round(cam.y);
    ctx.fillStyle = '#164375';
    ctx.fillRect(0, 0, VW, VH);
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
    const w = Math.min(this.W, sx + VW) - x0, h = Math.min(this.H, sy + VH) - y0;
    if (w > 0 && h > 0) {
      ctx.drawImage(this.base, x0, y0, w, h, x0 - sx, y0 - sy, w, h);
      const f = this.foam[Math.floor(t * 2.2) % 4];
      ctx.drawImage(f, x0, y0, w, h, x0 - sx, y0 - sy, w, h);
    }
    // Wave glints: little crests that swell and fade.
    for (const g of this.glints) {
      const gx = g.x - sx, gy = g.y - sy;
      if (gx < -6 || gy < -3 || gx > VW + 6 || gy > VH + 3) continue;
      const s = Math.sin(t * g.sp + g.ph);
      if (s < 0.35) continue;
      const len = s > 0.85 ? g.w : s > 0.6 ? g.w - 2 : 1;
      const X = Math.round(gx - len / 2), Y = Math.round(gy);
      ctx.fillStyle = s > 0.85 ? 'rgba(220,245,255,0.75)' : 'rgba(170,220,245,0.45)';
      ctx.fillRect(X, Y, Math.max(1, len), 1);
      if (len >= 3) { ctx.fillStyle = 'rgba(16,54,93,0.35)'; ctx.fillRect(X + 1, Y + 1, len - 2, 1); }
    }
  },
};
