'use strict';
// ---------------------------------------------------------------------------
// Procedural Web Audio: every sound is synthesised, no audio files shipped.
// ---------------------------------------------------------------------------

const Sound = (() => {
  let ac = null, master, sfxBus, musicBus, ambBus, noiseBuf, comp;
  let unlocked = false, musicTimer = null, ambSrc = null;

  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = Settings.sound ? 0.8 : 0; sfxBus.connect(comp);
    ambBus = ac.createGain(); ambBus.gain.value = Settings.sound ? 0.16 : 0; ambBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = Settings.music ? 0.22 : 0; musicBus.connect(master);
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function unlock() {
    if (!init()) return;
    if (ac.state === 'suspended') ac.resume();
    if (unlocked) return;
    unlocked = true;
    const b = ac.createBuffer(1, 1, 22050);
    const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
    startAmbient();
    startMusic();
  }

  function out(pan) {
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(sfxBus); return p;
    }
    return sfxBus;
  }

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function noise({ type = 'lowpass', f0 = 1000, f1 = null, q = 0.7, vol = 0.5, attack = 0.005, decay = 0.3, delay = 0, pan = 0, dest = null, rate = 1 }) {
    if (!ac || !unlocked) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = ac.createGain(); env(g, t, vol, attack, decay);
    src.connect(f); f.connect(g); g.connect(dest || out(pan));
    const dur = attack + decay + 0.05;
    src.start(t, Math.random() * Math.max(0, 1.9 - dur * rate), dur);
  }

  function tone({ type = 'square', f0 = 440, f1 = null, vol = 0.2, attack = 0.005, decay = 0.2, delay = 0, pan = 0, dest = null, lp = 0 }) {
    if (!ac || !unlocked) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = ac.createGain(); env(g, t, vol, attack, decay);
    let node = o;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g); g.connect(dest || out(pan));
    o.start(t); o.stop(t + attack + decay + 0.05);
  }

  // --- Sound effects -----------------------------------------------------
  const fx = {
    cannon(vol = 1, pan = 0, delay = 0) {
      const p = rand(0.85, 1.15);
      noise({ type: 'lowpass', f0: 1800 * p, f1: 120, vol: 0.9 * vol, attack: 0.002, decay: 0.55, delay, pan });
      tone({ type: 'sine', f0: 110 * p, f1: 32, vol: 0.9 * vol, attack: 0.002, decay: 0.35, delay, pan });
      noise({ type: 'highpass', f0: 2500, vol: 0.25 * vol, attack: 0.001, decay: 0.06, delay, pan });
    },
    splash(vol = 1, pan = 0) {
      noise({ type: 'bandpass', f0: rand(900, 1400), f1: 400, q: 0.8, vol: 0.35 * vol, attack: 0.01, decay: 0.35, pan });
    },
    hit(vol = 1, pan = 0) {
      noise({ type: 'bandpass', f0: 700, f1: 200, q: 1.5, vol: 0.8 * vol, attack: 0.002, decay: 0.18, pan });
      tone({ type: 'square', f0: 140, f1: 60, vol: 0.25 * vol, attack: 0.002, decay: 0.12, pan, lp: 900 });
      noise({ type: 'highpass', f0: 3000, vol: 0.2 * vol, attack: 0.001, decay: 0.05, delay: 0.03, pan });
    },
    hurt() {
      noise({ type: 'lowpass', f0: 1200, f1: 150, vol: 0.9, attack: 0.002, decay: 0.3 });
      tone({ type: 'sawtooth', f0: 180, f1: 70, vol: 0.25, attack: 0.002, decay: 0.25, lp: 800 });
    },
    explode(vol = 1, pan = 0) {
      noise({ type: 'lowpass', f0: 2400, f1: 60, vol: 1.0 * vol, attack: 0.003, decay: 1.1, pan });
      tone({ type: 'sine', f0: 90, f1: 25, vol: 1.0 * vol, attack: 0.003, decay: 0.7, pan });
      noise({ type: 'bandpass', f0: 500, f1: 150, q: 1, vol: 0.5 * vol, attack: 0.05, decay: 0.9, delay: 0.1, pan });
    },
    sink(pan = 0) {
      tone({ type: 'triangle', f0: 300, f1: 60, vol: 0.25, attack: 0.02, decay: 1.2, pan });
      for (let i = 0; i < 6; i++) tone({ type: 'sine', f0: rand(300, 700), f1: rand(700, 1200), vol: 0.08, attack: 0.005, decay: 0.06, delay: 0.3 + i * rand(0.08, 0.2), pan });
    },
    coin(step = 0) {
      const base = 988 * Math.pow(2, Math.min(step, 12) / 24);
      tone({ type: 'square', f0: base, vol: 0.09, attack: 0.002, decay: 0.05, lp: 5000 });
      tone({ type: 'square', f0: base * 1.335, vol: 0.09, attack: 0.002, decay: 0.16, delay: 0.05, lp: 5000 });
    },
    pickup() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, vol: 0.08, attack: 0.003, decay: 0.09, delay: i * 0.06, lp: 4000 }));
    },
    repair() {
      [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', f0: f, vol: 0.18, attack: 0.005, decay: 0.15, delay: i * 0.07 }));
    },
    buy() {
      tone({ type: 'square', f0: 660, vol: 0.1, decay: 0.06, lp: 4000 });
      tone({ type: 'square', f0: 880, vol: 0.1, decay: 0.08, delay: 0.06, lp: 4000 });
      tone({ type: 'square', f0: 1320, vol: 0.1, decay: 0.18, delay: 0.12, lp: 4000 });
    },
    deny() {
      tone({ type: 'square', f0: 200, vol: 0.12, decay: 0.08, lp: 1200 });
      tone({ type: 'square', f0: 150, vol: 0.12, decay: 0.14, delay: 0.09, lp: 1200 });
    },
    click() { tone({ type: 'square', f0: 1200, f1: 900, vol: 0.06, attack: 0.001, decay: 0.04, lp: 3000 }); },
    keg() { tone({ type: 'triangle', f0: 220, f1: 110, vol: 0.25, decay: 0.15 }); noise({ type: 'bandpass', f0: 800, q: 2, vol: 0.2, decay: 0.2 }); },
    fanfare() {
      const n = [[392, 0], [523, 0.14], [659, 0.28], [784, 0.42], [659, 0.62], [784, 0.74]];
      n.forEach(([f, d], i) => {
        tone({ type: 'square', f0: f, vol: 0.09, attack: 0.005, decay: i === n.length - 1 ? 0.5 : 0.13, delay: d, lp: 3500 });
        tone({ type: 'triangle', f0: f / 2, vol: 0.12, attack: 0.005, decay: 0.15, delay: d });
      });
    },
    victory() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, vol: 0.09, attack: 0.005, decay: i === 5 ? 0.6 : 0.12, delay: i * 0.11, lp: 4000 }));
    },
    gameover() {
      [392, 370, 349, 330, 294].forEach((f, i) => tone({ type: 'triangle', f0: f, vol: 0.22, attack: 0.01, decay: i === 4 ? 1.2 : 0.3, delay: i * 0.28 }));
    },
    bossHorn() {
      tone({ type: 'sawtooth', f0: 98, vol: 0.25, attack: 0.2, decay: 1.4, lp: 600 });
      tone({ type: 'sawtooth', f0: 147, vol: 0.18, attack: 0.25, decay: 1.3, lp: 700, delay: 0.05 });
    },
    thunder() {
      noise({ type: 'lowpass', f0: 900, f1: 60, vol: 0.9, attack: 0.03, decay: 2.4, delay: rand(0.2, 0.6), rate: 0.6 });
      noise({ type: 'lowpass', f0: 300, f1: 40, vol: 0.7, attack: 0.3, decay: 2.0, delay: 0.5, rate: 0.5 });
    },
    whistle() { tone({ type: 'sine', f0: 1400, f1: 500, vol: 0.06, attack: 0.05, decay: 0.6 }); },
  };

  // --- Ambient surf ----------------------------------------------------------
  function startAmbient() {
    if (!ac || ambSrc) return;
    ambSrc = ac.createBufferSource(); ambSrc.buffer = noiseBuf; ambSrc.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ac.createGain(); lg.gain.value = 0.4;
    lfo.connect(lg); lg.connect(g.gain);
    ambSrc.connect(f); f.connect(g); g.connect(ambBus);
    ambSrc.start(); lfo.start();
  }

  // --- Music: an original 16-bar tune in D minor, 6/8 -------------------------
  const MEL = [
    [62, 2], [65, 1], [69, 2], [69, 1], [67, 2], [65, 1], [64, 2], [62, 1],
    [60, 2], [64, 1], [67, 2], [67, 1], [65, 2], [64, 1], [62, 3],
    [62, 2], [65, 1], [69, 2], [74, 1], [72, 2], [69, 1], [67, 2], [65, 1],
    [64, 2], [67, 1], [65, 2], [64, 1], [62, 3], [0, 3],
    [69, 2], [69, 1], [70, 2], [69, 1], [67, 2], [65, 1], [67, 3],
    [65, 2], [65, 1], [67, 2], [65, 1], [64, 2], [60, 1], [64, 3],
    [62, 2], [65, 1], [69, 2], [72, 1], [74, 3], [72, 2], [69, 1],
    [67, 2], [64, 1], [60, 2], [64, 1], [62, 3], [0, 3],
  ];
  const ROOTS = [38, 43, 36, 38, 38, 41, 45, 38, 41, 36, 41, 36, 38, 46, 36, 38];
  const BPM = 104;
  const EIGHTH = 60 / BPM / 2;
  const LOOP = 16 * 6;
  const melTimes = [];
  { let t = 0; for (const [n, l] of MEL) { melTimes.push([t, n, l]); t += l; } }
  let musicStart = 0, nextStep = 0;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function scheduleMusic() {
    if (!ac) return;
    const ahead = ac.currentTime + 0.2;
    while (musicStart + nextStep * EIGHTH < ahead) {
      const step = nextStep % LOOP;
      const t = musicStart + nextStep * EIGHTH;
      const delay = Math.max(0, t - ac.currentTime);
      for (const [st, n, l] of melTimes) {
        if (st === step && n) {
          tone({ type: 'square', f0: mtof(n), vol: 0.16, attack: 0.01, decay: l * EIGHTH * 0.9, delay, dest: musicBus, lp: 2200 });
          tone({ type: 'triangle', f0: mtof(n + 12), vol: 0.05, attack: 0.01, decay: l * EIGHTH * 0.7, delay, dest: musicBus });
        }
      }
      const bar = Math.floor(step / 6), beat = step % 6, root = ROOTS[bar];
      if (beat === 0) tone({ type: 'triangle', f0: mtof(root), vol: 0.5, attack: 0.01, decay: EIGHTH * 1.8, delay, dest: musicBus });
      if (beat === 3) tone({ type: 'triangle', f0: mtof(root + 7), vol: 0.4, attack: 0.01, decay: EIGHTH * 1.6, delay, dest: musicBus });
      if (beat === 5) tone({ type: 'triangle', f0: mtof(root + 12), vol: 0.3, attack: 0.01, decay: EIGHTH * 0.8, delay, dest: musicBus });
      if (beat === 0) noise({ type: 'lowpass', f0: 180, vol: 0.5, attack: 0.002, decay: 0.12, delay, dest: musicBus });
      if (beat === 3) noise({ type: 'bandpass', f0: 1800, q: 1, vol: 0.18, attack: 0.002, decay: 0.08, delay, dest: musicBus });
      noise({ type: 'highpass', f0: 7000, vol: beat % 3 === 0 ? 0.06 : 0.03, attack: 0.001, decay: 0.03, delay, dest: musicBus });
      nextStep++;
    }
  }

  function startMusic() {
    if (!ac || musicTimer) return;
    musicStart = ac.currentTime + 0.1; nextStep = 0;
    musicTimer = setInterval(scheduleMusic, 50);
  }

  function setSound(on) {
    Settings.sound = on; Settings.save();
    if (!ac) return;
    sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.05);
    ambBus.gain.setTargetAtTime(on ? 0.16 : 0, ac.currentTime, 0.05);
  }
  function setMusic(on) {
    Settings.music = on; Settings.save();
    if (!ac) return;
    musicBus.gain.setTargetAtTime(on ? 0.22 : 0, ac.currentTime, 0.1);
  }
  function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
  function resume() { if (ac && unlocked && ac.state !== 'running') ac.resume(); }

  return { unlock, fx, setSound, setMusic, suspend, resume };
})();
