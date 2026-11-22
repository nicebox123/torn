// TORN - DecalSystem: blood splats (6 kinds), bloody 3-finger handprints and claw marks.
// Textures are drawn procedurally into one atlas (8 cells of 512 px). World decals are ONE instanced mesh
// (cheap on Quest). Splats on players/monsters are small child meshes. Max 150 (oldest fade).
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

export const DECAL = { SPLAT1: 0, SPLAT2: 1, DIR1: 2, DIR2: 3, DRIP: 4, SMEAR: 5, HAND: 6, CLAW: 7 };
const CELL = 512;

function blob(g, cx, cy, r, bump, seed, pts = 48) {
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = i / pts * Math.PI * 2;
    const rr = r * (1 + bump * (Math.sin(a * 5 + seed) * 0.5 + Math.sin(a * 11 + seed * 2.3) * 0.3 + Math.sin(a * 23 + seed * 4.1) * 0.2));
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
}
function shade(g, cx, cy, r) { // darker centre (#5C0000 after tint), lighter edges (#8A0303)
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, 'rgb(170,170,170)'); gr.addColorStop(0.7, 'rgb(235,235,235)'); gr.addColorStop(1, 'rgb(255,255,255)');
  return gr;
}
function drawCell(g, k, R) {
  g.save(); g.clearRect(0, 0, CELL, CELL);
  const c = CELL / 2;
  if (k <= 1) { // big round splat + satellites
    g.fillStyle = shade(g, c, c, 150); blob(g, c, c, 120 + k * 15, 0.22, R() * 10);
    const n = 10 + Math.floor(R() * 11);
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, d = 150 + R() * 90, r = 4 + R() * 18; g.fillStyle = '#fff'; blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0.2, R() * 9, 16); }
  } else if (k <= 3) { // directional: teardrop + streaks trailing toward +x
    g.fillStyle = shade(g, c - 80, c, 120); blob(g, c - 90, c, 85, 0.15, R() * 9);
    g.beginPath(); g.moveTo(c - 150, c - 60); g.quadraticCurveTo(c + 40, c - 15, c + 200, c); g.quadraticCurveTo(c + 40, c + 15, c - 150, c + 60); g.fill();
    for (let i = 0; i < 9; i++) { const y = c + (R() - 0.5) * 140, x0 = c - 30 + R() * 60, L = 80 + R() * 160; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x0 + L / 2, y, L / 2, 3 + R() * 5, (R() - 0.5) * 0.2, 0, Math.PI * 2); g.fill(); blob(g, x0 + L + 10, y, 4 + R() * 8, 0.2, R() * 5, 12); }
  } else if (k === 4) { // wall drip: blob at top + 2-4 drips running down
    g.fillStyle = shade(g, c, 130, 110); blob(g, c, 130, 95, 0.2, R() * 9);
    const n = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const x = c - 70 + R() * 140, w = 7 + R() * 9, L = 180 + R() * 180; g.fillStyle = '#fff'; g.fillRect(x - w / 2, 140, w, L); g.beginPath(); g.arc(x, 140 + L, w * 0.9, 0, Math.PI * 2); g.fill(); }
  } else if (k === 5) { // smear (dragged through blood)
    const gr = g.createLinearGradient(40, 0, CELL - 40, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(230,230,230,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(40, c - 70); g.bezierCurveTo(200, c - 100, 330, c - 40, CELL - 30, c - 20); g.lineTo(CELL - 30, c + 25); g.bezierCurveTo(330, c + 50, 200, c + 100, 40, c + 70); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) { g.fillRect(60 + R() * 120, c - 70 + i * 10 + R() * 4, 200 + R() * 200, 2 + R() * 2); }
  } else if (k === 6) { // 3-finger mitt handprint (thumb + 2 fat fingers), blotchy
    g.fillStyle = '#fff';
    blob(g, c, c + 50, 105, 0.12, R() * 9);
    for (const [x, y, rx, ry] of [[c - 55, c - 120, 42, 80], [c + 45, c - 125, 42, 82], [c + 150, c + 20, 36, 62]]) { g.beginPath(); g.ellipse(x, y, rx, ry, x > c + 100 ? 0.9 : 0.1, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.3 + R() * 0.5; blob(g, c - 150 + R() * 300, c - 200 + R() * 360, 6 + R() * 22, 0.3, R() * 9, 12); }
  } else { // claw marks: 3-4 deep parallel scratches
    const n = 3 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const x0 = c - 120 + i * 75, y0 = 60 + R() * 30, x1 = x0 + 60 + R() * 20, y1 = CELL - 60 - R() * 30;
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round'; g.lineWidth = 22; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = 'rgba(120,120,120,1)'; g.lineWidth = 8; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  g.restore();
}
export function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = CELL * 4; cv.height = CELL * 2;
  const g = cv.getContext('2d');
  let s = 12345; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = CELL; const tg = tmp.getContext('2d');
  for (let k = 0; k < 8; k++) { drawCell(tg, k, R); g.drawImage(tmp, (k % 4) * CELL, Math.floor(k / 4) * CELL); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const cellUV = k => [(k % 4) * 0.25, 1 - (Math.floor(k / 4) + 1) * 0.5];

export class DecalSystem {
  constructor(game) {
    this.game = game; this.max = CONFIG.MAX_DECALS; this.atlas = buildAtlas();
    const mat = new THREE.MeshStandardMaterial({ map: this.atlas, transparent: true, depthWrite: false, roughness: 0.12, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 aDecal;\nvarying float vDecalA;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aDecal.xy + uv * vec2(0.25, 0.5);\n#endif\nvDecalA = aDecal.z;');
      sh.fragmentShader = 'varying float vDecalA;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vDecalA;');
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4); this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDecal', this.attr);
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.max; i++) { this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.mesh.setColorAt(i, new THREE.Color(0, 0, 0)); }
    game.scene.add(this.mesh);
    this.items = new Array(this.max).fill(null); this.next = 0;
    this.fresh = new THREE.Color(PALETTE.blood); this.dried = new THREE.Color(PALETTE.bloodDry);
    // body decal resources
    this.bodyMat = new THREE.MeshStandardMaterial({ map: this.atlas, transparent: true, depthWrite: false, roughness: 0.15, color: PALETTE.blood, polygonOffset: true, polygonOffsetFactor: -4 });
    this.bodyGeos = []; for (let k = 0; k < 8; k++) { const g2 = new THREE.PlaneGeometry(1, 1); const uv = g2.attributes.uv; const [u0, v0] = cellUV(k); for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.25, v0 + uv.getY(i) * 0.5); this.bodyGeos.push(g2); }
    this.bodyDecals = [];
    this.sizeMul = 1;
  }
  // point, normal (world). opts: variant, size, color (THREE.Color), dir (for directional splats), alpha, drip, dry
  add(point, normal, { variant = 0, size = 0.3, color = null, dir = null, alpha = 1, dry = true, rot = null } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const n = normal.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    let ang = rot ?? Math.random() * Math.PI * 2;
    if (dir) { const local = dir.clone().projectOnPlane(n).applyQuaternion(q.clone().invert()); if (local.lengthSq() > 1e-6) ang = Math.atan2(local.y, local.x); }
    const isWall = Math.abs(n.y) < 0.5;
    if (variant === DECAL.DRIP && isWall) { // drips run DOWN the wall
      const down = new THREE.Vector3(0, -1, 0).projectOnPlane(n).applyQuaternion(q.clone().invert()); ang = Math.atan2(down.y, down.x) + Math.PI / 2;
    }
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang));
    const c = color ? color.clone() : this.fresh.clone();
    this.items[i] = { pos: point.clone().addScaledVector(n, 0.004), q, size: size * this.sizeMul, t: 0, color: c, base: c.clone(), alpha, dry, variant, stretch: variant === DECAL.DRIP && isWall ? 0.6 : 1, wall: isWall };
    const [u0, v0] = cellUV(variant); this.attr.setXYZW(i, u0, v0, alpha, 0);
    this._write(i); this.attr.needsUpdate = true;
    return this.items[i];
  }
  _write(i) {
    const it = this.items[i];
    const m = new THREE.Matrix4();
    if (!it) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); return; }
    const s = new THREE.Vector3(it.size, it.size * it.stretch, 1);
    const off = new THREE.Vector3(0, -(it.stretch - 1) * it.size * 0.5, 0).applyQuaternion(it.q);
    m.compose(it.pos.clone().add(it.stretch !== 1 ? off : new THREE.Vector3()), it.q, s);
    this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, it.color);
  }
  // splat stuck to a moving body part (player or monster). Max 30.
  addToObject(obj, point, normal, variant = 0, size = 0.08, color = null) {
    const m = new THREE.Mesh(this.bodyGeos[variant], color ? this.bodyMat.clone() : this.bodyMat);
    if (color) m.material.color.copy(color);
    obj.updateMatrixWorld(true);
    m.position.copy(obj.worldToLocal(point.clone().addScaledVector(normal, 0.003)));
    const wq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    m.quaternion.copy(obj.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    m.scale.setScalar(size / Math.max(1e-3, obj.getWorldScale(new THREE.Vector3()).x)); m.renderOrder = 3;
    obj.add(m); this.bodyDecals.push({ m, t: 0 });
    while (this.bodyDecals.length > 30) this.bodyDecals.shift().m.removeFromParent();
  }
  clearBodyDecals() { for (const d of this.bodyDecals) d.m.removeFromParent(); this.bodyDecals = []; }
  clear() { for (let i = 0; i < this.max; i++) { this.items[i] = null; this._write(i); } this.mesh.instanceMatrix.needsUpdate = true; this.clearBodyDecals(); }
  update(dt) {
    let dirty = false, adirty = false;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i]; if (!it) continue;
      it.t += dt;
      let changed = false;
      if (it.dry && it.t < 21) { const k = Math.min(1, it.t / 20); it.color.copy(it.base).lerp(this.dried, k * (it.base.r > 0.3 || it.base.g > 0.3 ? 0.3 : 1)); changed = true; }
      if (it.variant === DECAL.DRIP && it.wall && it.stretch < 1.6) { it.stretch = Math.min(1.6, it.stretch + dt / 3); changed = true; }
      if (changed) { this._write(i); dirty = true; }
    }
    if (dirty) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    if (adirty) this.attr.needsUpdate = true;
  }
}
