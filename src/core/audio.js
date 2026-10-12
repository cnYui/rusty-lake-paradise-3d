// Procedural WebAudio: ambiences (lake / forest / interior / temple / memory), sparse
// piano + low strings music (intro / plague / ending) and short synthesized sound effects.
// Everything is generated at runtime — no audio files.
//
// audio.init() must run inside a user gesture (main.js calls audio.unlock() on the first
// pointer/key event). Before init every call is a silent no-op, but the wanted ambience/music
// is remembered and starts as soon as the context exists.
import { storage } from './state.js';

let ac = null;
let master = null, comp = null, busAmb = null, busMusic = null, busSfx = null, reverb = null, reverbIn = null;
const noiseBuf = {};
let volume = 0.8;
let muted = false;
let wantAmb = 'none', wantMusic = 'none';
let amb = null;      // { name, out, stop(t), tick?(now) }
let music = null;    // sequencer state
let boundEngine = null;
const warned = new Set();

try {
  const s = JSON.parse(storage.get('rlp3d.settings') || '{}');
  if (typeof s.volume === 'number') volume = Math.max(0, Math.min(1, s.volume));
  if (typeof s.muted === 'boolean') muted = s.muted;
} catch { /* ignore */ }

function saveSettings() {
  storage.set('rlp3d.settings', JSON.stringify({ volume, muted }));
}

// ------------------------------------------------------------------------ building blocks
function makeNoise(kind, seconds) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.6;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else { // brown
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  }
  // smooth loop seam
  const fade = Math.min(2000, len >> 3);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

function makeImpulse(seconds = 2.8, decay = 2.6) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; // gentle lowpass → darker tail
      d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return buf;
}

const G = (v = 1) => { const g = ac.createGain(); g.gain.value = v; return g; };
const F = (type, freq, Q = 0.7) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; };
const O = (type, freq) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; return o; };
function N(kind = 'white', loop = false) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuf[kind];
  s.loop = loop;
  return s;
}
function startNoise(src, t, dur) {
  const off = Math.random() * Math.max(0, src.buffer.duration - (dur || 0) - 0.05);
  src.start(t, off);
  if (dur) src.stop(t + dur + 0.05);
}
function pan(v) {
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = v; return p; }
  return G(1);
}
/** Route a node to a bus with optional pan and reverb send. */
function route(node, bus, { p = 0, rev = 0 } = {}) {
  const pn = pan(p);
  node.connect(pn);
  pn.connect(bus);
  if (rev > 0) { const s = G(rev); pn.connect(s); s.connect(reverbIn); }
  return pn;
}
/** Simple attack / exponential decay envelope on a gain param. */
function env(param, t, attack, peak, decay, floor = 0.0001) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(floor, t + attack + decay);
}
function sweep(param, t, from, to, dur, exp = true) {
  param.setValueAtTime(from, t);
  if (exp) param.exponentialRampToValueAtTime(Math.max(1e-4, to), t + dur);
  else param.linearRampToValueAtTime(to, t + dur);
}

// one-shot primitives ---------------------------------------------------------------
function tone(t, { type = 'sine', f0 = 440, f1 = null, dur = 0.3, attack = 0.005, peak = 0.1, p = 0, rev = 0, filter = null, bus = busSfx } = {}) {
  const o = O(type, f0);
  if (f1) sweep(o.frequency, t, f0, f1, dur);
  const g = G(0);
  env(g.gain, t, attack, peak, dur);
  let n = o;
  if (filter) { const fl = F(filter[0], filter[1], filter[2] || 0.7); o.connect(fl); n = fl; }
  n.connect(g);
  route(g, bus, { p, rev });
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return o;
}
function hiss(t, { kind = 'white', dur = 0.2, attack = 0.005, peak = 0.1, type = 'bandpass', f0 = 1000, f1 = null, Q = 1, p = 0, rev = 0, bus = busSfx } = {}) {
  const s = N(kind);
  const fl = F(type, f0, Q);
  if (f1) sweep(fl.frequency, t, f0, f1, dur);
  const g = G(0);
  env(g.gain, t, attack, peak, dur);
  s.connect(fl); fl.connect(g);
  route(g, bus, { p, rev });
  startNoise(s, t, attack + dur);
  return { s, fl, g };
}
function thump(t, { f0 = 130, f1 = 50, dur = 0.18, peak = 0.35, p = 0 } = {}) {
  tone(t, { f0, f1, dur, attack: 0.004, peak, p });
  hiss(t, { kind: 'brown', type: 'lowpass', f0: 500, dur: dur * 0.8, peak: peak * 0.6, p });
}
function click(t, { f = 3000, peak = 0.12, p = 0 } = {}) {
  hiss(t, { type: 'bandpass', f0: f, Q: 2.5, dur: 0.012, attack: 0.001, peak, p });
}
function creak(t, { dur = 0.8, f0 = 700, f1 = 1250, base = 26, peak = 0.11, p = 0 } = {}) {
  const o = O('sawtooth', base);
  sweep(o.frequency, t, base, base * 1.35, dur, false);
  const bp = F('bandpass', f0, 9);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.linearRampToValueAtTime(f1, t + dur * 0.55);
  bp.frequency.linearRampToValueAtTime((f0 + f1) / 2, t + dur);
  const g = G(0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.06);
  for (let i = 1; i < 8; i++) g.gain.linearRampToValueAtTime(peak * (0.55 + Math.random() * 0.45), t + (dur * i) / 8);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
  o.connect(bp); bp.connect(g);
  route(g, busSfx, { p, rev: 0.15 });
  o.start(t); o.stop(t + dur + 0.1);
}

// --------------------------------------------------------------------------- SFX table
const SFX = {
  click(t) { click(t, { f: 2600, peak: 0.08 }); tone(t, { f0: 1800, dur: 0.025, peak: 0.025 }); },
  pickup(t) {
    hiss(t, { type: 'bandpass', f0: 1200, f1: 3200, dur: 0.18, peak: 0.04, Q: 0.8 });
    tone(t + 0.02, { f0: 784, dur: 0.45, peak: 0.07, rev: 0.3 });
    tone(t + 0.11, { f0: 1175, dur: 0.6, peak: 0.06, rev: 0.35 });
  },
  cut(t) {
    hiss(t, { type: 'bandpass', f0: 700, f1: 3400, dur: 0.17, attack: 0.03, peak: 0.16, Q: 1.2 });
    thump(t + 0.16, { f0: 150, f1: 60, dur: 0.14, peak: 0.3 });
    hiss(t + 0.16, { type: 'highpass', f0: 1600, dur: 0.05, peak: 0.18 });
  },
  chop(t) {
    hiss(t, { type: 'bandpass', f0: 900, f1: 2600, dur: 0.1, attack: 0.02, peak: 0.1 });
    thump(t + 0.09, { f0: 120, f1: 45, dur: 0.16, peak: 0.38 });
    hiss(t + 0.1, { type: 'bandpass', f0: 380, f1: 1300, Q: 2, dur: 0.12, peak: 0.16 });
  },
  splash(t) {
    hiss(t, { type: 'lowpass', f0: 3800, f1: 450, dur: 0.7, attack: 0.01, peak: 0.28, Q: 0.6 });
    for (let i = 0; i < 5; i++) tone(t + 0.05 + Math.random() * 0.4, { f0: 900 + Math.random() * 800, f1: 1800 + Math.random() * 600, dur: 0.05, peak: 0.03, p: Math.random() - 0.5 });
  },
  reel(t) {
    let x = 0;
    for (let i = 0; i < 16; i++) { click(t + x, { f: 3400, peak: 0.09 }); x += 0.075 - i * 0.0026; }
  },
  cast(t) {
    hiss(t, { type: 'bandpass', f0: 2600, f1: 500, dur: 0.5, attack: 0.04, peak: 0.2, Q: 1.4, p: -0.3 });
    tone(t + 0.05, { type: 'sawtooth', f0: 900, f1: 280, dur: 0.35, peak: 0.018, filter: ['lowpass', 1600] });
  },
  door(t) { creak(t, { dur: 0.55, f0: 600, f1: 1000 }); thump(t + 0.55, { f0: 95, f1: 48, dur: 0.25, peak: 0.3 }); },
  creak(t) { creak(t, { dur: 0.9 }); },
  gate(t) {
    click(t, { f: 3200, peak: 0.1 }); tone(t, { f0: 1200, dur: 0.06, peak: 0.03 });
    creak(t + 0.08, { dur: 1.5, f0: 420, f1: 820, base: 22, peak: 0.12 });
    thump(t + 1.6, { f0: 85, f1: 42, dur: 0.3, peak: 0.28 });
  },
  bell(t) {
    const base = 520;
    [[1, 0.12, 2.6], [2.76, 0.05, 1.8], [5.4, 0.03, 1.1], [8.93, 0.015, 0.7]].forEach(([r, a, d]) => tone(t, { f0: base * r, dur: d, peak: a, rev: 0.6 }));
  },
  drink(t) {
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.55;
      tone(s, { f0: 270, f1: 140, dur: 0.17, attack: 0.02, peak: 0.16, filter: ['lowpass', 900] });
      hiss(s, { kind: 'pink', type: 'lowpass', f0: 600, dur: 0.1, peak: 0.06 });
    }
  },
  pour(t) {
    const { fl, g } = hiss(t, { kind: 'pink', type: 'bandpass', f0: 700, Q: 4, dur: 1.7, attack: 0.12, peak: 0.16 });
    for (let i = 0; i < 24; i++) fl.frequency.setValueAtTime(480 + Math.random() * 700, t + (i / 24) * 1.6);
    void g;
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 500, dur: 1.6, attack: 0.15, peak: 0.08 });
  },
  squish(t) {
    hiss(t, { kind: 'pink', type: 'lowpass', f0: 300, f1: 1500, dur: 0.22, attack: 0.02, peak: 0.28 });
    tone(t, { f0: 180, f1: 90, dur: 0.2, peak: 0.12 });
  },
  juicer(t) {
    for (let i = 0; i < 5; i++) hiss(t + i * 0.035, { type: 'bandpass', f0: 1800 + Math.random() * 800, Q: 3, dur: 0.02, peak: 0.12 });
    SFX.squish(t + 0.12);
    tone(t + 0.45, { f0: 700, f1: 1000, dur: 0.06, peak: 0.05 });
  },
  wing(t) {
    hiss(t, { type: 'bandpass', f0: 380, f1: 950, dur: 0.32, attack: 0.05, peak: 0.18, Q: 1 });
    creak(t + 0.05, { dur: 0.3, f0: 500, f1: 800, peak: 0.06 });
    tone(t + 0.32, { f0: 230, f1: 120, dur: 0.08, peak: 0.16 });
  },
  screw(t) {
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.16;
      const o = tone(s, { type: 'triangle', f0: 1350 + i * 60, f1: 1500, dur: 0.11, attack: 0.02, peak: 0.035 });
      void o;
      click(s + 0.1, { f: 4200, peak: 0.06 });
    }
  },
  nail(t) {
    tone(t, { type: 'triangle', f0: 900, f1: 1650, dur: 0.3, attack: 0.03, peak: 0.045 });
    creak(t, { dur: 0.28, f0: 1400, f1: 2100, base: 40, peak: 0.05 });
    hiss(t + 0.32, { type: 'highpass', f0: 2000, dur: 0.015, peak: 0.16 });
    tone(t + 0.32, { f0: 420, f1: 150, dur: 0.07, peak: 0.18 });
  },
  lid(t) {
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 420, dur: 0.9, attack: 0.08, peak: 0.25 });
    const { g } = hiss(t, { type: 'bandpass', f0: 1100, Q: 2, dur: 0.85, attack: 0.05, peak: 0.07 });
    for (let i = 0; i < 12; i++) g.gain.setValueAtTime(0.02 + Math.random() * 0.06, t + 0.05 + i * 0.065);
    thump(t + 0.9, { f0: 90, f1: 45, dur: 0.28, peak: 0.3 });
  },
  page(t) {
    const { g } = hiss(t, { type: 'highpass', f0: 2200, dur: 0.28, attack: 0.01, peak: 0.1, Q: 0.5 });
    for (let i = 0; i < 9; i++) g.gain.setValueAtTime(0.02 + Math.random() * 0.09, t + i * 0.028);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  },
  achievement(t) {
    const { g } = hiss(t, { type: 'bandpass', f0: 3200, Q: 1.2, dur: 0.5, attack: 0.02, peak: 0.05 });
    for (let i = 0; i < 14; i++) g.gain.setValueAtTime(0.01 + Math.random() * 0.06, t + i * 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    tone(t + 0.15, { f0: 988, dur: 1.1, peak: 0.06, rev: 0.5 });
    tone(t + 0.3, { f0: 1319, dur: 1.4, peak: 0.055, rev: 0.5 });
  },
  stinger(t) {
    [65.4, 69.3, 98].forEach((f, i) => tone(t, { type: 'sawtooth', f0: f, dur: 2.6, attack: 0.05, peak: 0.07, filter: ['lowpass', 700], rev: 0.45, p: (i - 1) * 0.3 }));
    tone(t, { f0: 58, f1: 34, dur: 1.4, peak: 0.4 });
  },
  wrong(t) {
    tone(t, { type: 'triangle', f0: 185, dur: 0.09, peak: 0.12, filter: ['lowpass', 900] });
    tone(t + 0.1, { type: 'triangle', f0: 139, dur: 0.14, peak: 0.12, filter: ['lowpass', 900] });
  },
  combine(t) {
    click(t, { f: 2200, peak: 0.08 });
    tone(t + 0.03, { f0: 660, dur: 0.22, peak: 0.06, rev: 0.25 });
    tone(t + 0.13, { f0: 990, dur: 0.35, peak: 0.06, rev: 0.3 });
  },
  unlock(t) {
    click(t, { f: 2800, peak: 0.12 });
    tone(t, { f0: 1800, dur: 0.04, peak: 0.04 });
    click(t + 0.18, { f: 2400, peak: 0.14 });
    tone(t + 0.2, { f0: 320, f1: 150, dur: 0.1, peak: 0.15 });
  },
  bolt(t) {
    const { g } = hiss(t, { type: 'bandpass', f0: 2400, Q: 3, dur: 0.36, attack: 0.03, peak: 0.08 });
    for (let i = 0; i < 8; i++) g.gain.setValueAtTime(0.03 + Math.random() * 0.06, t + 0.03 + i * 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    tone(t + 0.36, { f0: 210, f1: 90, dur: 0.12, peak: 0.22 });
    hiss(t + 0.36, { type: 'highpass', f0: 2500, dur: 0.02, peak: 0.12 });
  },
  goat(t) {
    const o = O('sawtooth', 450);
    sweep(o.frequency, t, 460, 370, 0.8, false);
    const lfo = O('sine', 9);
    const lg = G(22);
    lfo.connect(lg); lg.connect(o.frequency);
    const trem = G(1);
    const tl = O('sine', 9);
    const tg = G(0.45);
    tl.connect(tg); tg.connect(trem.gain);
    const f1 = F('bandpass', 820, 4), f2 = F('bandpass', 1650, 6);
    const g = G(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.06);
    g.gain.setValueAtTime(0.13, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(trem); trem.connect(f1); trem.connect(f2); f1.connect(g); f2.connect(g);
    route(g, busSfx, { rev: 0.2 });
    [o, lfo, tl].forEach((n) => { n.start(t); n.stop(t + 0.9); });
  },
  heartbeat(t) { thump(t, { f0: 62, f1: 38, dur: 0.16, peak: 0.5 }); thump(t + 0.28, { f0: 58, f1: 36, dur: 0.2, peak: 0.42 }); },
  whoosh(t) {
    const { fl } = hiss(t, { type: 'bandpass', f0: 300, Q: 1.1, dur: 0.75, attack: 0.25, peak: 0.2 });
    fl.frequency.setValueAtTime(300, t);
    fl.frequency.exponentialRampToValueAtTime(2100, t + 0.35);
    fl.frequency.exponentialRampToValueAtTime(500, t + 0.75);
  },
  hum(t) {
    [110, 165, 220].forEach((f, i) => {
      const o = O(i === 1 ? 'triangle' : 'sine', f);
      const g = G(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06 / (i + 1), t + 0.45);
      g.gain.setValueAtTime(0.06 / (i + 1), t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g); route(g, busSfx, { rev: 0.4 });
      o.start(t); o.stop(t + 1.9);
    });
  },
  holy(t) {
    [523.3, 659.3, 784, 1046.5, 1568].forEach((f, i) => {
      for (const det of [-5, 5]) {
        const o = O(i % 2 ? 'triangle' : 'sine', f);
        o.detune.value = det;
        const g = G(0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.022, t + 0.7 + i * 0.1);
        g.gain.setValueAtTime(0.022, t + 2.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
        o.connect(g); route(g, busSfx, { rev: 0.8, p: det / 12 });
        o.start(t); o.stop(t + 4.3);
      }
    });
    hiss(t, { type: 'highpass', f0: 6500, dur: 3.2, attack: 0.8, peak: 0.03, rev: 0.6 });
  },
  flicker(t) {
    for (let x = 0; x < 1.0; x += 1 / 22) click(t + x, { f: 1800 + Math.random() * 2000, peak: 0.03 + Math.random() * 0.05 });
    for (let i = 0; i < 10; i++) hiss(t + Math.random(), { type: 'highpass', f0: 3000, dur: 0.008, peak: 0.08 });
    tone(t, { type: 'sawtooth', f0: 60, dur: 1.0, attack: 0.05, peak: 0.012, filter: ['lowpass', 300] });
  },
  bubble(t) {
    [0, 0.13, 0.31].forEach((d) => tone(t + d, { f0: 170 + Math.random() * 60, f1: 480 + Math.random() * 200, dur: 0.07, attack: 0.008, peak: 0.12 }));
  },
  rustle(t) {
    const { g } = hiss(t, { kind: 'pink', type: 'bandpass', f0: 2600, Q: 0.7, dur: 0.6, attack: 0.03, peak: 0.12 });
    for (let i = 0; i < 14; i++) g.gain.setValueAtTime(0.02 + Math.random() * 0.12, t + i * 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  },
  hatch(t) {
    hiss(t, { type: 'bandpass', f0: 600, f1: 1150, Q: 1.5, dur: 0.3, attack: 0.03, peak: 0.15 });
    tone(t + 0.3, { f0: 260, f1: 130, dur: 0.07, peak: 0.16 });
    click(t + 0.3, { f: 1500, peak: 0.08 });
  },

  // ------------------------------------------------------------------ 第二灾（蛙灾）
  // 青蛙“呱”：喉囊鼓起时一声带颤音的 guā（锯齿波按 ~32 Hz 方波斩成声门脉冲串，两个共振峰从 u 滑到 a）+ 喉囊低频共鸣。
  frog_croak(t) {
    const D = 0.42;
    const o = O('sawtooth', 115);
    o.frequency.setValueAtTime(115, t);
    o.frequency.linearRampToValueAtTime(140, t + 0.12);
    o.frequency.linearRampToValueAtTime(104, t + D);
    const am = G(0.5);
    const lfo = O('square', 29 + Math.random() * 6);
    const lg = G(0.5);
    lfo.connect(lg); lg.connect(am.gain);
    const fa = F('bandpass', 380, 3.5), fb = F('bandpass', 800, 4.5), lp = F('lowpass', 2400, 0.7);
    fa.frequency.setValueAtTime(380, t); fa.frequency.linearRampToValueAtTime(760, t + 0.1);
    fb.frequency.setValueAtTime(800, t); fb.frequency.linearRampToValueAtTime(1250, t + 0.1);
    const g = G(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.17, t + 0.02);
    g.gain.setValueAtTime(0.17, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    o.connect(am); am.connect(fa); am.connect(fb); fa.connect(lp); fb.connect(lp); lp.connect(g);
    route(g, busSfx, { rev: 0.15 });
    [o, lfo].forEach((n) => { n.start(t); n.stop(t + D + 0.05); });
    tone(t, { f0: 92, f1: 78, dur: 0.5, attack: 0.04, peak: 0.08 });
  },
  // 青蛙起跳：后腿一蹬 + 很短的上扬“嘣”。
  frog_hop(t) {
    hiss(t, { kind: 'pink', type: 'lowpass', f0: 700, dur: 0.06, attack: 0.002, peak: 0.18 });
    tone(t, { type: 'triangle', f0: 260, f1: 560, dur: 0.12, attack: 0.004, peak: 0.16 });
    hiss(t + 0.01, { type: 'bandpass', f0: 500, f1: 1700, Q: 1.2, dur: 0.14, attack: 0.015, peak: 0.12 });
  },
  // 落到睡莲叶上：叶面“啪”一下 + 轻轻的水花和几滴水珠。
  lily_splash(t) {
    tone(t, { f0: 210, f1: 110, dur: 0.07, attack: 0.003, peak: 0.14, filter: ['lowpass', 800] });
    hiss(t, { kind: 'pink', type: 'lowpass', f0: 2600, f1: 500, Q: 0.6, dur: 0.4, attack: 0.006, peak: 0.16 });
    for (let i = 0; i < 3; i++) tone(t + 0.04 + Math.random() * 0.22, { f0: 800 + Math.random() * 500, f1: 1500 + Math.random() * 500, dur: 0.045, peak: 0.025, p: Math.random() * 0.6 - 0.3 });
  },
  // 叶子下沉：低沉的水声往下压，“咕噜”气泡越来越低、越来越稀。
  lily_sink(t) {
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 900, f1: 180, dur: 1.2, attack: 0.15, peak: 0.16 });
    let x = 0.08;
    for (let i = 0; i < 7; i++) {
      const f = 340 - i * 28 + Math.random() * 40;
      tone(t + x, { f0: f, f1: f * 2.4, dur: 0.06, attack: 0.006, peak: 0.07 - i * 0.006, p: Math.random() * 0.4 - 0.2 });
      x += 0.07 + i * 0.025 + Math.random() * 0.04;
    }
  },
  // 蛙卵沉下：黏糊糊的“咕嘟”往下沉 + 几个气泡。
  spawn_sink(t) {
    tone(t, { f0: 240, f1: 80, dur: 0.45, attack: 0.03, peak: 0.12, filter: ['lowpass', 600] });
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 600, f1: 150, dur: 0.9, attack: 0.08, peak: 0.12 });
    [0.12, 0.3, 0.55].forEach((d, i) => tone(t + d, { f0: 260 - i * 40, f1: 560 - i * 70, dur: 0.06, attack: 0.008, peak: 0.06 - i * 0.012 }));
  },
  // 蛙卵（或水下的青蛙）浮上来：水声往上涌，气泡越来越密，最后冒出水面“啵”。
  spawn_rise(t) {
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 160, f1: 700, dur: 0.8, attack: 0.3, peak: 0.1 });
    [0.15, 0.32, 0.46, 0.57].forEach((d, i) => tone(t + d, { f0: 200 + i * 50, f1: 480 + i * 110, dur: 0.05, attack: 0.006, peak: 0.035 + i * 0.008 }));
    tone(t + 0.7, { f0: 380, f1: 900, dur: 0.06, attack: 0.004, peak: 0.07 });
    hiss(t + 0.7, { kind: 'pink', type: 'bandpass', f0: 1500, Q: 1, dur: 0.15, attack: 0.005, peak: 0.05 });
  },
  // 青蛙掉进汤锅“噗通”：闷响 + 上扬的气泡共振 + 汤花。
  pot_drop(t) {
    thump(t, { f0: 150, f1: 55, dur: 0.22, peak: 0.24 });
    tone(t + 0.02, { f0: 180, f1: 620, dur: 0.09, attack: 0.004, peak: 0.16 });
    hiss(t + 0.01, { kind: 'pink', type: 'lowpass', f0: 2400, f1: 400, dur: 0.55, attack: 0.008, peak: 0.16 });
    for (let i = 0; i < 4; i++) tone(t + 0.12 + Math.random() * 0.35, { f0: 260 + Math.random() * 200, f1: 600 + Math.random() * 300, dur: 0.05, attack: 0.006, peak: 0.04 });
  },
  // 锅口放射白光：一组嗡鸣慢慢上扬五度，带高频闪烁，约 3.6 秒。
  pot_glow(t) {
    const D = 3.6;
    [[220, 0.03, 'sine'], [330, 0.022, 'triangle'], [440, 0.02, 'sine'], [660, 0.012, 'sine'], [880, 0.008, 'sine']].forEach(([f, a, type]) => {
      for (const det of [-6, 6]) {
        const o = O(type, f);
        o.detune.value = det;
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 1.6);
        const g = G(0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(a, t + 0.9);
        g.gain.setValueAtTime(a, t + 2.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + D);
        o.connect(g); route(g, busSfx, { rev: 0.6, p: det / 15 });
        o.start(t); o.stop(t + D + 0.1);
      }
    });
    const { g } = hiss(t + 0.3, { type: 'highpass', f0: 5000, dur: 2.6, attack: 0.9, peak: 0.035, rev: 0.5 });
    for (let i = 0; i < 30; i++) g.gain.setValueAtTime(0.008 + Math.random() * 0.03, t + 1.2 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + D);
  },
  // 蜡烛点着木柴“呼”：气流升起的轰声 + 几下噼啪。
  fire_light(t) {
    const { fl } = hiss(t, { kind: 'pink', type: 'bandpass', f0: 250, Q: 0.6, dur: 1.0, attack: 0.15, peak: 0.42 });
    fl.frequency.setValueAtTime(250, t);
    fl.frequency.exponentialRampToValueAtTime(1600, t + 0.2);
    fl.frequency.exponentialRampToValueAtTime(450, t + 1.0);
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 300, dur: 0.8, attack: 0.1, peak: 0.2 });
    click(t, { f: 4200, peak: 0.08 });
    for (let i = 0; i < 6; i++) click(t + 0.25 + Math.random() * 0.6, { f: 1800 + Math.random() * 2500, peak: 0.05 + Math.random() * 0.06 });
  },
  // 柴火噼啪：一段 2.6 秒、首尾带淡入淡出的燃烧声。要持续燃烧就每 ~2.2 秒再调一次（首尾交叉淡化，听不出接缝）。
  fire_crackle(t) {
    const D = 2.6;
    const s = N('pink');
    const lp = F('lowpass', 420, 0.6);
    const g = G(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.065, t + 0.35);
    g.gain.setValueAtTime(0.065, t + D - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + D);
    s.connect(lp); lp.connect(g); route(g, busSfx, { rev: 0.1 });
    startNoise(s, t, D);
    let x = 0.1 + Math.random() * 0.08;
    while (x < D - 0.45) {
      const k = Math.random();
      click(t + x, { f: 1500 + Math.random() * 3500, peak: 0.06 + k * 0.14, p: Math.random() * 0.6 - 0.3 });
      if (k > 0.8) tone(t + x, { f0: 300 + Math.random() * 200, f1: 120, dur: 0.03, attack: 0.002, peak: 0.08 });
      x += 0.04 + Math.random() * Math.random() * 0.35;
    }
  },
  // 吞咽“咕咚”：舌根一响 + 下滑的喉音 + 闷响。
  gulp(t) {
    click(t, { f: 1400, peak: 0.07 });
    tone(t + 0.02, { f0: 420, f1: 150, dur: 0.12, attack: 0.008, peak: 0.16, filter: ['lowpass', 1000] });
    thump(t + 0.06, { f0: 140, f1: 60, dur: 0.14, peak: 0.16 });
    hiss(t + 0.03, { kind: 'pink', type: 'lowpass', f0: 500, dur: 0.12, peak: 0.06 });
  },
  // 倒汤（比第一灾的 pour 更稠更低，带“咕嘟”声），约 1.5 秒。
  soup_pour(t) {
    const D = 1.5;
    const a = hiss(t, { kind: 'pink', type: 'bandpass', f0: 500, Q: 3, dur: D, attack: 0.1, peak: 0.2 });
    a.g.gain.cancelScheduledValues(t);
    a.g.gain.setValueAtTime(0.0001, t);
    a.g.gain.linearRampToValueAtTime(0.2, t + 0.1);
    a.g.gain.setValueAtTime(0.2, t + D - 0.35);
    a.g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    for (let i = 0; i < 18; i++) a.fl.frequency.setValueAtTime(320 + Math.random() * 450, t + (i / 18) * D);
    hiss(t, { kind: 'brown', type: 'lowpass', f0: 380, dur: D, attack: 0.15, peak: 0.1 });
    for (let x = 0.1; x < D - 0.25; x += 0.16 + Math.random() * 0.1) tone(t + x, { f0: 150 + Math.random() * 60, f1: 330 + Math.random() * 120, dur: 0.07, attack: 0.01, peak: 0.07, filter: ['lowpass', 900] });
  },
  // 呕吐：先一声干呕“呃”，然后一股液体冲进碗里（约 1.7 秒）。
  vomit(t) {
    const o = O('sawtooth', 95);
    sweep(o.frequency, t, 95, 140, 0.35, false);
    const bp = F('bandpass', 600, 2.5), g = G(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(bp); bp.connect(g); route(g, busSfx, { rev: 0.1 });
    o.start(t); o.stop(t + 0.45);
    hiss(t, { kind: 'pink', type: 'bandpass', f0: 700, Q: 1.5, dur: 0.35, attack: 0.06, peak: 0.08 });
    const s = t + 0.38, D = 1.3;
    const a = hiss(s, { kind: 'pink', type: 'bandpass', f0: 800, Q: 2, dur: D, attack: 0.04, peak: 0.2 });
    a.g.gain.cancelScheduledValues(s);
    a.g.gain.setValueAtTime(0.0001, s);
    a.g.gain.linearRampToValueAtTime(0.2, s + 0.04);
    a.g.gain.setValueAtTime(0.2, s + D * 0.55);
    a.g.gain.exponentialRampToValueAtTime(0.0001, s + D);
    for (let i = 0; i < 20; i++) a.fl.frequency.setValueAtTime(450 + Math.random() * 900, s + (i / 20) * D);
    hiss(s, { kind: 'brown', type: 'lowpass', f0: 600, dur: D, attack: 0.03, peak: 0.16 });
    thump(s, { f0: 120, f1: 60, dur: 0.12, peak: 0.12 });
    for (let x = 0.2; x < D; x += 0.12 + Math.random() * 0.12) tone(s + x, { f0: 180 + Math.random() * 120, f1: 450 + Math.random() * 200, dur: 0.05, attack: 0.006, peak: 0.04 });
  },
  // 蛙笛的一个乐句（竖笛音色：三角波 + 少量二次泛音 + 气声，起音带一点“噗”，颤音慢慢加深）。
  // 每次调用轮换下一句（D 多利亚，4–6 个音，1.6–2 秒），连着吹像一段小曲。
  flute_phrase: (() => {
    const PHRASES = [
      [[74, 0.3], [77, 0.3], [81, 0.45], [79, 0.25], [77, 0.7]],
      [[76, 0.25], [77, 0.25], [79, 0.3], [81, 0.3], [79, 0.25], [74, 0.75]],
      [[81, 0.35], [84, 0.3], [83, 0.3], [79, 0.3], [81, 0.8]],
      [[77, 0.3], [76, 0.3], [74, 0.3], [72, 0.3], [74, 0.9]],
    ];
    const note = (s, m, d) => {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const len = d * 0.92;
      const o = O('triangle', f), o2 = O('sine', f * 2);
      const vib = O('sine', 5.2), vg = G(0);
      vg.gain.setValueAtTime(0, s);
      vg.gain.linearRampToValueAtTime(f * 0.006, s + Math.min(0.35, len));
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      const lp = F('lowpass', f * 3, 0.5), g2 = G(0.12), g = G(0);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.075, s + 0.04);
      g.gain.linearRampToValueAtTime(0.06, s + len - 0.04);
      g.gain.linearRampToValueAtTime(0.0001, s + len);
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
      route(g, busSfx, { rev: 0.35 });
      [o, o2, vib].forEach((n) => { n.start(s); n.stop(s + len + 0.05); });
      hiss(s, { type: 'bandpass', f0: f * 2.5, Q: 2, dur: 0.05, attack: 0.004, peak: 0.03 });
      hiss(s, { kind: 'pink', type: 'bandpass', f0: f, Q: 6, dur: len, attack: 0.03, peak: 0.025 });
    };
    let k = 0;
    return (t) => {
      const ph = PHRASES[k++ % PHRASES.length];
      let x = 0;
      for (const [m, d] of ph) { note(t + x, m, d); x += d; }
    };
  })(),
  // 青蛙变色时的金色闪光：一阵细碎的闪烁 + 一声明亮的“叮”。
  color_change(t) {
    const { g } = hiss(t, { type: 'highpass', f0: 4500, dur: 0.6, attack: 0.05, peak: 0.05, rev: 0.4 });
    for (let i = 0; i < 12; i++) g.gain.setValueAtTime(0.015 + Math.random() * 0.045, t + 0.05 + i * 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    [[1, 0.07, 1.4], [2, 0.025, 0.9], [2.76, 0.02, 0.7], [4.07, 0.01, 0.5]].forEach(([r, a, d]) => tone(t, { f0: 1175 * r, dur: d, attack: 0.003, peak: a, rev: 0.55 }));
    tone(t + 0.07, { f0: 1760, dur: 1.1, attack: 0.004, peak: 0.04, rev: 0.55, p: 0.2 });
  },
  // 转盘锁转一格“咔哒”。
  dial_click(t) {
    click(t, { f: 2600, peak: 0.16 });
    tone(t, { type: 'triangle', f0: 1450, f1: 1100, dur: 0.035, attack: 0.001, peak: 0.05 });
    click(t + 0.03, { f: 1700, peak: 0.12 });
    tone(t + 0.03, { f0: 380, f1: 240, dur: 0.05, attack: 0.002, peak: 0.13 });
  },
  // 神殿木柜开门：门闩 + 短促的合页吱呀 + 门板轻碰。
  cabinet_open(t) {
    click(t, { f: 2200, peak: 0.14 });
    tone(t, { f0: 900, f1: 600, dur: 0.04, peak: 0.05 });
    creak(t + 0.06, { dur: 0.6, f0: 750, f1: 1250, base: 30, peak: 0.1 });
    thump(t + 0.68, { f0: 160, f1: 80, dur: 0.12, peak: 0.16 });
  },
  // 厨房小木箱打开：锁舌弹开 + 箱盖吱呀掀起 + 向后碰到。
  chest_open(t) {
    click(t, { f: 3000, peak: 0.14 });
    tone(t + 0.01, { f0: 420, f1: 200, dur: 0.06, peak: 0.12 });
    creak(t + 0.12, { dur: 0.5, f0: 900, f1: 1500, base: 34, peak: 0.1 });
    hiss(t + 0.12, { kind: 'brown', type: 'lowpass', f0: 500, dur: 0.5, attack: 0.08, peak: 0.12 });
    thump(t + 0.62, { f0: 120, f1: 55, dur: 0.2, peak: 0.24 });
  },
  // 黑方块翻转着飘起：缓慢上升的低鸣（4 Hz 起伏像在转）+ 上升的气流 + 几点微光，约 2 秒。
  cube_float(t) {
    const D = 2.0;
    [[146.8, 0.035, 'triangle'], [220, 0.025, 'sine'], [293.7, 0.013, 'sine']].forEach(([f, a, type], i) => {
      const o = O(type, f);
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.06, t + D);
      const trem = G(1);
      const l = O('sine', 4 + i * 0.7), lg = G(0.35);
      l.connect(lg); lg.connect(trem.gain);
      const g = G(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(a, t + 0.5);
      g.gain.setValueAtTime(a, t + D - 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + D);
      o.connect(trem); trem.connect(g); route(g, busSfx, { rev: 0.5, p: (i - 1) * 0.25 });
      [o, l].forEach((n) => { n.start(t); n.stop(t + D + 0.05); });
    });
    hiss(t, { kind: 'pink', type: 'bandpass', f0: 300, f1: 1500, Q: 1.5, dur: D * 0.8, attack: 0.5, peak: 0.07, rev: 0.3 });
    for (let i = 0; i < 4; i++) tone(t + 0.4 + i * 0.35 + Math.random() * 0.1, { f0: 2000 + Math.random() * 1500, dur: 0.3, attack: 0.003, peak: 0.012, rev: 0.6, p: Math.random() - 0.5 });
  },
  // 进入回忆：倒放式的吸气渐强 → 低沉的“咚” + 长长的 D 调余音。
  memory_whoosh(t) {
    const { fl } = hiss(t, { kind: 'pink', type: 'bandpass', f0: 200, Q: 1.2, dur: 0.12, attack: 1.2, peak: 0.22, rev: 0.6 });
    fl.frequency.setValueAtTime(200, t);
    fl.frequency.exponentialRampToValueAtTime(2800, t + 1.2);
    thump(t + 1.22, { f0: 70, f1: 32, dur: 0.6, peak: 0.24 });
    [[73.4, 0.05, 'triangle'], [110, 0.03, 'sine'], [587.3, 0.012, 'sine'], [880, 0.008, 'sine']].forEach(([f, a, type], i) => {
      const o = O(type, f);
      const g = G(0);
      g.gain.setValueAtTime(0.0001, t + 1.2);
      g.gain.linearRampToValueAtTime(a, t + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      o.connect(g); route(g, busSfx, { rev: 0.7, p: (i % 2 ? 0.2 : -0.2) });
      o.start(t + 1.2); o.stop(t + 3.7);
    });
  },
  // 钥匙反光：两声很高的“叮”+ 一点细碎的闪烁。
  key_glint(t) {
    tone(t, { f0: 2637, dur: 0.5, attack: 0.003, peak: 0.04, rev: 0.45, p: 0.15 });
    tone(t + 0.07, { f0: 3520, dur: 0.6, attack: 0.003, peak: 0.035, rev: 0.5, p: 0.25 });
    tone(t + 0.07, { f0: 5274, dur: 0.25, attack: 0.002, peak: 0.012, rev: 0.5 });
    const { g } = hiss(t, { type: 'highpass', f0: 6000, dur: 0.35, attack: 0.02, peak: 0.03 });
    for (let i = 0; i < 6; i++) g.gain.setValueAtTime(0.008 + Math.random() * 0.03, t + 0.02 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  },
};

// ------------------------------------------------------------------------ ambiences
function ambGraph(name) {
  const out = G(0);
  out.connect(busAmb);
  const nodes = [];
  const keep = (n) => { nodes.push(n); return n; };
  const loopNoise = (kind, filterType, freq, Q, gain, { lfo = 0, lfoDepth = 0, p = 0 } = {}) => {
    const s = keep(N(kind, true));
    const f = F(filterType, freq, Q);
    const g = G(gain);
    s.connect(f); f.connect(g);
    const pn = pan(p); g.connect(pn); pn.connect(out);
    if (lfo) {
      const o = keep(O('sine', lfo));
      const d = G(lfoDepth);
      o.connect(d); d.connect(g.gain);
      o.start();
    }
    s.start(0, Math.random() * 2);
    return { s, f, g };
  };
  let next = 0;
  let tick = null;
  if (name === 'lake') {
    loopNoise('brown', 'lowpass', 520, 0.5, 0.2, { lfo: 0.07, lfoDepth: 0.09 });
    loopNoise('pink', 'bandpass', 900, 0.6, 0.025, { lfo: 0.13, lfoDepth: 0.02, p: 0.3 });
    tick = (now) => {
      if (now < next) return;
      next = now + 1.1 + Math.random() * 2.2;
      const t = now + 0.05;
      const s = N('pink'); const f = F('bandpass', 380 + Math.random() * 220, 0.9); const g = G(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09 + Math.random() * 0.07, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      s.connect(f); f.connect(g);
      const pn = pan(Math.random() * 1.4 - 0.7); g.connect(pn); pn.connect(out);
      startNoise(s, t, 1.3);
      if (Math.random() < 0.35) {
        const o = O('sine', 600 + Math.random() * 500); const og = G(0);
        env(og.gain, t + 0.3, 0.005, 0.012, 0.06);
        o.connect(og); og.connect(out); o.start(t + 0.3); o.stop(t + 0.45);
      }
    };
  } else if (name === 'forest') {
    loopNoise('pink', 'bandpass', 1800, 0.5, 0.06, { lfo: 0.11, lfoDepth: 0.045, p: -0.2 });
    loopNoise('pink', 'bandpass', 2600, 0.6, 0.03, { lfo: 0.17, lfoDepth: 0.025, p: 0.4 });
    loopNoise('brown', 'lowpass', 280, 0.5, 0.09);
    tick = (now) => {
      if (now < next) return;
      next = now + 2.5 + Math.random() * 5;
      const t = now + 0.05;
      const p = Math.random() * 1.6 - 0.8;
      const n = 2 + ((Math.random() * 5) | 0);
      const base = 2300 + Math.random() * 1500;
      for (let i = 0; i < n; i++) {
        const s = t + i * (0.09 + Math.random() * 0.07);
        const o = O('sine', base); const g = G(0);
        o.frequency.setValueAtTime(base, s);
        o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.3), s + 0.04);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, s + 0.08);
        env(g.gain, s, 0.008, 0.012 + Math.random() * 0.012, 0.08);
        o.connect(g);
        const pn = pan(p); g.connect(pn); pn.connect(out);
        const rs = G(0.4); pn.connect(rs); rs.connect(reverbIn);
        o.start(s); o.stop(s + 0.12);
      }
    };
  } else if (name === 'interior') {
    loopNoise('brown', 'lowpass', 190, 0.5, 0.14);
    const hum = keep(O('sine', 100)); const hg = G(0.005); hum.connect(hg); hg.connect(out); hum.start();
    let tickTock = 0;
    tick = (now) => {
      if (now < next) return;
      next = (next || now) + 1.0;
      if (next < now) next = now + 1.0;
      const t = next;
      tickTock ^= 1;
      const s = N('white'); const f = F('bandpass', tickTock ? 2600 : 2100, 6); const g = G(0);
      env(g.gain, t, 0.001, 0.022, 0.03);
      s.connect(f); f.connect(g); g.connect(out);
      startNoise(s, t, 0.05);
    };
  } else if (name === 'temple') {
    [[55, 0.05], [82.6, 0.035], [110.4, 0.02], [164.6, 0.008]].forEach(([f, a], i) => {
      const o = keep(O(i ? 'sine' : 'triangle', f));
      const g = G(a);
      const l = keep(O('sine', 0.05 + i * 0.03)); const lg = G(a * 0.5);
      l.connect(lg); lg.connect(g.gain);
      o.connect(g);
      const pn = pan((i - 1.5) * 0.25); g.connect(pn); pn.connect(out);
      const rs = G(0.3); pn.connect(rs); rs.connect(reverbIn);
      o.start(); l.start();
    });
    loopNoise('pink', 'bandpass', 320, 1.2, 0.035, { lfo: 0.09, lfoDepth: 0.025 });
  } else if (name === 'memory') {
    [[73.4, 0.04, 'triangle'], [73.9, 0.035, 'triangle'], [587, 0.006, 'sine'], [110, 0.02, 'sine']].forEach(([f, a, type], i) => {
      const o = keep(O(type, f)); const g = G(a);
      if (i === 2) { const l = keep(O('sine', 5.5)); const lg = G(a * 0.8); l.connect(lg); lg.connect(g.gain); l.start(); }
      o.connect(g); g.connect(out);
      const rs = G(0.5); g.connect(rs); rs.connect(reverbIn);
      o.start();
    });
    loopNoise('brown', 'lowpass', 300, 0.5, 0.06, { lfo: 0.08, lfoDepth: 0.04 });
    tick = (now) => {
      if (now < next) return;
      next = now + 1.7;
      const t = now + 0.05;
      const o = O('sine', 60); const g = G(0);
      o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      env(g.gain, t, 0.004, 0.14, 0.17); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25);
      const o2 = O('sine', 55); const g2 = G(0);
      o2.frequency.setValueAtTime(55, t + 0.28); o2.frequency.exponentialRampToValueAtTime(36, t + 0.46);
      env(g2.gain, t + 0.28, 0.004, 0.11, 0.2); o2.connect(g2); g2.connect(out); o2.start(t + 0.28); o2.stop(t + 0.55);
    };
  }
  return {
    name, out, tick,
    stop(t) {
      for (const n of nodes) { try { n.stop(t); } catch { /* not started */ } }
      setTimeoutSafeDisconnect(out, t);
    },
  };
}

// Disconnect a graph after it faded out (audio clock; checked from the frame hook).
const disconnectQueue = [];
function setTimeoutSafeDisconnect(node, t) { disconnectQueue.push({ node, t: t + 0.2 }); }

// ---------------------------------------------------------------------------- music
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function piano(t, m, { vel = 0.6, dur = 2.5, p = 0 } = {}) {
  const f = midi(m);
  const decay = Math.max(0.9, 3.2 - (m - 48) * 0.05);
  [[1, 1], [2, 0.42], [3, 0.18], [4.02, 0.08], [5.05, 0.04]].forEach(([r, a]) => {
    const o = O('sine', f * r);
    const g = G(0);
    const pk = 0.055 * vel * a;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.006);
    g.gain.exponentialRampToValueAtTime(pk * 0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur + 0.6, decay / r + 0.4));
    o.connect(g);
    route(g, busMusic, { p, rev: 0.4 });
    o.start(t);
    o.stop(t + decay + 0.6);
  });
  hiss(t, { type: 'bandpass', f0: 2200, Q: 1, dur: 0.03, attack: 0.001, peak: 0.006 * vel, bus: busMusic, p });
}

function strings(t, notes, { dur = 6, vel = 0.5, cutoff = 900 } = {}) {
  for (const m of notes) {
    const f = midi(m);
    const lp = F('lowpass', cutoff, 0.6);
    const g = G(0);
    const pk = 0.02 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + Math.min(1.6, dur * 0.3));
    g.gain.setValueAtTime(pk, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
    const vib = O('sine', 4.8 + Math.random());
    const vg = G(4);
    vib.connect(vg);
    for (const det of [-7, 6]) {
      const o = O('sawtooth', f);
      o.detune.value = det;
      vg.connect(o.detune);
      o.connect(lp);
      o.start(t); o.stop(t + dur + 1.7);
    }
    vib.start(t); vib.stop(t + dur + 1.7);
    lp.connect(g);
    route(g, busMusic, { p: (m % 7) / 7 - 0.5, rev: 0.55 });
  }
}

// Pieces: arrays of events [beat, fn(t, beatSec)], looping every `loop` beats.
function chordArp(root, third, fifth, oct) {
  // returns piano arpeggio events for one 4-beat bar starting at beat 0
  return [[0, root - 12], [1, fifth - 12], [1.5, root], [2, third], [3, fifth]].map(([b, n]) => [b, n, oct]);
}
const PIECES = {
  intro: {
    bpm: 64, loop: 16,
    build() {
      const ev = [];
      const bars = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [45, 49, 52]]; // Dm Bb F A
      const melody = [[0, 74], [2, 72], [4, 70], [6, 69], [8, 69], [10, 72], [12, 73], [14, 76]];
      bars.forEach((c, i) => {
        for (const [b, n] of chordArp(c[0], c[1], c[2])) ev.push([i * 4 + b, (t) => piano(t, n, { vel: 0.45 + Math.random() * 0.1, dur: 2 })]);
        ev.push([i * 4, (t, bs) => strings(t, [c[0] - 12, c[2] - 12], { dur: bs * 4, vel: 0.5 })]);
      });
      for (const [b, n] of melody) ev.push([b + 0.02, (t) => piano(t, n, { vel: 0.55, dur: 2.5, p: 0.15 })]);
      return ev;
    },
  },
  plague: {
    bpm: 54, loop: 32,
    build() {
      const ev = [];
      // low drone C + G for the whole loop, swelling twice
      ev.push([0, (t, bs) => strings(t, [36, 43], { dur: bs * 15, vel: 0.7, cutoff: 600 })]);
      ev.push([16, (t, bs) => strings(t, [32, 39], { dur: bs * 15, vel: 0.7, cutoff: 600 })]);
      const mel = [[0, 75], [1.5, 74], [3, 72], [6, 67], [7, 68], [8, 67], [12, 63], [14, 62],
        [16, 68], [17.5, 67], [19, 65], [22, 63], [23, 62], [24, 60], [28, 59], [30, 55]];
      for (const [b, n] of mel) ev.push([b, (t) => piano(t, n, { vel: 0.5, dur: 3 })]);
      [[0, 48], [4, 51], [8, 44], [12, 43], [16, 41], [20, 44], [24, 43], [28, 43]].forEach(([b, n]) =>
        ev.push([b, (t) => piano(t, n, { vel: 0.4, dur: 4, p: -0.2 })]));
      ev.push([10, (t, bs) => strings(t, [63, 67], { dur: bs * 5, vel: 0.35, cutoff: 1400 })]);
      ev.push([26, (t, bs) => strings(t, [62, 65], { dur: bs * 5, vel: 0.35, cutoff: 1400 })]);
      return ev;
    },
  },
  ending: {
    bpm: 60, loop: 16,
    build() {
      const ev = [];
      const bars = [[53, 57, 60], [52, 55, 60], [50, 53, 57], [46, 50, 53]]; // F C/E Dm Bb
      bars.forEach((c, i) => {
        for (const [b, n] of chordArp(c[0], c[1], c[2])) ev.push([i * 4 + b, (t) => piano(t, n + 12, { vel: 0.35, dur: 2 })]);
        ev.push([i * 4, (t, bs) => strings(t, [c[0] - 12, c[1], c[2]], { dur: bs * 4, vel: 0.45, cutoff: 1300 })]);
      });
      [[0, 81], [3, 79], [4, 79], [7, 77], [8, 77], [11, 76], [12, 74], [14, 72]].forEach(([b, n]) =>
        ev.push([b + 0.03, (t) => piano(t, n, { vel: 0.45, dur: 2.5, p: 0.2 })]));
      return ev;
    },
  },
};

function startMusic(name) {
  const piece = PIECES[name];
  if (!piece) return null;
  const out = G(0);
  out.connect(busMusic);
  const events = piece.build().sort((a, b) => a[0] - b[0]);
  const beat = 60 / piece.bpm;
  const t0 = ac.currentTime + 0.15;
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
  return { name, out, events, beat, t0, idx: 0, loopN: 0, loop: piece.loop };
}

function tickMusic(now) {
  if (!music) return;
  const horizon = now + 0.6;
  for (;;) {
    const e = music.events[music.idx];
    const t = music.t0 + (music.loopN * music.loop + e[0]) * music.beat;
    if (t > horizon) break;
    if (t >= now - 0.05) {
      // route this event's nodes through the piece's gain by temporarily swapping the bus
      const prev = busMusic;
      busMusic = music.out;
      try { e[1](t, music.beat); } catch (err) { console.error('[audio] music event failed', err); }
      busMusic = prev;
    }
    music.idx++;
    if (music.idx >= music.events.length) { music.idx = 0; music.loopN++; }
  }
}

function frame() {
  if (!ac) return;
  const now = ac.currentTime;
  if (amb && amb.tick) { try { amb.tick(now); } catch (err) { console.error('[audio] ambience tick failed', err); } }
  tickMusic(now);
  for (let i = disconnectQueue.length - 1; i >= 0; i--) {
    if (disconnectQueue[i].t <= now) { try { disconnectQueue[i].node.disconnect(); } catch { /* ignore */ } disconnectQueue.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------- API
export const audio = {
  get ready() { return !!ac; },
  get volume() { return volume; },
  get muted() { return muted; },
  get context() { return ac; },
  get currentAmbience() { return wantAmb; },
  get currentMusic() { return wantMusic; },

  /** Hook the music/ambience scheduler into the engine's real-time frame callback. */
  bind(engine) {
    if (boundEngine) return;
    boundEngine = engine;
    engine.onFrame(frame);
  },

  init() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return true; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      ac = new Ctx();
    } catch (err) {
      console.warn('[audio] no AudioContext', err);
      ac = null;
      return false;
    }
    master = G(muted ? 0 : volume);
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ac.destination);
    busAmb = G(0.9); busAmb.connect(master);
    busMusic = G(0.55); busMusic.connect(master);
    busSfx = G(0.9); busSfx.connect(master);
    reverb = ac.createConvolver();
    noiseBuf.white = makeNoise('white', 2);
    noiseBuf.pink = makeNoise('pink', 4);
    noiseBuf.brown = makeNoise('brown', 4);
    reverb.buffer = makeImpulse();
    reverbIn = G(1);
    const rOut = G(0.35);
    reverbIn.connect(reverb); reverb.connect(rOut); rOut.connect(master);
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const a = wantAmb, m = wantMusic;
    wantAmb = 'none'; wantMusic = 'none';
    this.ambience(a);
    this.music(m);
    return true;
  },

  /** Call from any user gesture: creates / resumes the context. */
  unlock() { return this.init(); },

  ambience(name = 'none') {
    if (name === wantAmb && (amb || !ac || name === 'none')) return;
    wantAmb = name;
    if (!ac) return;
    const t = ac.currentTime;
    if (amb) {
      const old = amb;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0.0001, t + 1.6);
      old.stop(t + 1.7);
      amb = null;
    }
    if (!name || name === 'none') return;
    try {
      amb = ambGraph(name);
      amb.out.gain.setValueAtTime(0.0001, t);
      amb.out.gain.linearRampToValueAtTime(1, t + 1.8);
    } catch (err) {
      console.error('[audio] ambience failed', err);
      amb = null;
    }
  },

  music(name = 'none') {
    if (name === wantMusic && (music || !ac || name === 'none')) return;
    wantMusic = name;
    if (!ac) return;
    const t = ac.currentTime;
    if (music) {
      const old = music.out;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0.0001, t + 2.5);
      setTimeoutSafeDisconnect(old, t + 6);
      music = null;
    }
    if (!name || name === 'none') return;
    if (!PIECES[name]) { console.warn(`[audio] unknown music "${name}"`); return; }
    try { music = startMusic(name); } catch (err) { console.error('[audio] music failed', err); music = null; }
  },

  sfx(name) {
    if (!ac) return;
    const fn = SFX[name];
    if (!fn) {
      if (!warned.has(name)) { warned.add(name); console.warn(`[audio] unknown sfx "${name}"`); }
      try { SFX.click(ac.currentTime + 0.01); } catch { /* ignore */ }
      return;
    }
    try { fn(ac.currentTime + 0.01); } catch (err) { console.error(`[audio] sfx ${name} failed`, err); }
  },

  setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (master && !muted) master.gain.setTargetAtTime(volume, ac.currentTime, 0.05);
    saveSettings();
  },

  mute(on = true) {
    muted = !!on;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.05);
    saveSettings();
  },

  /** Names of every synthesized sound effect. */
  sfxNames() { return Object.keys(SFX); },
};
