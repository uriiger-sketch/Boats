import React, { useEffect, useMemo, useRef, useState } from "react";

const W = 960;
const H = 540;
const SEA_Y = 332;
const PI2 = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
const sign = (n) => (n < 0 ? -1 : 1);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (x) => clamp(Math.round(x + amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function makeShip(side, level = 1) {
  const player = side === "player";
  return {
    side,
    x: player ? 190 : 760,
    y: player ? 250 : 170,
    vx: player ? 0.18 : -0.15,
    vy: 0,
    angle: player ? 0 : Math.PI,
    targetAngle: player ? 0 : Math.PI,
    speed: player ? 0.2 : 0.32,
    maxSpeed: player ? 1.38 : 1.16 + level * 0.03,
    turnRate: player ? 0.030 : 0.024,
    health: 100,
    armor: 0,
    reload: rand(0.2, 1.6),
    flash: 0,
    recoil: 0,
    bob: rand(0, PI2),
    sail: rand(0, PI2),
    sinking: 0,
    sunk: false,
    hue: player ? "#80512e" : "#5c3d24",
    trim: player ? "#dec9a2" : "#c4a879",
    flag: player ? "#ff5f73" : "#5cb9ff",
  };
}

function makeParticles() {
  return {
    smoke: [],
    sparks: [],
    splashes: [],
    embers: [],
    ripples: [],
  };
}

function makeGame() {
  return {
    started: false,
    over: false,
    victory: false,
    level: 1,
    score: 0,
    gold: 0,
    shake: 0,
    wind: 0,
    time: 0,
    phase: 0,
    seaScroll: 0,
    clouds: Array.from({ length: 7 }, (_, i) => ({
      x: rand(0, W),
      y: rand(28, 96),
      s: rand(0.8, 1.5),
      spd: rand(0.04, 0.14),
      p: rand(0, PI2),
    })),
    islands: Array.from({ length: 4 }, (_, i) => ({
      x: rand(80, W - 80),
      y: rand(258, 306),
      w: rand(88, 160),
      h: rand(18, 44),
      p: rand(0, PI2),
    })),
    barrels: Array.from({ length: 4 }, (_, i) => ({
      x: rand(120, W - 120),
      y: rand(SEA_Y + 18, H - 30),
      vx: rand(-0.08, 0.08),
      vy: rand(-0.02, 0.02),
      r: 11,
      alive: true,
      gold: 1,
    })),
    waves: Array.from({ length: 34 }, (_, i) => ({
      x: (i / 34) * W,
      y: SEA_Y + rand(-2, 2),
      a: rand(0, PI2),
      s: rand(0.6, 1.2),
    })),
    player: makeShip("player", 1),
    enemy: makeShip("enemy", 1),
    shots: [],
    particles: makeParticles(),
    rewardTimer: 0,
    message: "",
    messageTimer: 0,
  };
}

function ControlPad({ controlRef, fireRef, onRestart, onStart, started, over, level }) {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <>
      {portrait && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 text-center">
          <div className="max-w-sm rounded-[28px] border border-white/15 bg-white/5 px-6 py-7 backdrop-blur-xl shadow-2xl">
            <div className="text-xs uppercase tracking-[0.45em] text-white/55">Rotate to landscape</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight">The sea wants space.</div>
            <p className="mt-3 text-white/70 leading-relaxed">Turn your iPhone sideways for the full broadside duel.</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-20 pointer-events-none">
        <div className="absolute left-4 top-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-md shadow-lg">
          <div className="text-[11px] uppercase tracking-[0.35em] text-white/55">Pixel naval duel</div>
          <div className="mt-1 text-sm text-white/80">Turn, broadside, survive, sink the enemy.</div>
        </div>

        <div className="absolute right-4 top-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-md shadow-lg text-right">
          <div className="text-[11px] uppercase tracking-[0.35em] text-white/55">Level {String(level).padStart(1, "0")}</div>
          <div className="mt-1 text-sm text-white/80">Gold, score, repairs, glory.</div>
        </div>

        {!started && !portrait && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto px-4">
            <div className="max-w-xl rounded-[30px] border border-white/15 bg-black/45 px-7 py-7 backdrop-blur-xl shadow-2xl text-center">
              <div className="text-xs uppercase tracking-[0.45em] text-white/55">Home screen ready</div>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Broadside of the Deep</h1>
              <p className="mt-4 text-white/72 leading-relaxed">
                A full touch-first pixel-art sea battle: drag the wheel on the left, hold the cannon button on the right, and keep your hull above the waves.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-sm text-white/78">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Left wheel: turn + sail</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Right cannon: broadside</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Barrels: repairs + gold</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Sink ships to advance</div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                <button onClick={onStart} className="rounded-2xl bg-white px-5 py-3 font-medium text-slate-900 transition active:scale-[0.99] hover:scale-[1.02]">
                  Start battle
                </button>
                <button onClick={onRestart} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 font-medium text-white transition active:scale-[0.99] hover:scale-[1.02]">
                  Reset sea
                </button>
              </div>
            </div>
          </div>
        )}

        {over && !portrait && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto px-4">
            <div className="max-w-lg rounded-[30px] border border-white/15 bg-black/50 px-7 py-7 backdrop-blur-xl shadow-2xl text-center">
              <div className="text-xs uppercase tracking-[0.45em] text-white/55">Battle ended</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight">{fireRef.current?.victory ? "Victory at sea" : "Your ship has fallen"}</h2>
              <p className="mt-4 text-white/72 leading-relaxed">Tap to sail again and face a stronger captain.</p>
              <button onClick={onRestart} className="mt-6 rounded-2xl bg-white px-5 py-3 font-medium text-slate-900 transition active:scale-[0.99] hover:scale-[1.02]">
                Sail again
              </button>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-white/78 backdrop-blur-md shadow-lg">
          Drag the left wheel. Hold the right cannon to unleash a broadside.
        </div>
      </div>
    </>
  );
}

function drawPixelRect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function PixelShipBroadsideGame() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const keysRef = useRef(new Set());
  const gameRef = useRef(makeGame());
  const controlRef = useRef({ active: false, id: null, x: 0, y: 0, nx: 0, ny: 0, fire: false });
  const fireRef = useRef({ pressed: false, pulse: 0, victory: false });
  const [ui, setUi] = useState({ started: false, over: false, portrait: false, level: 1, gold: 0, score: 0 });

  const resetGame = () => {
    gameRef.current = makeGame();
    fireRef.current = { pressed: false, pulse: 0, victory: false };
    setUi({ started: false, over: false, portrait: false, level: 1, gold: 0, score: 0 });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      keysRef.current.add(e.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d"].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === "Enter") {
        gameRef.current.started = true;
        setUi((s) => ({ ...s, started: true }));
      }
      if (e.key.toLowerCase() === "r") resetGame();
    };
    const onKeyUp = (e) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const resize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.min(vw / W, vh / H);
      canvas.style.width = `${Math.floor(W * scale)}px`;
      canvas.style.height = `${Math.floor(H * scale)}px`;
      setUi((s) => ({ ...s, portrait: vh > vw }));
    };
    resize();
    window.addEventListener("resize", resize);

    const ptr = controlRef.current;

    const getLocal = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      const y = ((e.clientY - rect.top) / rect.height) * H;
      return { x, y };
    };

    const onDown = (e) => {
      const { x, y } = getLocal(e);
      const id = e.pointerId;
      canvas.setPointerCapture?.(id);
      if (x < W * 0.5) {
        ptr.active = true;
        ptr.id = id;
        ptr.fire = false;
        ptr.x = x;
        ptr.y = y;
        ptr.nx = 0;
        ptr.ny = 0;
      } else {
        ptr.fire = true;
        fireRef.current.pressed = true;
      }
      if (!gameRef.current.started) {
        gameRef.current.started = true;
        setUi((s) => ({ ...s, started: true }));
      }
    };

    const onMove = (e) => {
      if (ptr.id !== e.pointerId) return;
      const { x, y } = getLocal(e);
      const cx = W * 0.19;
      const cy = H * 0.78;
      const dx = x - cx;
      const dy = y - cy;
      const r = 95;
      ptr.nx = clamp(dx / r, -1, 1);
      ptr.ny = clamp(dy / r, -1, 1);
    };

    const onUp = (e) => {
      if (ptr.id === e.pointerId) {
        ptr.active = false;
        ptr.id = null;
        ptr.nx = 0;
        ptr.ny = 0;
      }
      if (ptr.fire) {
        ptr.fire = false;
        fireRef.current.pressed = false;
      }
    };

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onUp, { passive: false });

    const drawCloud = (c, t) => {
      const x = c.x + Math.sin(t * 0.15 + c.p) * 2;
      const y = c.y + Math.cos(t * 0.06 + c.p) * 1;
      const s = c.s;
      ctx.fillStyle = "rgba(255,255,255,0.87)";
      [[0, 6, 14, 6], [10, 0, 20, 10], [25, 6, 14, 5], [13, 7, 17, 6]].forEach(([bx, by, bw, bh]) => {
        ctx.fillRect(Math.round(x + bx * s), Math.round(y + by * s), Math.round(bw * s), Math.round(bh * s));
      });
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(Math.round(x + 6 * s), Math.round(y + 10 * s), Math.round(34 * s), Math.round(5 * s));
    };

    const drawIsland = (isle, t) => {
      const x = isle.x + Math.sin(t * 0.02 + isle.p) * 0.8;
      const y = isle.y + Math.cos(t * 0.013 + isle.p) * 0.6;
      const w = isle.w;
      const h = isle.h;
      ctx.fillStyle = "#17311f";
      ctx.fillRect(Math.round(x - w * 0.5), Math.round(y), Math.round(w), Math.round(h));
      ctx.fillStyle = "#203c26";
      ctx.fillRect(Math.round(x - w * 0.42), Math.round(y - 6), Math.round(w * 0.84), Math.max(1, Math.round(h * 0.4)));
      ctx.fillStyle = "#2d5033";
      ctx.fillRect(Math.round(x - w * 0.28), Math.round(y - 12), Math.round(w * 0.56), Math.max(1, Math.round(h * 0.35)));
      ctx.fillStyle = "#7d7742";
      ctx.fillRect(Math.round(x - w * 0.18), Math.round(y - 14), Math.round(w * 0.08), 6);
      ctx.fillRect(Math.round(x + w * 0.04), Math.round(y - 18), Math.round(w * 0.08), 10);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(Math.round(x - w * 0.48), Math.round(y + h - 1), Math.round(w * 0.96), 2);
    };

    const drawBarrel = (b, t) => {
      if (!b.alive) return;
      const bob = Math.sin(t * 0.07 + b.x * 0.02) * 1.6;
      const x = b.x;
      const y = b.y + bob;
      ctx.fillStyle = "#7d4d25";
      ctx.fillRect(Math.round(x - 7), Math.round(y - 6), 14, 12);
      ctx.fillStyle = "#4c2e17";
      ctx.fillRect(Math.round(x - 7), Math.round(y - 2), 14, 1);
      ctx.fillRect(Math.round(x - 7), Math.round(y + 2), 14, 1);
      ctx.fillStyle = "#d8c29c";
      ctx.fillRect(Math.round(x - 8), Math.round(y - 1), 16, 1);
      ctx.fillRect(Math.round(x - 8), Math.round(y + 3), 16, 1);
    };

    const drawSmoke = (p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      const s = p.size * (1 + (1 - a) * 1.45);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a * 0.48})`;
      ctx.fillRect(Math.round(p.x - s), Math.round(p.y - s), Math.round(s * 2), Math.round(s * 2));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.18})`;
      ctx.fillRect(Math.round(p.x - s + 1), Math.round(p.y - s + 1), Math.max(1, Math.round(s * 2 - 2)), Math.max(1, Math.round(s * 2 - 2)));
    };

    const drawSpark = (p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    };

    const drawSplash = (p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = `rgba(150,220,255,${a})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.65})`;
      ctx.fillRect(Math.round(p.x + p.vx * 0.18), Math.round(p.y + p.vy * 0.18), 1, 1);
    };

    const drawShot = (p) => {
      ctx.fillStyle = "#151515";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(Math.round(p.x + 1), Math.round(p.y + 1), 1, 1);
    };

    const drawShip = (s, t) => {
      const bob = Math.sin(t * 0.06 + s.bob) * 2.2 + Math.sin(t * 0.21 + s.bob * 1.7) * 0.7;
      const x = s.x;
      const y = s.y + bob;
      const facing = s.side === "player" ? 1 : -1;
      const wood = s.hue;
      const trim = s.trim;
      const dark = shade(wood, -30);
      const light = shade(wood, 24);
      const mast = "#d6bc89";
      const sail = s.side === "player" ? "#f1eadb" : "#d6e7f6";
      const sailShade = s.side === "player" ? "#d0c2a9" : "#b5cee9";
      const flag = s.flag;
      const flash = s.flash > 0;
      const sink = s.sinking;
      const broken = s.health < 35;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(facing, 1);
      ctx.rotate(Math.sin(t * 0.035 + s.bob) * 0.015);
      if (sink > 0) {
        ctx.translate(0, sink * 16);
        ctx.rotate(-facing * sink * 0.2);
      }

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(-30, 16, 60, 4);

      // wake
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(-30, 10, 10, 1);
      ctx.fillRect(20, 10, 10, 1);

      // Hull, layered for depth.
      drawPixelRect(ctx, -26, 5, 52, 7, dark);
      drawPixelRect(ctx, -24, 3, 48, 5, wood);
      drawPixelRect(ctx, -21, 1, 42, 4, light);
      drawPixelRect(ctx, -19, 8, 38, 2, trim);
      drawPixelRect(ctx, -17, 10, 34, 1, shade(trim, -18));
      drawPixelRect(ctx, -28, 6, 4, 6, dark);
      drawPixelRect(ctx, 24, 6, 4, 6, dark);

      // deck
      drawPixelRect(ctx, -18, -1, 36, 3, shade(wood, 10));
      drawPixelRect(ctx, -15, -2, 30, 1, shade(trim, 16));

      // cannon ports and black barrels
      [-13, -5, 3, 11].forEach((oy) => {
        drawPixelRect(ctx, -24, oy, 2, 1, "#191919");
        drawPixelRect(ctx, 22, oy, 2, 1, "#191919");
      });
      [-14, -6, 2, 10].forEach((oy) => {
        drawPixelRect(ctx, -23, oy, 3, 2, "#111");
        drawPixelRect(ctx, 20, oy, 3, 2, "#111");
      });

      // masts
      drawPixelRect(ctx, -5, -39, 3, 43, shade(mast, -20));
      drawPixelRect(ctx, 9, -46, 3, 50, shade(mast, -20));
      drawPixelRect(ctx, -4, -39, 2, 43, mast);
      drawPixelRect(ctx, 10, -46, 2, 50, mast);
      drawPixelRect(ctx, -15, -27, 28, 1, shade(mast, 8));
      drawPixelRect(ctx, -7, -36, 32, 1, shade(mast, 8));
      drawPixelRect(ctx, 2, -43, 38, 1, shade(mast, 8));

      // sails with flutter
      const flutter = Math.sin(t * 0.14 + s.sail) * 1.8;
      drawPixelRect(ctx, -16, -26, 14, 16, sailShade);
      drawPixelRect(ctx, -14 + flutter * 0.16, -25, 12, 14, sail);
      drawPixelRect(ctx, -9, -14, 8, 2, shade(sailShade, -18));

      drawPixelRect(ctx, 1, -34, 20, 22, sailShade);
      drawPixelRect(ctx, 3 + flutter * 0.16, -33, 18, 20, sail);
      drawPixelRect(ctx, 3, -13, 14, 2, shade(sailShade, -18));

      drawPixelRect(ctx, 14, -38, 28, 26, sailShade);
      drawPixelRect(ctx, 16 + flutter * 0.18, -37, 26, 24, sail);
      drawPixelRect(ctx, 16, -12, 18, 2, shade(sailShade, -18));

      // rigging
      ctx.fillStyle = "#7b6751";
      ctx.fillRect(-4, -39, 1, 49);
      ctx.fillRect(10, -46, 1, 56);
      ctx.fillRect(-13, -19, 13, 1);
      ctx.fillRect(-1, -29, 21, 1);
      ctx.fillRect(11, -34, 22, 1);
      ctx.fillRect(23, -39, 8, 1);

      // flags
      drawPixelRect(ctx, -5, -42, 8, 2, flag);
      drawPixelRect(ctx, 9, -49, 8, 2, flag);

      if (flash) {
        ctx.fillStyle = "rgba(255,248,196,0.95)";
        ctx.fillRect(-27, -4, 4, 4);
        ctx.fillRect(23, -4, 4, 4);
      }

      if (broken) {
        ctx.fillStyle = "#2f1d13";
        ctx.fillRect(-8, 5, 4, 2);
        ctx.fillRect(5, 7, 4, 2);
        ctx.fillRect(14, 4, 2, 2);
      }
      if (s.health < 15) {
        ctx.fillStyle = "#5a3122";
        ctx.fillRect(-1, 8, 2, 1);
        ctx.fillRect(9, 9, 2, 1);
      }
      ctx.restore();
    };

    const fireBroadside = (shooter, broadside) => {
      const g = gameRef.current;
      shooter.reload = 1.15 + rand(0, 0.25);
      shooter.flash = 0.3;
      shooter.recoil = 1;
      g.shake = Math.max(g.shake, 2.4);
      const sideY = shooter.y + Math.sin(g.time * 0.06 + shooter.bob) * 2;
      const muzzleY = [-11, -4, 3, 10];
      muzzleY.forEach((off, i) => {
        const ang = shooter.angle + broadside * Math.PI / 2 + (i - 1.5) * 0.03;
        const spd = 3.55 + rand(-0.12, 0.16);
        const px = shooter.x + Math.cos(ang) * 26;
        const py = sideY + off;
        g.shots.push({
          x: px,
          y: py,
          vx: Math.cos(ang) * spd + shooter.vx * 0.2,
          vy: Math.sin(ang) * spd + shooter.vy * 0.2,
          life: 300,
          owner: shooter.side,
          b: broadside,
          r: 6,
        });
        for (let n = 0; n < 2; n++) {
          g.particles.sparks.push({ x: px, y: py, vx: rand(-0.25, 0.25), vy: rand(-0.18, 0.1), life: 12, maxLife: 12, r: 255, g: 220, b: 120 });
        }
      });
      for (let n = 0; n < 9; n++) {
        g.particles.smoke.push({ x: shooter.x + broadside * 18, y: sideY, vx: rand(-0.12, 0.12), vy: rand(-0.16, -0.02), life: 36, maxLife: 36, size: rand(2, 5), r: 88, g: 88, b: 94 });
      }
      for (let n = 0; n < 6; n++) {
        g.particles.embers.push({ x: shooter.x + broadside * 18, y: sideY, vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.0), life: 18, maxLife: 18, size: rand(1, 2), r: 255, g: rand(120, 200), b: rand(70, 110) });
      }
      if (navigator.vibrate) navigator.vibrate(18);
    };

    const update = (dt) => {
      const g = gameRef.current;
      g.time += dt;
      g.phase += dt * 0.001;
      fireRef.current.victory = g.victory;
      if (!g.started || g.over) return;

      const p = g.player;
      const e = g.enemy;

      g.seaScroll += dt * 0.032;
      g.wind = Math.sin(g.time * 0.0004) * 0.35 + Math.sin(g.time * 0.0011) * 0.22;
      g.shake = Math.max(0, g.shake - dt * 0.04);
      g.rewardTimer += dt;

      const pad = controlRef.current;
      const k = keysRef.current;
      const moveX = pad.active ? pad.nx : 0;
      const moveY = pad.active ? pad.ny : 0;
      const steer = clamp(moveX, -1, 1);
      const thrust = clamp(-moveY, -1, 1);
      const fireHeld = pad.fire || fireRef.current.pressed || k.has(" ");

      const left = k.has("a") || k.has("arrowleft");
      const right = k.has("d") || k.has("arrowright");
      const up = k.has("w") || k.has("arrowup");
      const down = k.has("s") || k.has("arrowdown");

      let steerInput = steer + (right ? 1 : 0) - (left ? 1 : 0);
      let thrustInput = thrust + (up ? 1 : 0) - (down ? 1 : 0);
      steerInput = clamp(steerInput, -1, 1);
      thrustInput = clamp(thrustInput, -1, 1);

      p.targetAngle += steerInput * p.turnRate;
      p.angle = lerp(p.angle, p.targetAngle, 0.09);
      p.speed = clamp(p.speed + thrustInput * 0.018 - 0.002, -0.32, p.maxSpeed);

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const target = Math.atan2(dy, dx) + Math.PI;
      const diff = Math.atan2(Math.sin(target - e.angle), Math.cos(target - e.angle));
      e.angle += clamp(diff, -e.turnRate, e.turnRate) * 0.8;
      if (dist > 220) e.speed = clamp(e.speed + 0.008, 0.02, e.maxSpeed);
      else if (dist < 150) e.speed = clamp(e.speed - 0.006, -0.2, e.maxSpeed);
      else e.speed = clamp(e.speed + 0.002, -0.1, e.maxSpeed);

      const current = Math.sin(g.time * 0.002 + p.y * 0.015) * 0.0028;
      const current2 = Math.cos(g.time * 0.0018 + e.y * 0.02) * 0.002;

      [p, e].forEach((s, idx) => {
        const facing = idx === 0 ? 1 : -1;
        const ax = Math.cos(s.angle) * s.speed * 0.52 * facing;
        const ay = Math.sin(s.angle) * s.speed * 0.52 * facing;
        s.vx += ax + current * 18 * facing + g.wind * 0.006;
        s.vy += ay + (idx === 0 ? current2 : current) * 18;
        s.vx *= 0.992;
        s.vy *= 0.992;
        s.x += s.vx;
        s.y += s.vy;
        s.x = clamp(s.x, 70, W - 70);
        s.y = clamp(s.y, 120, SEA_Y + 26);
        s.reload = Math.max(0, s.reload - dt * 0.0015);
        s.flash = Math.max(0, s.flash - dt * 0.02);
        s.recoil = Math.max(0, s.recoil - dt * 0.02);
        s.bob += dt * 0.001;
        s.sail += dt * 0.0016;
        if (s.health <= 0) s.sinking = Math.min(1, s.sinking + dt * 0.00065);
      });

      // Boat-to-barrel pickups.
      for (const b of g.barrels) {
        if (!b.alive) continue;
        b.x += b.vx * dt * 0.06;
        b.y += b.vy * dt * 0.06;
        b.vx += Math.sin(g.time * 0.001 + b.x * 0.01) * 0.00001;
        b.x = clamp(b.x, 40, W - 40);
        b.y = clamp(b.y, SEA_Y + 14, H - 22);
        if (dist2(b.x, b.y, p.x, p.y) < 650) {
          b.alive = false;
          p.health = clamp(p.health + 15, 0, 100);
          g.gold += b.gold;
          g.score += 35;
          for (let n = 0; n < 6; n++) g.particles.ripples.push({ x: b.x, y: b.y, vx: rand(-0.12, 0.12), vy: rand(-0.12, 0.12), life: 18, maxLife: 18, size: rand(3, 7), r: 255, g: 255, b: 255 });
          if (navigator.vibrate) navigator.vibrate(10);
        }
      }

      // Player and enemy broadside logic.
      const sideToEnemy = Math.abs(Math.atan2(Math.sin((Math.atan2(dy, dx) - p.angle) - Math.PI / 2), Math.cos((Math.atan2(dy, dx) - p.angle) - Math.PI / 2)));
      const enemyBroadside = Math.abs(p.y - e.y) < 42 && dist < 300;
      const playerBroadsideLeft = Math.atan2(dy, dx) - p.angle > 0;
      const playerBroadsideRight = !playerBroadsideLeft;
      const enemyCanSee = Math.abs(diff) < 0.5 && dist < 280;

      if (fireHeld && p.reload <= 0 && !g.over) {
        fireBroadside(p, playerBroadsideLeft ? -1 : 1);
        g.score += 1;
      }
      if (e.reload <= 0 && enemyBroadside && enemyCanSee) {
        fireBroadside(e, Math.atan2(p.y - e.y, p.x - e.x) > e.angle ? 1 : -1);
      }

      // Cannonballs.
      for (let i = g.shots.length - 1; i >= 0; i--) {
        const b = g.shots[i];
        b.life -= 1;
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.012;
        if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 40) {
          g.shots.splice(i, 1);
          continue;
        }
        const targetShip = b.owner === "player" ? e : p;
        if (targetShip.health > 0 && dist2(b.x, b.y, targetShip.x, targetShip.y) < 440) {
          const hit = 8 + rand(0, 7);
          targetShip.health -= hit;
          g.score += b.owner === "player" ? 18 : 0;
          g.shake = Math.max(g.shake, 3.0);
          for (let n = 0; n < 12; n++) g.particles.smoke.push({ x: b.x, y: b.y, vx: rand(-0.24, 0.24), vy: rand(-0.2, 0.08), life: 30, maxLife: 30, size: rand(2, 5), r: 85, g: 85, b: 92 });
          for (let n = 0; n < 14; n++) g.particles.sparks.push({ x: b.x, y: b.y, vx: rand(-0.58, 0.58), vy: rand(-0.48, 0.22), life: 16, maxLife: 16, r: 255, g: rand(140, 220), b: rand(65, 120) });
          for (let n = 0; n < 9; n++) g.particles.splashes.push({ x: b.x, y: b.y, vx: rand(-0.48, 0.48), vy: rand(-0.62, -0.15), life: 18, maxLife: 18, size: rand(1, 2), r: 140, g: 210, b: 255 });
          g.shots.splice(i, 1);
          if (navigator.vibrate) navigator.vibrate(20);
        }
      }

      const updateParticles = (arr, drift = 0.06, fade = 1) => {
        for (let i = arr.length - 1; i >= 0; i--) {
          const p0 = arr[i];
          p0.x += p0.vx * drift * dt;
          p0.y += p0.vy * drift * dt;
          p0.vx *= 0.992;
          p0.vy *= 0.99;
          p0.life -= fade;
          if (p0.life <= 0) arr.splice(i, 1);
        }
      };
      updateParticles(g.particles.smoke, 0.02, 1);
      updateParticles(g.particles.sparks, 0.05, 1.3);
      updateParticles(g.particles.splashes, 0.05, 1.1);
      updateParticles(g.particles.embers, 0.04, 1.2);
      updateParticles(g.particles.ripples, 0.02, 1.0);

      // Battlefield messaging.
      g.messageTimer = Math.max(0, g.messageTimer - dt * 0.001);
      if (e.health <= 0 && !g.victory) {
        g.victory = true;
        g.score += 250;
        g.gold += 3 + g.level;
        g.message = "Enemy ship sunk";
        g.messageTimer = 3;
        setUi((s) => ({ ...s, score: g.score, gold: g.gold, level: g.level }));
      }
      if (p.health <= 0 && !g.over) {
        g.over = true;
        g.victory = false;
        g.message = "Your ship is lost";
        g.messageTimer = 3;
        setUi((s) => ({ ...s, over: true, score: g.score, gold: g.gold, level: g.level }));
      }

      // Simple progression if victory; new captain, stronger sea.
      if (g.victory && g.rewardTimer > 1600) {
        g.level += 1;
        p.health = clamp(p.health + 40, 0, 100);
        g.enemy = makeShip("enemy", g.level);
        g.shots = [];
        g.particles = makeParticles();
        g.shake = 0;
        g.victory = false;
        g.over = false;
        g.rewardTimer = 0;
        g.message = `Level ${g.level} — new captain spotted`;
        g.messageTimer = 3;
        setUi((s) => ({ ...s, level: g.level }));
      }
    };

    const render = () => {
      const g = gameRef.current;
      const t = g.time;

      const sky = ctx.createLinearGradient(0, 0, 0, SEA_Y);
      sky.addColorStop(0, "#a6e0ff");
      sky.addColorStop(0.45, "#71b7e5");
      sky.addColorStop(0.9, "#3476a8");
      sky.addColorStop(1, "#2a6087");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, SEA_Y);

      const sunX = 122 + Math.sin(t * 0.0003) * 14;
      const sunY = 76 + Math.cos(t * 0.0002) * 8;
      const glow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 110);
      glow.addColorStop(0, "rgba(255,248,210,0.95)");
      glow.addColorStop(0.22, "rgba(255,202,120,0.4)");
      glow.addColorStop(1, "rgba(255,202,120,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, SEA_Y);
      ctx.fillStyle = "rgba(255,247,214,0.92)";
      ctx.fillRect(Math.round(sunX - 4), Math.round(sunY - 4), 8, 8);
      ctx.fillRect(Math.round(sunX + 8), Math.round(sunY - 2), 4, 4);

      // horizon mist
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, SEA_Y - 10, W, 10);

      // clouds
      g.clouds.forEach((c) => {
        c.x += c.spd;
        if (c.x > W + 60) c.x = -90;
        drawCloud(c, t);
      });

      // islands
      g.islands.forEach((isle) => drawIsland(isle, t));

      // sea
      const sea = ctx.createLinearGradient(0, SEA_Y, 0, H);
      sea.addColorStop(0, "#205f89");
      sea.addColorStop(1, "#11324d");
      ctx.fillStyle = sea;
      ctx.fillRect(0, SEA_Y, W, H - SEA_Y);

      // water sheen and wave lines
      for (let y = SEA_Y; y < H; y += 4) {
        const pulse = Math.sin(t * 0.03 + y * 0.1) * 1.2;
        ctx.fillStyle = y % 8 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)";
        ctx.fillRect(0, Math.round(y + pulse), W, 1);
      }
      g.waves.forEach((w, i) => {
        const x = (w.x - g.seaScroll * w.s) % (W + 30) - 15;
        const y = SEA_Y + Math.sin(t * 0.04 + w.a) * 2 + (w.y - SEA_Y) * 0.08;
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)";
        ctx.fillRect(Math.round(x), Math.round(y), 10, 1);
        ctx.fillRect(Math.round(x + 4), Math.round(y + 1), 4, 1);
      });

      // water particles behind ships
      g.particles.ripples.forEach((p) => {
        const a = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.18})`;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(p.size)), 1);
      });

      drawShip(g.player, t);
      drawShip(g.enemy, t);

      // projectiles and particles
      g.shots.forEach(drawShot);
      g.particles.smoke.forEach(drawSmoke);
      g.particles.sparks.forEach(drawSpark);
      g.particles.splashes.forEach(drawSplash);
      g.particles.embers.forEach(drawSpark);

      // vignette and heat haze
      const vignette = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 560);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.2)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      // shake and flash
      const s = g.shake;
      if (s > 0.1) {
        const sx = rand(-s, s);
        const sy = rand(-s, s);
        ctx.setTransform(1, 0, 0, 1, sx, sy);
        ctx.fillStyle = `rgba(255,255,255,${clamp(s * 0.01, 0, 0.12)})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(32, now - last);
      last = now;
      update(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      render();

      // HUD
      const g = gameRef.current;
      const p = g.player;
      const e = g.enemy;
      const bar = (x, y, w, v, label) => {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x, y, w, 18);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect(x + 2, y + 2, w - 4, 14);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(x + 2, y + 2, Math.max(0, Math.round((w - 4) * clamp(v, 0, 100) / 100)), 14);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "12px sans-serif";
        ctx.fillText(label, x + 8, y - 5);
      };
      bar(20, 20, 240, p.health, "YOUR HULL");
      bar(W - 260, 20, 240, e.health, "ENEMY HULL");

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(18, 44, 170, 24);
      ctx.fillStyle = "white";
      ctx.font = "14px sans-serif";
      ctx.fillText(`Score ${Math.floor(g.score)}`, 28, 60);
      ctx.fillText(`Gold ${Math.floor(g.gold)}`, W - 142, 60);
      ctx.fillText(`Level ${g.level}`, W / 2 - 30, 60);

      // left joystick
      const c = controlRef.current;
      const cx = W * 0.19;
      const cy = H * 0.78;
      const knobX = cx + c.nx * 54;
      const knobY = cy + c.ny * 54;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.arc(cx, cy, 64, 0, PI2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 64, 0, PI2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.arc(knobX, knobY, 30, 0, PI2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.arc(knobX, knobY, 30, 0, PI2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "14px sans-serif";
      ctx.fillText("Turn", cx - 18, cy + 90);

      // fire button
      const fx = W * 0.82;
      const fy = H * 0.78;
      const active = fireRef.current.pressed;
      const pulse = active ? 1 + Math.sin(g.time * 0.04) * 0.06 : 1;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = active ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.12)";
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, PI2); ctx.fill();
      ctx.strokeStyle = active ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, PI2); ctx.stroke();
      ctx.fillStyle = "white";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("FIRE", 0, 6);
      ctx.restore();
      ctx.textAlign = "start";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "14px sans-serif";
      ctx.fillText("Broadside", fx - 38, fy + 92);

      // center message
      if (g.messageTimer > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(W / 2 - 120, 72, 240, 28);
        ctx.fillStyle = "white";
        ctx.font = "16px sans-serif";
        ctx.fillText(g.message, W / 2 - ctx.measureText(g.message).width / 2, 92);
      }

      // restart prompt after victory/defeat
      if (g.over) {
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(W / 2 - 140, H - 92, 280, 34);
        ctx.fillStyle = "white";
        ctx.font = "15px sans-serif";
        const text = "Tap restart to sail again";
        ctx.fillText(text, W / 2 - ctx.measureText(text).width / 2, H - 69);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const start = () => {
    gameRef.current.started = true;
    setUi((s) => ({ ...s, started: true }));
  };
  const restart = () => {
    resetGame();
    gameRef.current.started = true;
    setUi((s) => ({ ...s, started: true, over: false }));
  };

  return (
    <div className="min-h-screen w-full bg-[#06101a] overflow-hidden flex items-center justify-center p-0 md:p-4">
      <div className="relative w-full h-screen md:h-auto md:aspect-[16/9] md:max-w-[1400px] rounded-none md:rounded-[34px] overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.55)] border border-white/10 bg-[#06101a]">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: "pixelated", touchAction: "none" }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.16)_100%)] pointer-events-none" />

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-0 right-0 top-0 bottom-0">
            <ControlPad
              controlRef={controlRef}
              fireRef={fireRef}
              started={ui.started}
              over={ui.over}
              level={ui.level}
              onStart={start}
              onRestart={restart}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PixelShipBroadsideGame;
