import React, { useEffect, useMemo, useRef, useState } from "react";

const W = 960;
const H = 540;
const WORLD_W = 2400;
const WORLD_H = 1600;
const PI2 = Math.PI * 2;
const JOY_RADIUS = 95;
const JOY_DEADZONE = 0.08;

// Ship physics tuning, all per-millisecond (dt is clamped to 32ms in the loop).
const RUDDER_RATE = 0.0067;
const MAX_ANGULAR_ACC = 0.0000045;
const ANGULAR_DRAG = 0.004;
const MIN_TURN_AUTHORITY = 0.2;
const FORWARD_ACCEL = 0.000086;
const DRAG_LINEAR = 0.00009;
const DRAG_QUADRATIC = 0.0044;
const LATERAL_DAMP = 0.02;
const REVERSE_FRAC = 0.35;

const SHIP_CELL = 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
const sign = (n) => (n < 0 ? -1 : 1);
const normalizeAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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

// Viking longship — top-down view. Bow (dragon prow) at row 0, stern at row 27.
// 13 cols × 28 rows, SHIP_CELL = 2 px each.
// O=outline  N=near-outline  h=hull-light  T=gunwale
// D=deck  d=deck-seam  l=deck-highlight  S=shield-1  B=shield-2
// M=mast  W=sail  w=sail-shadow  G=gold  P=dragon-light  p=dragon-dark  R=eye
const SHIP_GRID = [
  "......P......",   // 0  dragon snout tip
  ".....PpP.....",   // 1  dragon upper head
  "....OpRpO....",   // 2  dragon face (R=eye/gold)
  "...ONpDpNO...",   // 3  dragon neck meets bow
  "..ONhDDDhNO..",   // 4  bow taper outer
  ".ONhTDDDThNO.",   // 5  bow with gunwale
  "OSNhTDDDThNSO",   // 6  first shields appear
  "OSThdDdDdhTSO",   // 7  shields + clinker seams
  "OBThDlDlDhTBO",   // 8  alt shields + deck highlights
  "OSThdDdDdhTSO",   // 9
  "OBThDlDlDhTBO",   // 10
  "OSThDDGDDhTSO",   // 11 gold ring fitting
  "OBThDwWwDhTBO",   // 12 sail (from above: horizontal stripe)
  "OSThMwWwMhTSO",   // 13 mast posts + sail centre
  "OBThDwWwDhTBO",   // 14 sail
  "OSThDDGDDhTSO",   // 15 gold ring fitting
  "OBThDlDlDhTBO",   // 16
  "OSThdDdDdhTSO",   // 17
  "OBThDlDlDhTBO",   // 18
  "OSThdDdDdhTSO",   // 19
  "OBThDDDDDhTBO",   // 20
  "OSNhTDDDThNSO",   // 21 stern shields + taper starts
  ".ONhTDDDThNO.",   // 22
  "..ONhDDDhNO..",   // 23
  "...ONhDhNO...",   // 24 narrow stern
  "....ODdDO....",   // 25 very narrow
  ".....OdO.....",   // 26 stern tip
  "......O......",   // 27 last stern pixel
];
const SHIP_GRID_W = 13;
const SHIP_GRID_H = SHIP_GRID.length;
const SHIP_HALF_LEN = (SHIP_GRID_H * SHIP_CELL) / 2;

function drawSpriteGrid(ctx, grid, originX, originY, cell, colorFor) {
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ".") continue;
      const color = colorFor(ch);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(originX + col * cell), Math.round(originY + row * cell), cell, cell);
    }
  }
}

function shipColorFor(s) {
  const O_c = shade(s.hue, -58);
  const N_c = shade(s.hue, -30);
  const h_c = shade(s.hue,  30);
  const T_c = shade(s.hue,  -6);
  const D_c = s.trim;
  const d_c = shade(s.trim, -34);
  const l_c = shade(s.trim,  28);
  const S_c = s.flag;
  const B_c = shade(s.trim,  50);
  const M_c = "#0c0805";
  const W_c = shade(s.trim,  60);
  const w_c = shade(s.trim, -20);
  const G_c = "#c09028";
  const P_c = shade(s.flag,  24);
  const p_c = shade(s.flag, -30);
  const R_c = "#ffcc18";
  return (ch) => {
    switch (ch) {
      case "O": return O_c;
      case "N": return N_c;
      case "h": return h_c;
      case "T": return T_c;
      case "D": return D_c;
      case "d": return d_c;
      case "l": return l_c;
      case "S": return S_c;
      case "B": return B_c;
      case "M": return M_c;
      case "W": return W_c;
      case "w": return w_c;
      case "G": return G_c;
      case "P": return P_c;
      case "p": return p_c;
      case "R": return R_c;
      default: return null;
    }
  };
}

function makeShip(side, level = 1) {
  const player = side === "player";
  return {
    side,
    x: 0,
    y: 0,
    angle: player ? 0 : Math.PI,
    angularVel: 0,
    rudder: 0,
    rudderTarget: 0,
    speed: 0.06,
    vx: 0,
    vy: 0,
    maxSpeed: player ? 0.13 : 0.105 + level * 0.003,
    health: 100,
    armor: 0,
    reload: rand(0.2, 1.6),
    flash: 0,
    recoil: 0,
    bob: rand(0, PI2),
    sail: rand(0, PI2),
    sinking: 0,
    sunk: false,
    hue: player ? "#5a3015" : "#38200c",
    trim: player ? "#b87035" : "#8a5228",
    flag: player ? "#c01828" : "#1830a8",
    wakeTrail: [],
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
  const player = makeShip("player", 1);
  player.x = WORLD_W / 2 - 260;
  player.y = WORLD_H / 2;
  const enemy = makeShip("enemy", 1);
  enemy.x = WORLD_W / 2 + 310;
  enemy.y = WORLD_H / 2 - 80;

  return {
    started: false,
    over: false,
    victory: false,
    level: 1,
    score: 0,
    gold: 0,
    shake: 0,
    wind: 0,
    windAngle: rand(0, PI2),
    time: 0,
    phase: 0,
    camera: { x: player.x, y: player.y },
    clouds: Array.from({ length: 7 }, () => ({
      x: rand(0, WORLD_W),
      y: rand(0, WORLD_H),
      s: rand(0.8, 1.6),
      spd: rand(0.03, 0.1),
      p: rand(0, PI2),
    })),
    islands: Array.from({ length: 4 }, () => ({
      x: rand(160, WORLD_W - 160),
      y: rand(160, WORLD_H - 160),
      w: rand(96, 170),
      h: rand(60, 110),
      p: rand(0, PI2),
    })),
    barrels: Array.from({ length: 4 }, () => ({
      x: clamp(rand(player.x - 500, player.x + 500), 40, WORLD_W - 40),
      y: clamp(rand(player.y - 400, player.y + 400), 40, WORLD_H - 40),
      vx: rand(-0.08, 0.08),
      vy: rand(-0.02, 0.02),
      r: 11,
      alive: true,
      gold: 1,
    })),
    waves: Array.from({ length: 40 }, () => ({
      x: rand(0, WORLD_W),
      y: rand(0, WORLD_H),
      a: rand(0, PI2),
      s: rand(0.6, 1.2),
    })),
    windStreaks: Array.from({ length: 18 }, () => ({
      x: rand(0, W),
      y: rand(0, H),
      len: rand(10, 22),
    })),
    player,
    enemy,
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
  const controlRef = useRef({ active: false, id: null, x: 0, y: 0, nx: 0, ny: 0, fire: false, fireId: null });
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
        ptr.x = x;
        ptr.y = y;
        ptr.nx = 0;
        ptr.ny = 0;
      } else {
        ptr.fire = true;
        ptr.fireId = id;
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
      let nx = clamp(dx / JOY_RADIUS, -1, 1);
      let ny = clamp(dy / JOY_RADIUS, -1, 1);
      if (Math.abs(nx) < JOY_DEADZONE) nx = 0;
      if (Math.abs(ny) < JOY_DEADZONE) ny = 0;
      ptr.nx = nx;
      ptr.ny = ny;
    };

    const onUp = (e) => {
      if (ptr.id === e.pointerId) {
        ptr.active = false;
        ptr.id = null;
        ptr.nx = 0;
        ptr.ny = 0;
      }
      if (ptr.fireId === e.pointerId) {
        ptr.fire = false;
        ptr.fireId = null;
        fireRef.current.pressed = false;
      }
    };

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onUp, { passive: false });

    const toScreenX = (wx) => wx - gameRef.current.camera.x + W / 2;
    const toScreenY = (wy) => wy - gameRef.current.camera.y + H / 2;

    // Cloud shadows cast on the water — concentric darkening rings for depth.
    const drawCloud = (c, t) => {
      const x = toScreenX(c.x + Math.sin(t * 0.15 + c.p) * 2.2);
      const y = toScreenY(c.y + Math.cos(t * 0.06 + c.p) * 1.5);
      if (x < -120 || x > W + 120 || y < -80 || y > H + 80) return;
      const s = c.s;
      ctx.fillStyle = "rgba(3,8,16,0.06)";
      ctx.fillRect(Math.round(x - 46 * s), Math.round(y - 22 * s), Math.round(92 * s), Math.round(46 * s));
      ctx.fillStyle = "rgba(3,8,16,0.10)";
      ctx.fillRect(Math.round(x - 34 * s), Math.round(y - 17 * s), Math.round(68 * s), Math.round(34 * s));
      ctx.fillStyle = "rgba(3,8,16,0.15)";
      ctx.fillRect(Math.round(x - 22 * s), Math.round(y - 11 * s), Math.round(44 * s), Math.round(22 * s));
      ctx.fillStyle = "rgba(3,8,16,0.20)";
      ctx.fillRect(Math.round(x - 11 * s), Math.round(y -  6 * s), Math.round(22 * s), Math.round(12 * s));
    };

    const drawIsland = (isle, t) => {
      const x = toScreenX(isle.x);
      const y = toScreenY(isle.y);
      if (x < -220 || x > W + 220 || y < -220 || y > H + 220) return;
      const iw = isle.w;
      const ih = isle.h;
      // Surf foam halo
      ctx.fillStyle = "rgba(188,228,255,0.20)";
      ctx.fillRect(Math.round(x - iw * 0.57), Math.round(y - ih * 0.48), Math.round(iw * 1.14), Math.round(ih * 0.96));
      // Outer beach (sand shadow/wet edge)
      ctx.fillStyle = "#b8a052";
      ctx.fillRect(Math.round(x - iw * 0.50), Math.round(y - ih * 0.40), Math.round(iw * 1.00), Math.round(ih * 0.82));
      // Sandy beach main
      ctx.fillStyle = "#cbb462";
      ctx.fillRect(Math.round(x - iw * 0.46), Math.round(y - ih * 0.36), Math.round(iw * 0.92), Math.round(ih * 0.74));
      // Beach highlight (sunlit NW side)
      ctx.fillStyle = "#ddc878";
      ctx.fillRect(Math.round(x - iw * 0.42), Math.round(y - ih * 0.34), Math.round(iw * 0.40), Math.round(ih * 0.34));
      // Rocky shore ring
      ctx.fillStyle = "#786645";
      ctx.fillRect(Math.round(x - iw * 0.36), Math.round(y - ih * 0.28), Math.round(iw * 0.72), Math.round(ih * 0.58));
      // Rock shadow patches (irregular)
      ctx.fillStyle = "#524535";
      ctx.fillRect(Math.round(x - iw * 0.34), Math.round(y - ih * 0.10), Math.round(iw * 0.10), Math.round(ih * 0.28));
      ctx.fillRect(Math.round(x + iw * 0.18), Math.round(y - ih * 0.20), Math.round(iw * 0.12), Math.round(ih * 0.22));
      // Rock highlight pixels
      ctx.fillStyle = "#9a8860";
      ctx.fillRect(Math.round(x - iw * 0.30), Math.round(y + ih * 0.12), 4, 3);
      ctx.fillRect(Math.round(x + iw * 0.24), Math.round(y - ih * 0.04), 4, 3);
      // Dark forest interior
      ctx.fillStyle = "#1c481a";
      ctx.fillRect(Math.round(x - iw * 0.26), Math.round(y - ih * 0.20), Math.round(iw * 0.52), Math.round(ih * 0.42));
      // Mid canopy
      ctx.fillStyle = "#2a6022";
      ctx.fillRect(Math.round(x - iw * 0.18), Math.round(y - ih * 0.15), Math.round(iw * 0.36), Math.round(ih * 0.31));
      // Bright canopy layer
      ctx.fillStyle = "#3a7c2e";
      ctx.fillRect(Math.round(x - iw * 0.12), Math.round(y - ih * 0.10), Math.round(iw * 0.24), Math.round(ih * 0.20));
      // Sunlit treetop highlight
      ctx.fillStyle = "#4a9238";
      ctx.fillRect(Math.round(x - iw * 0.06), Math.round(y - ih * 0.06), Math.round(iw * 0.12), Math.round(ih * 0.10));
      ctx.fillStyle = "#5aaa44";
      ctx.fillRect(Math.round(x - iw * 0.02), Math.round(y - ih * 0.04), Math.round(iw * 0.04), Math.round(ih * 0.06));
    };

    const drawBarrel = (b, t) => {
      if (!b.alive) return;
      const bob = Math.sin(t * 0.07 + b.x * 0.02) * 1.2;
      const x = toScreenX(b.x);
      const y = toScreenY(b.y + bob);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.ellipse(x, y + 2, 8, 5, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = "#4c2e17";
      ctx.beginPath(); ctx.arc(x, y, 8, 0, PI2); ctx.fill();
      ctx.fillStyle = "#7d4d25";
      ctx.beginPath(); ctx.arc(x, y, 6, 0, PI2); ctx.fill();
      ctx.fillStyle = "#9a6233";
      ctx.beginPath(); ctx.arc(x, y, 3, 0, PI2); ctx.fill();
      ctx.fillStyle = "#d8c29c";
      ctx.fillRect(Math.round(x - 7), Math.round(y - 1), 14, 1);
    };

    const drawSmoke = (p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      const s = p.size * (1 + (1 - a) * 1.45);
      const x = toScreenX(p.x);
      const y = toScreenY(p.y);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a * 0.48})`;
      ctx.fillRect(Math.round(x - s), Math.round(y - s), Math.round(s * 2), Math.round(s * 2));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.18})`;
      ctx.fillRect(Math.round(x - s + 1), Math.round(y - s + 1), Math.max(1, Math.round(s * 2 - 2)), Math.max(1, Math.round(s * 2 - 2)));
    };

    const drawSpark = (p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`;
      ctx.fillRect(Math.round(toScreenX(p.x)), Math.round(toScreenY(p.y)), 1, 1);
    };

    const drawSplash = (p) => {
      const a = clamp(p.life / p.maxLife, 0, 1);
      const x = toScreenX(p.x);
      const y = toScreenY(p.y);
      ctx.fillStyle = `rgba(150,220,255,${a})`;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.65})`;
      ctx.fillRect(Math.round(x + p.vx * 0.18), Math.round(y + p.vy * 0.18), 1, 1);
    };

    const drawShot = (p) => {
      const x = toScreenX(p.x);
      const y = toScreenY(p.y);
      ctx.fillStyle = "#151515";
      ctx.fillRect(Math.round(x), Math.round(y), 3, 3);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(Math.round(x + 1), Math.round(y + 1), 1, 1);
    };

    const halfW = (SHIP_GRID_W * SHIP_CELL) / 2;
    const halfH = (SHIP_GRID_H * SHIP_CELL) / 2;

    const drawShip = (s, t) => {
      const bob = Math.sin(t * 0.05 + s.bob) * 1.1;
      const x = toScreenX(s.x);
      const y = toScreenY(s.y) + bob;
      const sink = s.sinking;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (sink > 0) {
        ctx.globalAlpha = clamp(1 - sink * 0.9, 0.08, 1);
        ctx.translate(0, sink * 10);
      }
      ctx.rotate(s.angle + Math.PI / 2);

      drawSpriteGrid(ctx, SHIP_GRID, -halfW, -halfH, SHIP_CELL, shipColorFor(s));

      if (s.flash > 0) {
        const side = s.flashSide || 1;
        ctx.fillStyle = "rgba(255,248,196,0.9)";
        ctx.fillRect(Math.round(side * (halfW + 1)), -3, 5, 6);
        ctx.fillRect(Math.round(side * (halfW + 1)), 5, 5, 6);
      }

      if (s.health < 35) {
        ctx.fillStyle = "rgba(40,24,16,0.55)";
        ctx.fillRect(-3, -10, 6, 6);
      }
      if (s.health < 15) {
        ctx.fillStyle = "rgba(70,30,20,0.5)";
        ctx.fillRect(-2, 8, 4, 6);
      }
      ctx.restore();
    };

    const drawWake = (trail) => {
      const n = trail.length;
      for (let i = 0; i < n; i++) {
        const pt = trail[i];
        const ageN = (i + 1) / n;
        const alpha = pt.a * ageN * ageN * 0.72;
        if (alpha <= 0.010) continue;
        const sx = Math.round(toScreenX(pt.x));
        const sy = Math.round(toScreenY(pt.y));
        // Bright central wake line
        ctx.fillStyle = `rgba(190,232,255,${alpha})`;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
        // Spreading foam — widens as wake ages (older = smaller i)
        const spread = Math.max(1, Math.round((1 - ageN) * 5));
        if (spread >= 2 && alpha > 0.05) {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
          ctx.fillRect(sx - spread - 1, sy, 2, 1);
          ctx.fillRect(sx + spread,     sy, 2, 1);
        }
        // Fresh sparkle just behind stern
        if (i > n * 0.82 && alpha > 0.18) {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.65})`;
          ctx.fillRect(sx,     sy - 2, 1, 1);
          ctx.fillRect(sx + 1, sy + 1, 1, 1);
        }
      }
    };

    const fireBroadside = (shooter, broadside) => {
      const g = gameRef.current;
      shooter.reload = 1.15 + rand(0, 0.25);
      shooter.flash = 0.3;
      shooter.flashSide = broadside;
      shooter.recoil = 1;
      g.shake = Math.max(g.shake, 2.4);
      const fwdX = Math.cos(shooter.angle);
      const fwdY = Math.sin(shooter.angle);
      const rightX = -Math.sin(shooter.angle);
      const rightY = Math.cos(shooter.angle);
      const lateral = halfW + 4;
      const muzzleOffsets = [-11, -3, 5, 13];
      muzzleOffsets.forEach((off, i) => {
        const ang = shooter.angle + broadside * Math.PI / 2 + (i - 1.5) * 0.03;
        const spd = 3.55 + rand(-0.12, 0.16);
        const px = shooter.x + fwdX * off + rightX * broadside * lateral;
        const py = shooter.y + fwdY * off + rightY * broadside * lateral;
        g.shots.push({
          x: px,
          y: py,
          vx: Math.cos(ang) * spd + shooter.vx * 0.2,
          vy: Math.sin(ang) * spd + shooter.vy * 0.2,
          life: 90,
          owner: shooter.side,
          b: broadside,
          r: 6,
        });
        for (let n = 0; n < 2; n++) {
          g.particles.sparks.push({ x: px, y: py, vx: rand(-0.25, 0.25), vy: rand(-0.18, 0.1), life: 12, maxLife: 12, r: 255, g: 220, b: 120 });
        }
      });
      const mx = shooter.x + rightX * broadside * lateral;
      const my = shooter.y + rightY * broadside * lateral;
      for (let n = 0; n < 9; n++) {
        g.particles.smoke.push({ x: mx, y: my, vx: rand(-0.12, 0.12), vy: rand(-0.16, -0.02), life: 36, maxLife: 36, size: rand(2, 5), r: 88, g: 88, b: 94 });
      }
      for (let n = 0; n < 6; n++) {
        g.particles.embers.push({ x: mx, y: my, vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.0), life: 18, maxLife: 18, size: rand(1, 2), r: 255, g: rand(120, 200), b: rand(70, 110) });
      }
      if (navigator.vibrate) navigator.vibrate(18);
    };

    const speedFactor = (s) => MIN_TURN_AUTHORITY + (1 - MIN_TURN_AUTHORITY) * clamp(Math.abs(s.speed) / s.maxSpeed, 0, 1);

    // Rudder lag + angular inertia + drag-curve speed + lateral-slip damping, all dt-scaled.
    const integrateShip = (s, steerInput, thrustInput, dt) => {
      s.rudderTarget = clamp(steerInput, -1, 1);
      s.rudder = lerp(s.rudder, s.rudderTarget, clamp(RUDDER_RATE * dt, 0, 1));

      const angularAccel = s.rudder * MAX_ANGULAR_ACC * speedFactor(s);
      s.angularVel += angularAccel * dt;
      s.angularVel *= Math.max(0, 1 - ANGULAR_DRAG * dt);
      s.angle += s.angularVel * dt;

      const dragAccel = sign(s.speed) * (DRAG_LINEAR * Math.abs(s.speed) + DRAG_QUADRATIC * s.speed * s.speed);
      s.speed += (clamp(thrustInput, -1, 1) * FORWARD_ACCEL - dragAccel) * dt;
      s.speed = clamp(s.speed, -s.maxSpeed * REVERSE_FRAC, s.maxSpeed);

      const fwdX = Math.cos(s.angle);
      const fwdY = Math.sin(s.angle);
      const rightX = -Math.sin(s.angle);
      const rightY = Math.cos(s.angle);
      const fwdVel = s.vx * fwdX + s.vy * fwdY;
      const latVel = s.vx * rightX + s.vy * rightY;
      const newFwd = lerp(fwdVel, s.speed, clamp(0.02 * dt, 0, 1));
      const newLat = latVel * Math.max(0, 1 - LATERAL_DAMP * dt);
      s.vx = fwdX * newFwd + rightX * newLat;
      s.vy = fwdY * newFwd + rightY * newLat;
    };

    const update = (dt) => {
      const g = gameRef.current;
      g.time += dt;
      g.phase += dt * 0.001;
      fireRef.current.victory = g.victory;
      if (!g.started || g.over) return;

      const p = g.player;
      const e = g.enemy;

      g.wind = Math.sin(g.time * 0.0004) * 0.35 + Math.sin(g.time * 0.0011) * 0.22;
      g.windAngle += dt * 0.00004;
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

      integrateShip(p, steerInput, thrustInput, dt);

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Lead pursuit: aim ahead of the player based on closing speed, not at their instant position.
      const closingTime = clamp(dist / Math.max(0.04, e.maxSpeed), 0, 900);
      const leadX = p.x + p.vx * closingTime * 0.4;
      const leadY = p.y + p.vy * closingTime * 0.4;
      const bearingToLead = Math.atan2(leadY - e.y, leadX - e.x);
      const bearingDiff = normalizeAngle(bearingToLead - e.angle);
      const eSteer = clamp(bearingDiff / 0.6, -1, 1);

      let eThrust;
      if (dist > 260) eThrust = 1;
      else if (dist < 140) eThrust = -0.3;
      else eThrust = 0.35;
      eThrust *= clamp(1 - Math.abs(bearingDiff) / 1.6, 0.25, 1);

      integrateShip(e, eSteer, eThrust, dt);

      const windPush = g.wind * 0.000022;
      const windX = Math.cos(g.windAngle) * windPush;
      const windY = Math.sin(g.windAngle) * windPush;

      [p, e].forEach((s) => {
        const driftX = windX + Math.sin(g.time * 0.0006 + s.y * 0.002) * 0.000008;
        const driftY = windY + Math.cos(g.time * 0.0005 + s.x * 0.002) * 0.000008;
        s.vx += driftX * dt;
        s.vy += driftY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        const margin = 90;
        if (s.x < margin) s.vx += (margin - s.x) * 0.00004 * dt;
        if (s.x > WORLD_W - margin) s.vx -= (s.x - (WORLD_W - margin)) * 0.00004 * dt;
        if (s.y < margin) s.vy += (margin - s.y) * 0.00004 * dt;
        if (s.y > WORLD_H - margin) s.vy -= (s.y - (WORLD_H - margin)) * 0.00004 * dt;

        const fwdX = Math.cos(s.angle);
        const fwdY = Math.sin(s.angle);
        const speedNow = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (speedNow > 0.01) {
          s.wakeTrail.push({ x: s.x - fwdX * SHIP_HALF_LEN, y: s.y - fwdY * SHIP_HALF_LEN, a: clamp(speedNow / s.maxSpeed, 0, 1) });
          if (s.wakeTrail.length > 50) s.wakeTrail.shift();
        }

        s.reload = Math.max(0, s.reload - dt * 0.0015);
        s.flash = Math.max(0, s.flash - dt * 0.02);
        s.recoil = Math.max(0, s.recoil - dt * 0.02);
        s.bob += dt * 0.001;
        s.sail += dt * 0.0016;
        if (s.health <= 0) s.sinking = Math.min(1, s.sinking + dt * 0.00065);
      });

      g.camera.x = lerp(g.camera.x, p.x + Math.cos(p.angle) * 60, clamp(0.0025 * dt, 0, 1));
      g.camera.y = lerp(g.camera.y, p.y + Math.sin(p.angle) * 60, clamp(0.0025 * dt, 0, 1));

      // Boat-to-barrel pickups.
      for (const b of g.barrels) {
        if (!b.alive) continue;
        b.x += b.vx * dt * 0.06;
        b.y += b.vy * dt * 0.06;
        b.vx += Math.sin(g.time * 0.001 + b.x * 0.01) * 0.00001;
        b.x = clamp(b.x, 40, WORLD_W - 40);
        b.y = clamp(b.y, 40, WORLD_H - 40);
        if (dist2(b.x, b.y, p.x, p.y) < 650) {
          b.alive = false;
          p.health = clamp(p.health + 15, 0, 100);
          g.gold += b.gold;
          g.score += 35;
          for (let n = 0; n < 6; n++) g.particles.ripples.push({ x: b.x, y: b.y, vx: rand(-0.12, 0.12), vy: rand(-0.12, 0.12), life: 18, maxLife: 18, size: rand(3, 7), r: 255, g: 255, b: 255 });
          if (navigator.vibrate) navigator.vibrate(10);
        }
      }

      // Player and enemy broadside logic: fire when the target sits in the ~90deg arc off either flank.
      const ARC_HALF = 0.5;
      const FIRE_RANGE = 320;

      const bearingFromPlayer = normalizeAngle(Math.atan2(e.y - p.y, e.x - p.x) - p.angle);
      const playerArcSide = Math.abs(Math.abs(bearingFromPlayer) - Math.PI / 2) < ARC_HALF ? sign(bearingFromPlayer) : 0;

      const bearingFromEnemy = normalizeAngle(Math.atan2(p.y - e.y, p.x - e.x) - e.angle);
      const enemyArcSide = Math.abs(Math.abs(bearingFromEnemy) - Math.PI / 2) < ARC_HALF ? sign(bearingFromEnemy) : 0;

      if (fireHeld && p.reload <= 0 && !g.over && playerArcSide !== 0 && dist < FIRE_RANGE) {
        fireBroadside(p, playerArcSide);
        g.score += 1;
      }
      if (e.reload <= 0 && enemyArcSide !== 0 && dist < FIRE_RANGE) {
        fireBroadside(e, enemyArcSide);
      }

      // Cannonballs.
      for (let i = g.shots.length - 1; i >= 0; i--) {
        const b = g.shots[i];
        b.life -= 1;
        b.x += b.vx;
        b.y += b.vy;
        if (b.life <= 0) {
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
        g.enemy.x = clamp(p.x + Math.cos(p.angle) * 380 + rand(-80, 80), 120, WORLD_W - 120);
        g.enemy.y = clamp(p.y + Math.sin(p.angle) * 380 + rand(-80, 80), 120, WORLD_H - 120);
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
      const camera = g.camera;

      // === ANIMATED 3D PIXEL OCEAN ===
      // Tile-based wave shader. Each 6×6 pixel tile samples a multi-harmonic height
      // function projected onto the wind axis, then maps to an 8-stop depth palette:
      // darkest trough → deep mid → upper slope → sub-crest → white foam cap.
      const SEA_TILE = 6;
      const wdx = Math.cos(g.windAngle), wdy = Math.sin(g.windAngle);
      const wTX0 = Math.floor((camera.x - W / 2) / SEA_TILE);
      const wTY0 = Math.floor((camera.y - H / 2) / SEA_TILE);
      const numTX = Math.ceil(W / SEA_TILE) + 2;
      const numTY = Math.ceil(H / SEA_TILE) + 2;

      for (let ity = 0; ity < numTY; ity++) {
        for (let itx = 0; itx < numTX; itx++) {
          const wtx = wTX0 + itx;
          const wty = wTY0 + ity;
          const wx = wtx * SEA_TILE + SEA_TILE * 0.5;
          const wy = wty * SEA_TILE + SEA_TILE * 0.5;
          const sx = Math.round(wtx * SEA_TILE - (camera.x - W / 2));
          const sy = Math.round(wty * SEA_TILE - (camera.y - H / 2));

          // Project onto wave-travel axis (along) and cross axis (across)
          const along  =  wx * wdx + wy * wdy;
          const across = -wx * wdy + wy * wdx;

          // Three overlapping harmonics: large swell, mid chop, fine ripple
          const h1 = Math.sin(along  * 0.0210 + t * 0.00195);
          const h2 = Math.sin(along  * 0.0395 + t * 0.00335 + across * 0.0082);
          const h3 = Math.sin(across * 0.0155 + t * 0.00135 + along  * 0.0038);
          const wh = h1 * 0.50 + h2 * 0.32 + h3 * 0.18;

          // 8-stop palette: deep trough (near-black navy) → foam cap (near-white cyan)
          let cr, cg, cb;
          if      (wh < -0.56) { cr =   4; cg =  24; cb =  54; }  // deep trough
          else if (wh < -0.28) { cr =   8; cg =  40; cb =  80; }  // trough
          else if (wh < -0.04) { cr =  14; cg =  57; cb = 108; }  // lower slope
          else if (wh <  0.18) { cr =  20; cg =  77; cb = 138; }  // mid water
          else if (wh <  0.38) { cr =  28; cg = 102; cb = 162; }  // upper slope
          else if (wh <  0.54) { cr =  50; cg = 144; cb = 190; }  // sub-crest
          else if (wh <  0.70) { cr = 125; cg = 200; cb = 232; }  // crest glow
          else                 { cr = 212; cg = 238; cb = 253; }  // foam cap

          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          ctx.fillRect(sx, sy, SEA_TILE, SEA_TILE);
        }
      }

      // Wind streaks — bright pixel dashes drifting along wind direction
      const windDirX = Math.cos(g.windAngle);
      const windDirY = Math.sin(g.windAngle);
      const windSpeed = 0.45 + Math.abs(g.wind) * 2.0;
      const wAlpha = 0.09 + Math.abs(g.wind) * 0.13;
      g.windStreaks.forEach((ws) => {
        ws.x += windDirX * windSpeed;
        ws.y += windDirY * windSpeed;
        if (ws.x < -40) ws.x += W + 80;
        if (ws.x > W + 40) ws.x -= W + 80;
        if (ws.y < -40) ws.y += H + 80;
        if (ws.y > H + 40) ws.y -= H + 80;
        const lenX = Math.round(windDirX * ws.len);
        const lenY = Math.round(windDirY * ws.len);
        // Leading bright dot
        ctx.fillStyle = `rgba(255,255,255,${wAlpha * 1.7})`;
        ctx.fillRect(Math.round(ws.x), Math.round(ws.y), 2, 2);
        // Trailing streak
        ctx.fillStyle = `rgba(255,255,255,${wAlpha})`;
        if (Math.abs(lenX) >= Math.abs(lenY)) {
          ctx.fillRect(Math.round(ws.x - lenX * 0.6), Math.round(ws.y), Math.max(2, Math.abs(Math.round(lenX * 0.55))), 1);
        } else {
          ctx.fillRect(Math.round(ws.x), Math.round(ws.y - lenY * 0.6), 1, Math.max(2, Math.abs(Math.round(lenY * 0.55))));
        }
      });

      // clouds — drifting shadow patches cast on the water
      g.clouds.forEach((c) => {
        c.x += c.spd;
        if (c.x > WORLD_W) c.x -= WORLD_W;
        if (c.x < 0) c.x += WORLD_W;
        drawCloud(c, t);
      });

      // islands
      g.islands.forEach((isle) => drawIsland(isle, t));

      // barrels
      g.barrels.forEach((b) => drawBarrel(b, t));

      // wakes
      drawWake(g.player.wakeTrail);
      drawWake(g.enemy.wakeTrail);

      // water particles behind ships
      g.particles.ripples.forEach((p) => {
        const a = clamp(p.life / p.maxLife, 0, 1);
        const x = toScreenX(p.x);
        const y = toScreenY(p.y);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.18})`;
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(p.size)), 1);
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

      // off-screen enemy indicator — the follow camera can hide the enemy mid-chase
      if (!e.sunk && e.health > 0) {
        const exs = toScreenX(e.x);
        const eys = toScreenY(e.y);
        const margin = 26;
        if (exs < margin || exs > W - margin || eys < margin || eys > H - margin) {
          const ang = Math.atan2(eys - H / 2, exs - W / 2);
          const ex = clamp(exs, margin, W - margin);
          const ey = clamp(eys, margin, H - margin);
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(ang);
          ctx.fillStyle = "rgba(255,95,115,0.85)";
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -7);
          ctx.lineTo(-6, 7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.font = "11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("ENEMY", ex, ey + (ey < H / 2 ? 22 : -16));
          ctx.textAlign = "start";
        }
      }

      // left joystick
      const c = controlRef.current;
      const cx = W * 0.19;
      const cy = H * 0.78;
      const knobX = cx + c.nx * JOY_RADIUS;
      const knobY = cy + c.ny * JOY_RADIUS;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.arc(cx, cy, JOY_RADIUS, 0, PI2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, JOY_RADIUS, 0, PI2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.arc(knobX, knobY, 30, 0, PI2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.arc(knobX, knobY, 30, 0, PI2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "14px sans-serif";
      ctx.fillText("Turn", cx - 18, cy + JOY_RADIUS + 18);

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
