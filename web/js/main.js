'use strict';
// ---------------------------------------------------------------------------
// Boot, integer-scaled pixel canvas, input wiring and the main loop.
// ---------------------------------------------------------------------------

(function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const safeEl = document.getElementById('safe');
  let portrait = false;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth, ch = window.innerHeight;
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    const scale = Math.max(1, Math.round(ph / 170));
    const VW = Math.ceil(pw / scale), VH = Math.ceil(ph / scale);
    canvas.width = VW; canvas.height = VH;
    canvas.style.width = (VW * scale) / dpr + 'px';
    canvas.style.height = (VH * scale) / dpr + 'px';
    ctx.imageSmoothingEnabled = false;
    view.w = VW; view.h = VH;
    const cs = getComputedStyle(safeEl);
    const f = dpr / scale;
    view.safe = {
      t: (parseFloat(cs.paddingTop) || 0) * f,
      r: (parseFloat(cs.paddingRight) || 0) * f,
      b: (parseFloat(cs.paddingBottom) || 0) * f,
      l: (parseFloat(cs.paddingLeft) || 0) * f,
    };
    portrait = VH > VW * 1.05;
    if (portrait) pauseGame();
    if (G.player) updateCamera(1);
  }

  Art.init();
  resize();
  toTitle();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  canvas.addEventListener('pointerdown', (e) => Input.down(e, canvas), { passive: false });
  canvas.addEventListener('pointermove', (e) => Input.move(e, canvas), { passive: false });
  canvas.addEventListener('pointerup', (e) => Input.up(e, canvas), { passive: false });
  canvas.addEventListener('pointercancel', (e) => Input.up(e, canvas), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', (e) => Input.keyDown(e), { passive: false });
  window.addEventListener('keyup', (e) => Input.keyUp(e));
  window.addEventListener('blur', () => { Input.clearAll(); });

  const appPause = () => { pauseGame(); Input.clearAll(); Sound.suspend(); };
  const appResume = () => { Sound.resume(); };
  document.addEventListener('visibilitychange', () => (document.hidden ? appPause() : appResume()));
  window.__appPause = appPause;
  window.__appResume = appResume;

  function menuKeys() {
    const ok = Input.edge('enter') || (G.state !== 'playing' && G.state !== 'clearing' && Input.edge(' '));
    const esc = Input.edge('escape') || Input.edge('p');
    switch (G.state) {
      case 'title': if (ok) { if (loadRun()) continueGame(); else newGame(); } break;
      case 'shop': {
        if (ok) setSail();
        const list = G.shopPage === 'yard' ? REFITS : UPGRADES;
        for (let i = 0; i < list.length; i++) if (Input.edge(String(i + 1))) buyUpgrade(list[i]);
        if (esc && G.shopPage === 'yard') G.shopPage = 'main';
        if (Input.edge('y') && shipyardOpen()) { G.shopPage = 'yard'; G.yardSeen = true; }
        break;
      }
      case 'gameover': if (ok) newGame(); if (esc) toTitle(); break;
      case 'paused': if (ok || esc) resumeGame(); break;
      default: if (esc) pauseGame(); break;
    }
  }

  function render() {
    UI.buttons = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (portrait) { drawRotate(ctx); return; }
    const cam = drawWorldLayer(ctx);
    const inGame = G.state === 'playing' || G.state === 'clearing' || G.state === 'sinking' || G.state === 'paused';
    if (inGame) {
      drawAim(ctx, cam);
      drawThreats(ctx, cam);
      drawShipBars(ctx, cam);
      drawFloatTexts(ctx, cam);
      drawArrows(ctx);
      drawHUD(ctx);
      if (G.state !== 'paused') drawControls(ctx);
      drawBanner(ctx);
      drawHint(ctx);
      drawVignette(ctx);
    }
    if (G.state === 'title') drawTitle(ctx);
    else if (G.state === 'shop') drawShop(ctx);
    else if (G.state === 'gameover') drawGameOver(ctx);
    else if (G.state === 'paused') drawPause(ctx);
  }

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    try {
      menuKeys();
      if (!portrait) {
        const steps = dt > 1 / 40 ? 2 : 1;
        for (let i = 0; i < steps; i++) update(dt / steps);
      } else {
        G.t += dt;
      }
      render();
    } catch (err) {
      console.error(err);
    }
    Input.keyEdge.clear();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__game = { G, World, view };
})();
