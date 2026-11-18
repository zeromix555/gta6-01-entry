// SOLMAR HEAT — audio: everything synthesized with WebAudio.
//
// No audio files: the engine is a detuned sawtooth through a low-pass
// filter, the gunshot is a burst of filtered noise, the siren is two
// alternating tones, and the jingles are tiny sine arpeggios. The context
// is created lazily on the first user gesture and every method is a no-op
// until then, so headless runs (self-test, screenshots) never throw and
// never need sound. M mutes everything.

/** Create the audio object. Call `ensure()` from a user gesture. */
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: null,
    muted: false,
    ready: false,
  };

  /** Create the context and the always-on nodes (engine + siren). Safe to call twice. */
  audio.ensure = function ensure() {
    if (audio.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audio.ctx = ctx;
      audio.master = ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(ctx.destination);

      // Engine: two saws a few cents apart, low-passed, gain follows speed.
      audio.engineOsc = ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 60;
      audio.engineOsc2 = ctx.createOscillator();
      audio.engineOsc2.type = 'sawtooth';
      audio.engineOsc2.frequency.value = 63;
      audio.engineFilter = ctx.createBiquadFilter();
      audio.engineFilter.type = 'lowpass';
      audio.engineFilter.frequency.value = 500;
      audio.engineGain = ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineFilter);
      audio.engineOsc2.connect(audio.engineFilter);
      audio.engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.engineOsc2.start();

      // Siren: a square wave whose frequency flips between two tones.
      audio.sirenOsc = ctx.createOscillator();
      audio.sirenOsc.type = 'square';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.sirenTimer = 0;

      audio.ready = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {
      // No audio on this machine: the game stays silent and keeps playing.
      audio.ready = false;
    }
  };

  /** Engine hum follows the car's speed; silent on foot or at rest. */
  audio.setEngine = function setEngine(speed, inCar) {
    if (!audio.ready) return;
    try {
      const target = inCar ? Math.min(0.12, 0.03 + Math.abs(speed) * 0.003) : 0;
      audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
      const freq = 55 + Math.abs(speed) * 3.2;
      audio.engineOsc.frequency.setTargetAtTime(freq, audio.ctx.currentTime, 0.1);
      audio.engineOsc2.frequency.setTargetAtTime(freq * 1.01, audio.ctx.currentTime, 0.1);
    } catch (e) {}
  };

  /** The two-tone siren while any wanted stars are showing. */
  audio.setSiren = function setSiren(wanted) {
    if (!audio.ready) return;
    try {
      audio.sirenTimer += 1 / 60;
      const high = Math.floor(audio.sirenTimer * 2.2) % 2 === 0;
      audio.sirenOsc.frequency.setTargetAtTime(high ? 720 : 540, audio.ctx.currentTime, 0.05);
      audio.sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.035 : 0, audio.ctx.currentTime, 0.2);
    } catch (e) {}
  };

  /** One gunshot: a short burst of noise through a falling low-pass. */
  audio.shot = function shot() {
    if (!audio.ready) return;
    try {
      const ctx = audio.ctx;
      const dur = 0.14;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.master);
      src.start();
    } catch (e) {}
  };

  /** Two-note cash pickup chime. */
  audio.pickup = function pickup() {
    if (!audio.ready) return;
    blip(audio, 880, 0.09, 0.18);
    setTimeout(() => blip(audio, 1318, 0.12, 0.18), 70);
  };

  /** Mission complete: a short rising arpeggio. */
  audio.jingle = function jingle() {
    if (!audio.ready) return;
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => blip(audio, freq, 0.16, 0.2), i * 90);
    });
  };

  /** A dull thud when you are hurt. */
  audio.thud = function thud() {
    if (!audio.ready) return;
    blip(audio, 110, 0.18, 0.3, 'triangle');
  };

  /** The car horn: two square-wave blasts, a fourth apart. */
  audio.horn = function horn() {
    if (!audio.ready) return;
    blip(audio, 370, 0.16, 0.25, 'square');
    setTimeout(() => blip(audio, 466, 0.16, 0.25, 'square'), 30);
  };

  /** UI click. */
  audio.click = function click() {
    if (!audio.ready) return;
    blip(audio, 660, 0.05, 0.15);
  };

  /** Mute or unmute everything. */
  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.master) {
      try {
        audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
      } catch (e) {}
    }
  };

  return audio;
}

/** One sine (or triangle) blip: the building block of every chime. */
function blip(audio, freq, dur, vol, type) {
  try {
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}
