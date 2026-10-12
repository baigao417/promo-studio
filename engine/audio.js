// Procedural soundtrack: electronic music + sound effects, synthesized with Web Audio.
// Rendered with OfflineAudioContext so preview and export are sample-identical.
// No third-party samples are used.

import { rng } from './core.js';

const SR = 48000;

function noiseBuffer(ctx, seconds = 2, seed = 7) {
  const r = rng(seed);
  const buf = ctx.createBuffer(1, Math.floor(SR * seconds), SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return buf;
}

function impulse(ctx, seconds = 2.8, decay = 3.2, seed = 11) {
  const r = rng(seed);
  const len = Math.floor(SR * seconds);
  const buf = ctx.createBuffer(2, len, SR);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

class Studio {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 3);
    this.master = ctx.createGain();
    this.master.gain.value = 0.62;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.32;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);
    // Music bus gets sidechain ducking from kicks.
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.duck = ctx.createGain();
    this.duck.connect(this.music);
  }

  out(node, dry = 1, wet = 0, bus = this.master) {
    if (dry > 0) {
      const g = this.ctx.createGain();
      g.gain.value = dry;
      node.connect(g);
      g.connect(bus);
    }
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g);
      g.connect(this.reverb);
    }
  }

  env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, (t * 0.37) % 2, dur + 0.05);
    return s;
  }

  // Drums -------------------------------------------------------------------
  kick(t, vel = 1) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain();
    this.env(g, t, 0.002, 1.0 * vel, 0.38);
    o.connect(g);
    o.start(t); o.stop(t + 0.5);
    this.out(g, 0.95);
    const n = this.noiseSrc(t, 0.02);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = c.createGain(); this.env(ng, t, 0.001, 0.25 * vel, 0.02);
    n.connect(hp); hp.connect(ng); this.out(ng, 1);
    // sidechain duck
    this.duck.gain.setValueAtTime(0.35, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.22);
  }

  clap(t, vel = 1) {
    const c = this.ctx;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      const n = this.noiseSrc(tt, i === 2 ? 0.2 : 0.02);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
      const g = c.createGain(); this.env(g, tt, 0.001, 0.55 * vel, i === 2 ? 0.18 : 0.012);
      n.connect(bp); bp.connect(g); this.out(g, 0.8, 0.25);
    }
  }

  hat(t, vel = 1, open = false) {
    const c = this.ctx;
    const n = this.noiseSrc(t, open ? 0.25 : 0.05);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = c.createGain(); this.env(g, t, 0.001, 0.22 * vel, open ? 0.22 : 0.045);
    n.connect(hp); hp.connect(g); this.out(g, 0.7);
  }

  snare(t, vel = 1) {
    const c = this.ctx;
    const n = this.noiseSrc(t, 0.15);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
    const g = c.createGain(); this.env(g, t, 0.001, 0.5 * vel, 0.12);
    n.connect(bp); bp.connect(g); this.out(g, 0.8, 0.15);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const og = c.createGain(); this.env(og, t, 0.001, 0.3 * vel, 0.09);
    o.connect(og); o.start(t); o.stop(t + 0.15); this.out(og, 0.7);
  }

  // Tonal -------------------------------------------------------------------
  chime(t, midi, vel = 1) {
    const c = this.ctx;
    for (const [offset, level, type] of [[0, 0.14, 'sine'], [12, 0.035, 'triangle']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = NOTE(midi + offset);
      const g = c.createGain(); this.env(g, t, 0.006, level * vel, 0.22);
      o.connect(g); o.start(t); o.stop(t + 0.3);
      this.out(g, 0.9, 0.12, this.duck);
    }
  }

  bass(t, midi, dur, vel = 1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(midi);
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = NOTE(midi - 12);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = c.createGain(); this.env(g, t, 0.004, 0.32 * vel, dur);
    o.connect(lp); o2.connect(lp); lp.connect(g);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    this.out(g, 1, 0, this.duck);
  }

  pluck(t, midi, vel = 1, bright = 1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(midi);
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = NOTE(midi) * 1.006;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(800 + 4200 * bright, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.18);
    const g = c.createGain(); this.env(g, t, 0.002, 0.11 * vel, 0.22);
    o.connect(lp); o2.connect(lp); lp.connect(g);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
    this.out(g, 1, 0.35, this.duck);
  }

  pad(t0, t1, midis, vel = 1, cutoff = 1400) {
    const c = this.ctx;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05 * vel, t0 + Math.min(0.6, (t1 - t0) / 3));
    g.gain.setValueAtTime(0.05 * vel, t1 - 0.15);
    g.gain.linearRampToValueAtTime(0, t1 + 0.4);
    lp.connect(g);
    for (const m of midis) {
      for (const det of [-9, 0, 8]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = NOTE(m); o.detune.value = det;
        o.connect(lp); o.start(t0); o.stop(t1 + 0.5);
      }
    }
    this.out(g, 1, 0.5, this.duck);
  }

  drone(t0, t1, midi, vel = 1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(midi);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = NOTE(midi - 12);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t0); lp.frequency.linearRampToValueAtTime(700, t1);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05 * vel, t0 + 1.2);
    g.gain.setValueAtTime(0.05 * vel, t1 - 0.1); g.gain.linearRampToValueAtTime(0, t1 + 0.1);
    o.connect(lp); o2.connect(lp); lp.connect(g);
    o.start(t0); o2.start(t0); o.stop(t1 + 0.2); o2.stop(t1 + 0.2);
    this.out(g, 1, 0.3, this.music);
  }

  // Sound effects ----------------------------------------------------------------
  riser(t0, t1, vel = 1) {
    const c = this.ctx;
    const n = this.noiseSrc(t0, t1 - t0);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 * vel, t1);
    g.gain.linearRampToValueAtTime(0, t1 + 0.02);
    n.connect(bp); bp.connect(g); this.out(g, 0.8, 0.3);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.08 * vel, t1);
    og.gain.linearRampToValueAtTime(0, t1 + 0.02);
    o.connect(lp); lp.connect(og); o.start(t0); o.stop(t1 + 0.05); this.out(og, 1, 0.2);
  }

  impact(t, vel = 1) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g = c.createGain(); this.env(g, t, 0.003, 1.1 * vel, 1.4);
    o.connect(g); o.start(t); o.stop(t + 1.6); this.out(g, 1, 0.2);
    const n = this.noiseSrc(t, 0.8);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    const ng = c.createGain(); this.env(ng, t, 0.001, 0.7 * vel, 0.7);
    n.connect(lp); lp.connect(ng); this.out(ng, 0.9, 0.6);
  }

  thud(t, vel = 1) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = c.createGain(); this.env(g, t, 0.002, 0.8 * vel, 0.3);
    o.connect(g); o.start(t); o.stop(t + 0.4); this.out(g, 1, 0.15);
    const n = this.noiseSrc(t, 0.08);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900;
    const ng = c.createGain(); this.env(ng, t, 0.001, 0.4 * vel, 0.07);
    n.connect(bp); bp.connect(ng); this.out(ng, 0.8, 0.2);
  }

  whoosh(t, dur = 0.5, vel = 1, up = true) {
    const c = this.ctx;
    const n = this.noiseSrc(t, dur);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(up ? 400 : 5000, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 5000 : 400, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * vel, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); this.out(g, 0.8, 0.35);
  }

  tick(t, vel = 1) {
    const c = this.ctx;
    const n = this.noiseSrc(t, 0.02);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = c.createGain(); this.env(g, t, 0.001, 0.25 * vel, 0.018);
    n.connect(hp); hp.connect(g); this.out(g, 1);
  }

  keyclick(t, vel = 1) {
    this.tick(t, 1.4 * vel);
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1800;
    const g = c.createGain(); this.env(g, t, 0.001, 0.05 * vel, 0.03);
    o.connect(g); o.start(t); o.stop(t + 0.05); this.out(g, 1);
    this.tick(t + 0.09, 0.8 * vel);
  }

  pop(t, midi = 84, vel = 1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(NOTE(midi) * 0.6, t); o.frequency.exponentialRampToValueAtTime(NOTE(midi), t + 0.04);
    const g = c.createGain(); this.env(g, t, 0.002, 0.3 * vel, 0.16);
    o.connect(g); o.start(t); o.stop(t + 0.25); this.out(g, 1, 0.3);
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = NOTE(midi + 7);
    const g2 = c.createGain(); this.env(g2, t + 0.02, 0.002, 0.12 * vel, 0.2);
    o2.connect(g2); o2.start(t); o2.stop(t + 0.3); this.out(g2, 1, 0.4);
  }

  glitchSfx(t, dur = 0.25, vel = 1, seed = 3) {
    const c = this.ctx;
    const r = rng(seed + Math.floor(t * 100));
    const n = Math.floor(dur / 0.03);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.03;
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = 200 + r() * 2400;
      const g = c.createGain(); g.gain.setValueAtTime(0.06 * vel * (r() > 0.3 ? 1 : 0), tt);
      g.gain.setValueAtTime(0, tt + 0.025);
      o.connect(g); o.start(tt); o.stop(tt + 0.03); this.out(g, 1);
    }
  }

  shutter(t, vel = 1) {
    this.tick(t, 1.6 * vel);
    this.whoosh(t + 0.02, 0.18, 0.6 * vel, false);
    this.tick(t + 0.07, 1.2 * vel);
  }
}

// Score format (from campaign timeline):
// { bpm, duration, chords: [[root, [notes]], ...] per bar,
//   parts: [{ type: 'intro'|'bright-intro'|'drop'|'roll'|'outro', start, end }],
//   sfx: [{ t, type, ...opts }] }
export function arrange(s, score) {
  const spb = 60 / score.bpm;
  const bar = spb * 4;
  const chordAt = (t) => score.chords[Math.floor(t / bar) % score.chords.length];

  for (const part of score.parts) {
    const { type, start, end } = part;
    if (type === 'bright-intro') {
      const chords = part.chords || [[72, 76, 79], [72, 77, 81], [72, 76, 79], [71, 74, 79]];
      const sequence = [0, 1, 2, 1, 0, 2, 1, 2];
      // Short upper-register notes leave room for the picture without a sub-bass bed.
      for (let i = 0; start + i * spb / 2 < end - 0.3; i++) {
        const t = start + i * spb / 2;
        const notes = chords[Math.floor((t - start) / bar) % chords.length];
        s.chime(t, notes[sequence[i % sequence.length]], i % 4 === 0 ? 0.8 : 0.55);
        if (i % 2 === 1) s.hat(t, 0.16);
      }
    }
    if (type === 'intro') {
      s.drone(start, end, 45, 1);
      // ticking clock hats, getting denser
      for (let t = start + spb; t < end - 0.01; t += spb / 2) {
        const k = (t - start) / (end - start);
        s.hat(t, 0.25 + 0.6 * k);
      }
      for (let t = start + spb * 4; t < end - 0.01; t += spb * 2) s.kick(t, 0.45);
    }
    if (type === 'drop' || type === 'roll') {
      for (let t = start; t < end - 0.01; t += spb) {
        const beat = Math.round((t - start) / spb);
        s.kick(t, 1);
        if (beat % 2 === 1) s.clap(t, 0.9);
        s.hat(t + spb / 2, 0.9, beat % 4 === 3);
        s.hat(t + spb / 4, 0.35);
        s.hat(t + (3 * spb) / 4, 0.35);
        const [root] = chordAt(t);
        s.bass(t + spb / 2, root, spb * 0.45, 1);
      }
      for (let t = start; t < end - 0.01; t += bar) {
        const [, notes] = chordAt(t);
        s.pad(t, Math.min(t + bar, end), notes, 1, type === 'roll' ? 2600 : 1600);
      }
      // 16th arp over chord tones
      const steps = Math.round((end - start) / (spb / 4));
      for (let i = 0; i < steps; i++) {
        const t = start + i * (spb / 4);
        const [, notes] = chordAt(t);
        const seq = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 24];
        const k = type === 'roll' ? (t - start) / (end - start) : 0.5;
        s.pluck(t, seq[i % 4], i % 4 === 0 ? 1 : 0.7, k);
      }
      if (type === 'roll') {
        const n = Math.round((end - start) / (spb / 4));
        for (let i = 0; i < n; i++) {
          const t = start + i * (spb / 4);
          s.snare(t, 0.2 + 0.8 * (i / n));
        }
        s.riser(start, end, 0.9);
      }
    }
    if (type === 'outro') {
      const [, notes] = chordAt(start);
      s.pad(start, end, [notes[0], notes[1], notes[2], notes[0] + 12], 1.2, 1200);
      s.drone(start, end, 45, 0.6);
      for (let i = 0; i < 6; i++) s.pluck(start + i * spb, [69, 72, 76, 81, 76, 72][i], 0.6 - i * 0.08, 0.3);
    }
  }

  for (const e of score.sfx) {
    const v = e.vel ?? 1;
    switch (e.type) {
      case 'impact': s.impact(e.t, v); break;
      case 'thud': s.thud(e.t, v); break;
      case 'whoosh': s.whoosh(e.t, e.dur ?? 0.5, v, e.up ?? true); break;
      case 'riser': s.riser(e.t, e.t + (e.dur ?? 2), v); break;
      case 'tick': s.tick(e.t, v); break;
      case 'type': for (let i = 0; i < (e.n ?? 8); i++) s.tick(e.t + i * (e.gap ?? 0.06), v * (0.6 + 0.4 * ((i * 7) % 3) / 2)); break;
      case 'key': s.keyclick(e.t, v); break;
      case 'pop': s.pop(e.t, e.midi ?? 84, v); break;
      case 'glitch': s.glitchSfx(e.t, e.dur ?? 0.25, v); break;
      case 'shutter': s.shutter(e.t, v); break;
      default: break;
    }
  }
}

export async function renderSoundtrack(score) {
  const len = Math.ceil(score.duration * SR) + SR; // 1s tail
  const ctx = new OfflineAudioContext(2, len, SR);
  const s = new Studio(ctx);
  arrange(s, score);
  const buf = await ctx.startRendering();
  // fade out the last 1.2s of the programme
  const fadeStart = Math.max(0, Math.floor((score.duration - 1.2) * SR));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = fadeStart; i < d.length; i++) {
      const k = Math.max(0, 1 - (i - fadeStart) / (1.2 * SR));
      d[i] *= k * k;
    }
  }
  // gentle tanh saturation as a limiter (raises loudness toward ~-14 LUFS), then
  // peak-normalize to -1 dBFS so nothing clips after AAC encoding
  const drive = 1.3, norm = Math.tanh(drive);
  let pre = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) pre = Math.max(pre, Math.abs(d[i]));
  }
  if (pre === 0) return buf;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh((d[i] / pre) * drive) / norm;
  }
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) {
    const g = 0.85 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buf;
}

export function encodeWav(buf, seconds) {
  const ch = buf.numberOfChannels;
  const n = Math.min(buf.length, Math.floor(seconds * buf.sampleRate));
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}

// Peak envelope for the timeline waveform display.
export function peaks(buf, buckets) {
  const d = buf.getChannelData(0);
  const size = Math.floor(d.length / buckets);
  const res = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    for (let i = b * size; i < (b + 1) * size; i += 8) m = Math.max(m, Math.abs(d[i]));
    res[b] = m;
  }
  return res;
}
