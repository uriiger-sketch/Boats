'use strict';
// ---------------------------------------------------------------------------
// Multi-touch floating joystick + buttons, keyboard and gamepad.
// ---------------------------------------------------------------------------

const UI = { buttons: [], zones: {}, pressed: null };

function uiButton(id, x, y, w, h, onTap) { UI.buttons.push({ id, x, y, w, h, onTap }); }

const Input = {
  touchMode: false,
  pointers: new Map(),
  stick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, R: 24 },
  fireHeld: false, fireEdge: false, kegEdge: false,
  keys: new Set(), keyEdge: new Set(),
  pad: { fire: false, keg: false, start: false },

  toLogical(e, canvas) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  },

  hitButton(x, y) {
    for (let i = UI.buttons.length - 1; i >= 0; i--) {
      const b = UI.buttons[i];
      if (x >= b.x - 2 && y >= b.y - 2 && x <= b.x + b.w + 2 && y <= b.y + b.h + 2) return b;
    }
    return null;
  },

  down(e, canvas) {
    e.preventDefault();
    Sound.unlock();
    if (e.pointerType === 'touch') this.touchMode = true;
    const p = this.toLogical(e, canvas);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const btn = this.hitButton(p.x, p.y);
    if (btn) { this.pointers.set(e.pointerId, { role: 'btn', id: btn.id }); UI.pressed = btn.id; return; }
    const playing = G.state === 'playing' || G.state === 'clearing';
    if (!playing) { this.pointers.set(e.pointerId, { role: 'none' }); return; }
    const z = UI.zones;
    if (z.keg && dist(p.x, p.y, z.keg.x, z.keg.y) < z.keg.r + 6) { this.kegEdge = true; this.pointers.set(e.pointerId, { role: 'keg' }); UI.pressed = 'keg'; return; }
    if (p.x < view.w * 0.5) {
      const s = this.stick;
      s.active = true; s.id = e.pointerId; s.ox = p.x; s.oy = p.y; s.x = p.x; s.y = p.y;
      this.pointers.set(e.pointerId, { role: 'stick' });
      return;
    }
    this.fireHeld = true; this.fireEdge = true;
    this.pointers.set(e.pointerId, { role: 'fire' });
  },

  move(e, canvas) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    e.preventDefault();
    const p = this.toLogical(e, canvas);
    if (ptr.role === 'stick') {
      const s = this.stick;
      s.x = p.x; s.y = p.y;
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      if (d > s.R) { s.ox = s.x - (dx / d) * s.R; s.oy = s.y - (dy / d) * s.R; }
    } else if (ptr.role === 'btn') {
      const b = this.hitButton(p.x, p.y);
      UI.pressed = b && b.id === ptr.id ? ptr.id : null;
    }
  },

  up(e, canvas) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    const p = this.toLogical(e, canvas);
    if (ptr.role === 'stick') { this.stick.active = false; this.stick.id = null; }
    else if (ptr.role === 'fire') { this.fireHeld = [...this.pointers.values()].some((q) => q.role === 'fire'); }
    else if (ptr.role === 'btn') {
      const b = this.hitButton(p.x, p.y);
      if (b && b.id === ptr.id && e.type !== 'pointercancel') { Sound.fx.click(); haptic('select'); b.onTap(); }
    }
    if (UI.pressed === ptr.id || ptr.role === 'keg') UI.pressed = null;
  },

  clearAll() {
    this.pointers.clear(); this.stick.active = false; this.fireHeld = false; UI.pressed = null; this.keys.clear();
  },

  keyDown(e) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
    Sound.unlock();
    if (!this.keys.has(k)) this.keyEdge.add(k);
    this.keys.add(k);
  },
  keyUp(e) { this.keys.delete(e.key.toLowerCase()); },
  edge(k) { if (this.keyEdge.has(k)) { this.keyEdge.delete(k); return true; } return false; },

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const fire = !!(gp.buttons[0] && gp.buttons[0].pressed) || !!(gp.buttons[7] && gp.buttons[7].value > 0.4);
      const keg = !!(gp.buttons[2] && gp.buttons[2].pressed) || !!(gp.buttons[1] && gp.buttons[1].pressed);
      const start = !!(gp.buttons[9] && gp.buttons[9].pressed);
      const res = { ax, ay, fire, fireEdge: fire && !this.pad.fire, keg: keg && !this.pad.keg, start: start && !this.pad.start };
      this.pad.fire = fire; this.pad.keg = keg; this.pad.start = start;
      return res;
    }
    return null;
  },

  // Snapshot for the player ship; edge-triggered fields are consumed here.
  control() {
    const k = this.keys;
    const c = { stick: false, angle: 0, mag: 0, turn: 0, throttle: 0, fire: false, fireEdge: false, firePort: false, fireStar: false, keg: false };
    const s = this.stick;
    if (s.active) {
      const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy) / s.R;
      if (m > 0.2) { c.stick = true; c.angle = Math.atan2(dy, dx); c.mag = clamp((m - 0.2) / 0.8, 0, 1); }
    }
    const gp = this.pollPad();
    if (gp && Math.hypot(gp.ax, gp.ay) > 0.3) { c.stick = true; c.angle = Math.atan2(gp.ay, gp.ax); c.mag = clamp((Math.hypot(gp.ax, gp.ay) - 0.3) / 0.7, 0, 1); }
    if (k.has('a') || k.has('arrowleft')) c.turn -= 1;
    if (k.has('d') || k.has('arrowright')) c.turn += 1;
    if (k.has('w') || k.has('arrowup')) c.throttle += 1;
    if (k.has('s') || k.has('arrowdown')) c.throttle -= 1;
    c.fire = this.fireHeld || k.has(' ') || (gp && gp.fire);
    c.fireEdge = this.fireEdge || this.edge(' ') || (gp && gp.fireEdge);
    this.fireEdge = false;
    c.firePort = this.edge('q') || k.has('q');
    c.fireStar = this.edge('e') || k.has('e');
    c.keg = this.kegEdge || this.edge('k') || this.edge('shift') || (gp && gp.keg);
    this.kegEdge = false;
    return c;
  },
};
