// Synthesised sound effects — WebAudio only, no audio files.
// Engine hum, police siren, gunshots, pickup chimes, mission stings.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, lowpass) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    try {
      const len = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = c.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(c.destination);
      src.start();
    } catch { /* best-effort */ }
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (muted) this.stopEngine();
      return muted;
    },
    get muted() { return muted; },
    click() { tone(660, 0.07, 'square', 0.08); },
    pickup() { tone(880, 0.1, 'sine', 0.14); setTimeout(() => tone(1318, 0.14, 'sine', 0.12), 90); },
    cash() { tone(1046, 0.09, 'triangle', 0.14); setTimeout(() => tone(1568, 0.16, 'triangle', 0.12), 80); },
    gunshot() { noise(0.16, 0.5, 900); tone(160, 0.1, 'square', 0.2, 60); },
    hit() { tone(220, 0.12, 'sawtooth', 0.16, 110); },
    crash() { noise(0.3, 0.4, 500); },
    missionStart() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.16), i * 110)); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.18), i * 120)); },
    missionFail() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.12), i * 140)); },
    busted() { [440, 415, 392, 370].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.14), i * 160)); },
    startEngine() { ensure(); if (!ctx || muted) return; this.stopEngine(); try {
      engineOsc = ctx.createOscillator(); engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain.gain.value = 0.0;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
      engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
    } catch { /* best-effort */ } },
    setEngine(speedRatio, on) {
      if (!ctx || !engineOsc || !engineGain) return;
      try {
        engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(on && !muted ? 0.05 + speedRatio * 0.05 : 0.0, ctx.currentTime, 0.1);
      } catch { /* best-effort */ }
    },
    stopEngine() {
      try { if (engineOsc) engineOsc.stop(); } catch { /* already stopped */ }
      engineOsc = null; engineGain = null;
    },
    updateSiren(dt, wanted) {
      if (!ctx || muted || wanted < 1) {
        if (sirenOsc) { try { sirenOsc.stop(); } catch { /* noop */ } sirenOsc = null; sirenGain = null; }
        return;
      }
      ensure();
      if (!sirenOsc) {
        try {
          sirenOsc = ctx.createOscillator(); sirenGain = ctx.createGain();
          sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
          sirenGain.gain.value = 0.035;
          sirenOsc.connect(sirenGain).connect(ctx.destination);
          sirenOsc.start();
        } catch { sirenOsc = null; }
      }
      if (sirenOsc) {
        sirenTimer += dt;
        const f = Math.sin(sirenTimer * 2.4) > 0 ? 950 : 650;
        try { sirenOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05); } catch { /* noop */ }
      }
    },
  };
}
