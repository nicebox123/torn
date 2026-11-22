// TORN - AudioManager. Every sound is generated in code (no sound files). All world sounds are 3D.
import * as THREE from 'three';

const SR = 22050;
function buf(ctx, seconds, fn) {
  const n = Math.max(1, Math.floor(seconds * SR));
  const b = ctx.createBuffer(1, n, SR);
  const d = b.getChannelData(0);
  fn(d, n);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < n; i++) d[i] /= peak * 1.05;
  return b;
}
const noise = () => Math.random() * 2 - 1;
function lp(d, n, f) { let y = 0; const a = Math.min(1, 2 * Math.PI * f / SR); for (let i = 0; i < n; i++) { y += a * (d[i] - y); d[i] = y; } }
function hp(d, n, f) { let y = 0, x0 = 0; const a = 1 / (1 + 2 * Math.PI * f / SR); for (let i = 0; i < n; i++) { const x = d[i]; y = a * (y + x - x0); x0 = x; d[i] = y; } }
function bp(d, n, f, q = 4) { // simple resonant band-pass (state variable)
  let low = 0, band = 0; const F = 2 * Math.sin(Math.PI * Math.min(f, SR / 6) / SR), Q = 1 / q;
  for (let i = 0; i < n; i++) { low += F * band; const high = d[i] - low - Q * band; band += F * high; d[i] = band; }
}
const env = (i, n, a, r) => { const t = i / n; return Math.min(1, t / a) * Math.pow(1 - t, r); };

const GEN = {
  slap_metal: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.005, 6) + Math.sin(i * 2 * Math.PI * (700 + Math.random() * 30) / SR) * 0.3 * env(i, n, 0.002, 3); bp(d, n, 1200 + Math.random() * 800, 3); },
  slap_dirt: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.004, 8); lp(d, n, 600 + Math.random() * 300); },
  slap_wood: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.003, 9) + Math.sin(i * 2 * Math.PI * 220 / SR) * 0.6 * env(i, n, 0.002, 6); bp(d, n, 500, 2); },
  slap_wet: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.01, 3); for (let k = 0; k < 3; k++) bp(d, n, 300 + Math.random() * 900, 6); },
  slap_bouncy: (d, n) => { for (let i = 0; i < n; i++) { const f = 120 + 300 * (1 - i / n); d[i] = Math.sin(i * 2 * Math.PI * f / SR) * env(i, n, 0.01, 2); } },
  slap_sticky: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.05, 1.5) * (0.5 + 0.5 * Math.sin(i / 90)); lp(d, n, 900); },
  thud: (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.sin(i * 2 * Math.PI * (55 - 25 * i / n) / SR) * env(i, n, 0.003, 4) + noise() * 0.3 * env(i, n, 0.002, 12); lp(d, n, 300); },
  tear: (d, n) => { for (let i = 0; i < n; i++) { const t = i / n; d[i] = noise() * env(i, n, 0.02, 1.5) * (0.6 + 0.4 * (Math.random() < 0.02 ? 3 : 1)); } bp(d, n, 900 + Math.random() * 500, 1.5); for (let i = 0; i < n; i++) d[i] += Math.sin(i * 2 * Math.PI * 70 / SR) * env(i, n, 0.001, 10) * 0.8; },
  bone: (d, n) => { for (let k = 0; k < 6; k++) { const s = Math.floor(Math.random() * n * 0.4); for (let i = s; i < Math.min(n, s + 300); i++) d[i] += noise() * Math.pow(1 - (i - s) / 300, 3); } hp(d, n, 1500); for (let i = 0; i < n; i++) d[i] += Math.sin(i * 2 * Math.PI * 90 / SR) * env(i, n, 0.001, 8) * 0.4; },
  squish: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.08, 2); bp(d, n, 250 + Math.random() * 300, 8); bp(d, n, 400, 3); },
  splat: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.003, 5); bp(d, n, 600 + Math.random() * 600, 2); },
  drip: (d, n) => { const f0 = 900 + Math.random() * 600; for (let i = 0; i < n; i++) { const t = i / n; d[i] = Math.sin(i * 2 * Math.PI * (f0 + 900 * t) / SR) * env(i, n, 0.01, 6); } },
  heartbeat: (d, n) => { for (let i = 0; i < n; i++) { const t = i / n; const a = Math.exp(-(((t - 0.1) / 0.05) ** 2)) + 0.7 * Math.exp(-(((t - 0.38) / 0.05) ** 2)); d[i] = Math.sin(i * 2 * Math.PI * 50 / SR) * a; } },
  plop: (d, n) => { for (let i = 0; i < n; i++) { const t = i / n; d[i] = Math.sin(i * 2 * Math.PI * (180 - 120 * t) / SR) * env(i, n, 0.01, 3) + noise() * 0.2 * env(i, n, 0.002, 10); } lp(d, n, 1200); },
  skull: (d, n) => { GEN.bone(d, n); for (let i = 0; i < n; i++) d[i] += noise() * 0.5 * env(i, n, 0.002, 2); lp(d, n, 4000); },
  poof: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.05, 2); bp(d, n, 2500 + Math.random() * 1500, 0.8); },
  creak: (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { ph += (40 + 30 * Math.sin(i / 2000) + Math.random() * 20) / SR; d[i] = ((ph % 1) < 0.08 ? 1 : 0) * (0.5 + Math.random() * 0.5); } bp(d, n, 700, 5); lp(d, n, 2500); },
  growl: (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / n; ph += (55 + 8 * Math.sin(t * Math.PI * 6)) / SR; d[i] = ((ph % 1) * 2 - 1) * (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 7)) + noise() * 0.4; } lp(d, n, 500); },
  roar: (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / n; ph += (90 - 40 * t + Math.random() * 20) / SR; d[i] = (((ph % 1) * 2 - 1) + noise() * 0.8) * env(i, n, 0.05, 1.2); } lp(d, n, 1400); },
  siren: (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / n; ph += (500 + 400 * Math.sin(t * Math.PI * 2)) / SR; d[i] = Math.sin(ph * 2 * Math.PI) > 0 ? 0.6 : -0.6; } lp(d, n, 2000); },
  beep: (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.sin(i * 2 * Math.PI * 880 / SR) * env(i, n, 0.02, 0.5); },
  beep_hi: (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.sin(i * 2 * Math.PI * 1320 / SR) * env(i, n, 0.02, 0.5); },
  win: (d, n) => { const notes = [523, 659, 784, 1046]; for (let i = 0; i < n; i++) { const k = Math.min(3, Math.floor(i / n * 4)); d[i] = (Math.sin(i * 2 * Math.PI * notes[k] / SR) + 0.3 * Math.sin(i * 4 * Math.PI * notes[k] / SR)) * env(i, n, 0.01, 0.6); } },
  lose: (d, n) => { const notes = [392, 349, 311, 233]; for (let i = 0; i < n; i++) { const k = Math.min(3, Math.floor(i / n * 4)); d[i] = Math.sin(i * 2 * Math.PI * notes[k] / SR) * env(i, n, 0.01, 0.8) + noise() * 0.05; } lp(d, n, 1500); },
  click: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.001, 20); bp(d, n, 3000, 2); },
  button: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.001, 12) + Math.sin(i * 2 * Math.PI * 300 / SR) * env(i, n, 0.001, 8); },
  screech: (d, n) => { let f = 2500; for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.02, 1); const k = 6; for (let j = 0; j < k; j++) bp(d, n, 2200 + Math.random() * 2500, 12); },
  snap: (d, n) => { GEN.tear(d, n); for (let i = 0; i < n; i++) d[i] *= env(i, n, 0.001, 3); },
  buzz: (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.sin(i * 2 * Math.PI * 120 / SR) > 0.3 ? 0.5 : -0.5) * (0.5 + 0.5 * Math.random()) ; lp(d, n, 1800); },
  burst: (d, n) => { for (let i = 0; i < n; i++) d[i] = noise() * env(i, n, 0.001, 4); lp(d, n, 5000); for (let i = 0; i < n; i++) d[i] += Math.sin(i * 2 * Math.PI * 60 / SR) * env(i, n, 0.001, 5); },
  hum: (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.sin(i * 2 * Math.PI * 50 / SR) * 0.5 + Math.sin(i * 2 * Math.PI * 100 / SR) * 0.3 + Math.sin(i * 2 * Math.PI * 150 / SR) * 0.1 + noise() * 0.08; lp(d, n, 600); },
  metal_creak: (d, n) => { GEN.creak(d, n); bp(d, n, 180, 6); },
  chase: (d, n) => { // 4 s loop: low pulse + hits at 140 bpm
    const beat = SR * 60 / 140;
    for (let i = 0; i < n; i++) {
      const b = (i % beat) / beat; const bar = Math.floor(i / beat) % 4;
      d[i] = Math.sin(i * 2 * Math.PI * 41 / SR) * (0.5 + 0.5 * Math.exp(-b * 6)) * 0.6
        + Math.sin(i * 2 * Math.PI * 49 / SR) * 0.25
        + (bar % 2 === 1 ? noise() * Math.exp(-b * 25) * 0.6 : 0)
        + Math.sin(i * 2 * Math.PI * 60 / SR * (1 - b * 0.5)) * Math.exp(-b * 12) * 0.9;
    }
    lp(d, n, 900);
  },
  ghost: (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.sin(i * 2 * Math.PI * (300 + 200 * Math.sin(i / 3000)) / SR) * env(i, n, 0.2, 1); },
};
const LEN = { slap_metal: 0.22, slap_dirt: 0.15, slap_wood: 0.18, slap_wet: 0.3, slap_bouncy: 0.3, slap_sticky: 0.35, thud: 0.35, tear: 0.7, bone: 0.35,
  squish: 0.4, splat: 0.18, drip: 0.12, heartbeat: 0.7, plop: 0.3, skull: 0.5, poof: 0.4, creak: 2.0, growl: 2.2, roar: 1.3, siren: 1.6, beep: 0.14,
  beep_hi: 0.25, win: 1.2, lose: 1.4, click: 0.05, button: 0.12, screech: 0.55, snap: 0.45, buzz: 0.6, burst: 0.6, hum: 2.0, metal_creak: 1.6, chase: 60 / 140 * 8, ghost: 1.5 };
const VARIANTS = 4;

export class AudioManager {
  constructor(camera) {
    this.camera = camera; this.ctx = null; this.buffers = {}; this.enabled = false;
    this.loops = new Set(); this.tmp = new THREE.Vector3(); this.fwd = new THREE.Vector3(); this.up = new THREE.Vector3();
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    for (const k of Object.keys(GEN)) {
      this.buffers[k] = [];
      const v = ['hum', 'chase', 'growl', 'creak', 'siren', 'win', 'lose', 'beep', 'beep_hi'].includes(k) ? 1 : VARIANTS;
      for (let i = 0; i < v; i++) this.buffers[k].push(buf(this.ctx, LEN[k] * (0.85 + Math.random() * 0.3 * (v > 1 ? 1 : 0)), GEN[k]));
    }
    this.enabled = true;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 1.2; p.maxDistance = 40; p.rolloffFactor = 1.4;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }
  // play a one-shot. pos=null -> 2D (UI). Returns {src, gain, panner}
  play(name, pos = null, { volume = 1, rate = 1, loop = false } = {}) {
    if (!this.enabled || !this.buffers[name]) return null;
    const list = this.buffers[name];
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (loop ? 1 : 0.93 + Math.random() * 0.14);
    src.loop = loop;
    const g = this.ctx.createGain(); g.gain.value = volume;
    src.connect(g);
    let panner = null;
    if (pos) { panner = this._panner(pos); g.connect(panner); panner.connect(this.master); } else g.connect(this.master);
    src.start();
    const h = { src, gain: g, panner, setPos: (v) => { if (panner) { if (panner.positionX) { panner.positionX.value = v.x; panner.positionY.value = v.y; panner.positionZ.value = v.z; } else panner.setPosition(v.x, v.y, v.z); } },
      stop: () => { try { src.stop(); } catch (e) { } this.loops.delete(h); } };
    if (loop) this.loops.add(h);
    return h;
  }
  slap(surface, pos, strength = 1) {
    const map = { metal: 'slap_metal', climb: 'slap_metal', dirt: 'slap_dirt', wood: 'slap_wood', slip: 'slap_wet', wet: 'slap_wet', bouncy: 'slap_bouncy', sticky: 'slap_sticky' };
    this.play(map[surface] || 'slap_metal', pos, { volume: Math.min(1, 0.25 + strength * 0.5) });
  }
  update() {
    if (!this.enabled) return;
    const l = this.ctx.listener;
    this.camera.getWorldPosition(this.tmp);
    this.fwd.set(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.up.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    if (l.positionX) {
      l.positionX.value = this.tmp.x; l.positionY.value = this.tmp.y; l.positionZ.value = this.tmp.z;
      l.forwardX.value = this.fwd.x; l.forwardY.value = this.fwd.y; l.forwardZ.value = this.fwd.z;
      l.upX.value = this.up.x; l.upY.value = this.up.y; l.upZ.value = this.up.z;
    } else { l.setPosition(this.tmp.x, this.tmp.y, this.tmp.z); l.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z); }
  }
  // background ambience: hum + random drips & distant metal creaks
  startAmbience(getRandomPos) {
    if (!this.enabled || this.ambience) return;
    this.ambience = this.play('hum', null, { volume: 0.12, loop: true });
    const tick = () => {
      if (!this.enabled) return;
      const p = getRandomPos();
      if (Math.random() < 0.6) this.play('drip', p, { volume: 0.5 }); else this.play('metal_creak', p, { volume: 0.4, rate: 0.6 + Math.random() * 0.4 });
      this.ambTimer = setTimeout(tick, 2500 + Math.random() * 5000);
    };
    tick();
  }
  setChase(level) { // 0..1
    if (!this.enabled) return;
    if (!this.chase) this.chase = this.play('chase', null, { volume: 0, loop: true });
    const g = this.chase.gain.gain; g.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.4);
  }
}
