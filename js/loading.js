// TORN - LoadingScreen. A tiny 3D scene: pitch black void, a dark metal wall 4 m ahead, one flickering tube light,
// claws carve T-O-R-N, blood seeps down, a needle sews a stitch-line loading bar, then it snaps and you fade in.
import * as THREE from 'three';
import { TIPS, PALETTE } from './config.js';

export class LoadingScreen {
  constructor(game) {
    this.game = game; this.t = 0; this.done = false; this.finished = false; this.shown = 0;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x000000); s.fog = new THREE.FogExp2(0x050606, 0.12);
    s.add(new THREE.AmbientLight(0xffffff, 0.04));
    this.light = new THREE.PointLight(0xDDEFE8, 0, 9, 1.6); this.light.position.set(0, 3.6, -3.4); s.add(this.light);
    const M = game.models;
    this.wall = M.get('loading_wall'); this.wall.position.set(0, -0.35, -4); s.add(this.wall);
    this.letters = ['T', 'O', 'R', 'N'].map(c => this.wall.getObjectByName('letter_' + c)).filter(Boolean);
    for (const l of this.letters) l.scale.set(0.001, 1, 1);
    this.lamp = M.get('ceiling_light', ['Fluorescent']); this.lamp.position.set(0, 3.0, -3.7); s.add(this.lamp);
    this.tubes = []; this.lamp.traverse(o => { if (o.isMesh && o.material?.name === 'Fluorescent') this.tubes.push(o.material); });
    for (const m of this.tubes) m.emissiveIntensity = 0;
    // stitch-line loading bar
    this.barY = 0.85; this.barX0 = -1.7; this.barX1 = 1.7;
    this.needle = M.get('respawn_needle'); this.needle.scale.setScalar(3); this.needle.position.set(this.barX0, this.barY, -3.9); s.add(this.needle);
    this.stitchGroup = new THREE.Group(); s.add(this.stitchGroup); this.stitches = []; this.stitchMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    this.threadMat = new THREE.MeshBasicMaterial({ color: 0x8a1010 });
    // tip text
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
    g.font = '30px "Courier New", monospace'; g.fillStyle = PALETTE.tip; g.textAlign = 'center'; g.fillText(TIPS[Math.floor(Math.random() * TIPS.length)], 512, 40);
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    this.tip = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.225), new THREE.MeshBasicMaterial({ map: tt, transparent: true, opacity: 0 })); this.tip.position.set(0, 0.55, -3.95); s.add(this.tip);
    this.drips = []; this.dripMat = new THREE.MeshStandardMaterial({ color: PALETTE.blood, roughness: 0.05 });
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
    this.flash.renderOrder = 999; this.sparks = [];
    this.flickers = [0.25, 0.32, 0.55, 0.62, 0.9, 1.02]; this.nextLetter = 0;
  }
  attachCamera(camera) { camera.add(this.flash); }
  // progress: 0..1 real loading progress
  update(dt, progress) {
    const A = this.game.audio, t = (this.t += dt);
    // light: flickers 3 times then stays on (dim)
    let on = t > 1.15 ? 1 : 0; for (let i = 0; i < this.flickers.length; i += 2) if (t > this.flickers[i] && t < this.flickers[i + 1]) on = 1;
    if (this.done) on = this.burst > 0 ? 6 : 0;
    for (const m of this.tubes) m.emissiveIntensity = on * 2.2; this.light.intensity = on * 5;
    if (on && !this.buzzing && t > 0.2) { this.buzzing = true; A?.play('buzz', this.lamp.position, { volume: 0.25 }); }
    // claws carve the letters one by one
    const letterStart = 1.3, gap = 0.5;
    while (this.nextLetter < this.letters.length && t > letterStart + this.nextLetter * gap) { A?.play('screech', this.letters[this.nextLetter].getWorldPosition(new THREE.Vector3()), { volume: 0.8 }); this.nextLetter++; }
    this.letters.forEach((l, i) => { const k = Math.min(1, Math.max(0, (t - letterStart - i * gap) / 0.35)); l.scale.x = Math.max(0.001, k); if (k > 0 && k < 1 && Math.random() < 0.6) this.spark(l); });
    // blood seeps out of the gouges and drips down (stretching over 2 s)
    const bloodStart = letterStart + this.letters.length * gap + 0.2;
    if (t > bloodStart && !this.drips.length) {
      for (const l of this.letters) for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.01), this.dripMat); const p = l.getWorldPosition(new THREE.Vector3());
        m.position.set(p.x + (Math.random() - 0.5) * 0.6, p.y - 0.2 - Math.random() * 0.3, p.z + 0.02); m.userData.top = m.position.y; m.userData.len = 0.5 + Math.random() * 0.9; m.scale.y = 0.001; this.scene.add(m); this.drips.push(m);
      }
    }
    for (const d of this.drips) { const k = Math.min(1, (t - bloodStart) / 2); const L = d.userData.len * k; d.scale.y = Math.max(0.001, L); d.position.y = d.userData.top - L / 2; }
    // needle sews the stitch line: at least ~4.5 s, longer if loading is slow
    const shown = Math.min(progress, (t - 0.4) / 4.4); this.shown = Math.max(this.shown, Math.max(0, shown));
    const x = this.barX0 + (this.barX1 - this.barX0) * this.shown;
    this.needle.position.set(x, this.barY + Math.sin(t * 18) * 0.02, -3.9); this.needle.rotation.z = Math.sin(t * 18) * 0.3;
    while (!this.done && this.stitches.length * 0.12 + this.barX0 < x - 0.06) this.addStitch(this.barX0 + this.stitches.length * 0.12 + 0.06);
    this.tip.material.opacity = Math.min(1, Math.max(0, (t - 1) / 1));
    // finished: the stitch line snaps, the light bursts, cut to black
    if (!this.done && this.shown >= 1 && progress >= 1 && t > 4.6) {
      this.done = true; this.burst = 0.15; this.endT = 0;
      A?.play('snap', new THREE.Vector3(0, this.barY, -3.9), { volume: 1 }); A?.play('burst', this.lamp.position, { volume: 0.8 });
      for (const s of this.stitches) s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, Math.random() * 1.5);
    }
    if (this.done) {
      this.burst -= dt; this.endT += dt;
      for (const s of this.stitches) { s.userData.v.y -= 9.8 * dt; s.position.addScaledVector(s.userData.v, dt); s.rotation.z += dt * 8; }
      this.flash.material.opacity = this.burst > 0 ? 1 : Math.max(0, 1 - (this.endT - 0.15) * 4) * 0;
      if (this.endT > 0.15) { this.flash.material.color.set(0x000000); this.flash.material.opacity = 1; }
      if (this.endT > 0.6) this.finished = true;
    }
    for (const sp of this.sparks) { sp.userData.v.y -= 9.8 * dt; sp.position.addScaledVector(sp.userData.v, dt); sp.userData.life -= dt; sp.visible = sp.userData.life > 0; }
  }
  addStitch(x) {
    const g = new THREE.Group(); g.position.set(x, this.barY, -3.93);
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.016, 0.01), this.stitchMat); b.rotation.z = a; g.add(b); }
    const th = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.006), this.threadMat); th.position.y = 0; g.add(th);
    this.stitchGroup.add(g); this.stitches.push(g);
  }
  spark(letter) {
    let s = this.sparks.find(x => x.userData.life <= 0);
    if (!s) { if (this.sparks.length > 40) return; s = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); this.scene.add(s); this.sparks.push(s); }
    const p = letter.getWorldPosition(new THREE.Vector3()); s.position.set(p.x + (Math.random() - .5) * 0.6, p.y + (Math.random() - .5) * 1, p.z + 0.05);
    s.userData.v = new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 2, 1 + Math.random()); s.userData.life = 0.5; s.visible = true;
  }
  dispose(camera) { this.flash.removeFromParent(); }
}
