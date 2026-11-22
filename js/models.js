// TORN - ModelLoader. Loads models/<name>.glb. Anything missing gets a simple placeholder so the game always runs.
// Blender exports with +Y up; character fronts face +Z; arms point along +X.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_LIST = [
  'survivor_head', 'survivor_torso_L', 'survivor_torso_R', 'survivor_upperarm', 'survivor_forearm', 'survivor_hand_open', 'survivor_hand_closed',
  'survivor_skull_L', 'survivor_skull_R', 'survivor_brain',
  'wound_shoulder', 'wound_arm_end', 'wound_neck_body', 'wound_neck_head', 'wound_stuffing_shoulder', 'wound_stuffing_arm', 'wound_stuffing_neck',
  'organ_heart', 'organ_lung_L', 'organ_lung_R', 'organ_stomach', 'organ_liver', 'organ_intestine_segment', 'organ_intestine_end', 'organ_spine_segment',
  'bone_shard_1', 'bone_shard_2', 'bone_shard_3', 'flesh_chunk_1', 'flesh_chunk_2', 'flesh_chunk_3', 'stuffing_puff',
  'butcher_body', 'butcher_upperarm', 'butcher_forearm', 'butcher_hand_open', 'butcher_hand_closed',
  'stitchface_body', 'stitchface_upperarm', 'stitchface_forearm', 'stitchface_hand_open', 'stitchface_hand_closed',
  'crawler_body', 'crawler_upperarm', 'crawler_forearm', 'crawler_hand_open', 'crawler_hand_closed',
  'hat_party', 'hat_hardhat', 'hat_crown', 'hat_traffic_cone', 'hat_bucket', 'hat_chef', 'mask_hockey', 'mask_gas', 'mask_surgical', 'eyes_glowing', 'face_stitches_X',
  'respawn_needle', 'computer_terminal', 'mirror_frame', 'shop_stand', 'mode_screen', 'loading_wall', 'ceiling_light', 'emergency_light',
  'surgical_table', 'glass_tank_broken', 'jar', 'metal_shelf', 'metal_barrel', 'metal_crate', 'hanging_chain', 'warning_sign', 'warning_sign_noentry',
  'warning_sign_subjects', 'sign_testing_area', 'blood_bucket', 'body_bag', 'trash_pile',
  'wall_straight', 'wall_spawn', 'wall_plain', 'wall_corner', 'wall_doorway', 'wall_window', 'floor_tile', 'ceiling_tile', 'catwalk_straight', 'catwalk_corner',
  'ladder', 'pipe_straight', 'pipe_corner', 'pipe_T', 'valve_wheel', 'vent_straight', 'vent_corner', 'vent_grate', 'tower_section',
];
export const LOADING_FIRST = ['loading_wall', 'ceiling_light', 'respawn_needle'];

const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, name: o.name || 'ph' }, o));

// Placeholders shaped roughly like the real thing (same pivots), so layout & rigs still work.
function placeholder(name) {
  const g = new THREE.Group(); g.name = name; g.userData.placeholder = true;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
  const skin = mat('#E8E2D6', { name: 'Skin' });
  if (name === 'survivor_head') { add(new THREE.SphereGeometry(0.12, 12, 8), skin, 0, 0.135, 0).scale.set(1, 0.875, 0.96); const j = new THREE.Group(); j.name = 'jaw'; g.add(j);
    for (const [n, x, y] of [['eye_L', 0.05, 0.15], ['eye_R', -0.05, 0.147]]) { const e = add(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 12), mat('#141414'), x, y, 0.105); e.rotation.x = Math.PI / 2; e.name = n; } }
  else if (name.startsWith('survivor_torso')) { const s = name.endsWith('L') ? 1 : -1; const m = add(new THREE.SphereGeometry(0.175, 10, 10, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), skin); m.scale.set(1, 1.15, 0.8); }
  else if (/upperarm|forearm/.test(name)) { const L = name.startsWith('butcher') ? 0.45 : name.startsWith('stitchface') ? 0.55 : name.startsWith('crawler') ? 0.4 : 0.3; const r = name.startsWith('butcher') ? 0.07 : 0.025; const m = add(new THREE.CylinderGeometry(r, r * 0.9, L, 8), name.startsWith('survivor') ? skin : mat('#6B5E57', { name: 'ButcherSkin' }), L / 2); m.rotation.z = Math.PI / 2; }
  else if (/hand/.test(name)) { add(new THREE.BoxGeometry(0.12, 0.04, 0.09), name.startsWith('survivor') ? skin : mat('#6E4B32'), 0.06); }
  else if (name.endsWith('_body')) { const r = name.startsWith('butcher') ? 0.45 : name.startsWith('stitchface') ? 0.25 : 0.3; const m = add(new THREE.SphereGeometry(r, 16, 12), mat(name.startsWith('crawler') ? '#2E2A2B' : '#6B5E57', { name: name.startsWith('butcher') ? 'ButcherSkin' : name.startsWith('stitchface') ? 'SFPatch1' : 'CrawlerShell' }));
    if (name.startsWith('stitchface')) m.scale.set(1, 2.8, 0.8); if (name.startsWith('crawler')) m.scale.set(1, 0.6, 1.5);
    for (const [n, x] of [['shoulder_L', r * 0.9], ['shoulder_R', -r * 0.9]]) { const e = new THREE.Object3D(); e.name = n; e.position.set(x, r * 0.5, 0); g.add(e); } }
  else if (name.startsWith('wound')) { add(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 12), mat(name.includes('stuffing') ? '#F5F3EE' : '#8E1B1B', { roughness: 0.3 })); }
  else if (name.startsWith('organ_heart')) add(new THREE.SphereGeometry(0.045, 10, 8), mat('#7A1015', { roughness: 0.2 }));
  else if (name.startsWith('organ_lung')) add(new THREE.SphereGeometry(0.06, 8, 6), mat('#D98A8A')).scale.set(0.75, 1.3, 0.7);
  else if (name.startsWith('organ_intestine')) { const m = add(new THREE.CapsuleGeometry(0.0125, 0.035, 4, 8), mat('#E0A49A', { roughness: 0.2 })); m.rotation.z = Math.PI / 2; }
  else if (name.startsWith('organ') || name === 'survivor_brain') add(new THREE.SphereGeometry(0.05, 8, 6), mat(name.includes('liver') ? '#5A1A14' : name.includes('brain') ? '#D7A3A3' : '#D9A08A', { roughness: 0.2 }));
  else if (/shard|chunk|puff/.test(name)) add(new THREE.IcosahedronGeometry(0.01, 0), mat(name.includes('shard') ? '#E9DFC8' : name.includes('puff') ? '#F5F3EE' : '#8E1B1B'));
  else if (/^(wall_straight|wall_spawn|wall_plain|wall_window|wall_doorway)$/.test(name)) add(new THREE.BoxGeometry(4, 4, 0.2), mat('#4A4F4E', { name: 'WallMetal' }), 2, 2, -0.1);
  else if (name === 'wall_corner') add(new THREE.BoxGeometry(0.4, 4, 0.4), mat('#1E201F'), 0.2, 2, -0.2);
  else if (name === 'floor_tile' || name === 'ceiling_tile') add(new THREE.BoxGeometry(4, 0.05, 4), mat(name === 'floor_tile' ? '#8D8A80' : '#1E201F'), 2, -0.025, -2);
  else if (name.startsWith('catwalk')) add(new THREE.BoxGeometry(name.endsWith('corner') ? 1.2 : 2, 0.05, 1.2), mat('#3C403F'), name.endsWith('corner') ? 0.6 : 1, -0.025, -0.6);
  else if (name === 'tower_section') add(new THREE.BoxGeometry(2, 3, 2), mat('#4A4F4E'), 2, 1.5, -2);
  else if (name === 'ladder') add(new THREE.BoxGeometry(0.5, 3, 0.05), mat('#3C403F'), 0.25, 1.5, -0.05);
  else if (name.startsWith('pipe')) { const m = add(new THREE.CylinderGeometry(0.075, 0.075, 2, 8), mat('#5E625F'), 1, 0.075, -0.075); m.rotation.z = Math.PI / 2; }
  else if (name.startsWith('vent')) add(new THREE.BoxGeometry(name === 'vent_straight' ? 2 : 0.66, 0.66, 0.66), mat('#5E625F', { side: THREE.BackSide }), name === 'vent_straight' ? 1 : 0.33, 0.33, -0.33);
  else if (name === 'computer_terminal') { add(new THREE.BoxGeometry(1.2, 0.8, 0.7), mat('#5E625F'), 0, 0.4, 0); const s = add(new THREE.PlaneGeometry(0.44, 0.33), mat('#0A140C'), 0.05, 1.09, 0.14); s.name = 'screen'; }
  else if (name === 'mode_screen') { add(new THREE.BoxGeometry(0.78, 0.6, 0.5), mat('#BDB5A0'), 0, 0, 0.55); const s = add(new THREE.PlaneGeometry(0.64, 0.48), mat('#0A140C'), 0, 0.02, 0.81); s.name = 'screen'; }
  else if (name === 'loading_wall') { add(new THREE.BoxGeometry(6, 3, 0.3), mat('#2E302C'), 0, 1.5, -0.15); for (const [i, c] of [...'TORN'].entries()) { const l = new THREE.Group(); l.name = 'letter_' + c; l.position.set(-2.1 + i * 1.4, 1.95, 0.01); l.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.01), mat('#9A9A96', { metalness: 1 }))); g.add(l); } }
  else if (name === 'ceiling_light') { add(new THREE.BoxGeometry(1.25, 0.08, 0.26), mat('#5E625F'), 0, -0.04, 0); for (const [n, z] of [['tube_1', 0.06], ['tube_2', -0.06]]) { const t = add(new THREE.CylinderGeometry(0.016, 0.016, 1.18, 8), mat('#DDEFE8', { emissive: '#DDEFE8', emissiveIntensity: 3, name: 'Fluorescent' }), 0, -0.11, z); t.rotation.z = Math.PI / 2; t.name = n; } }
  else if (name === 'respawn_needle') { const m = add(new THREE.CylinderGeometry(0.0015, 0.0002, 0.1, 6), mat('#E8EEF2', { metalness: 1, emissive: '#ffffff', emissiveIntensity: 0.5 })); m.rotation.z = -Math.PI / 2; }
  else add(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat('#7A4A2A'), 0, 0.15, 0);
  return g;
}

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.scenes = {}; this.missing = new Set(); this.loaded = 0; this.total = 0;
  }
  async loadList(names, onProgress, concurrency = 6) {
    this.total += names.length;
    let i = 0;
    const next = async () => {
      while (i < names.length) {
        const name = names[i++];
        if (this.scenes[name]) { this.loaded++; onProgress && onProgress(this.loaded / this.total); continue; }
        try {
          const gltf = await this.loader.loadAsync(`models/${name}.glb`);
          const s = gltf.scene; s.name = name;
          s.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
          this.scenes[name] = s;
        } catch (e) {
          this.missing.add(name); this.scenes[name] = placeholder(name);
        }
        this.loaded++; onProgress && onProgress(this.loaded / this.total);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, next));
  }
  has(name) { return !!this.scenes[name]; }
  // Deep clone. cloneMats: names (or true) of materials to clone so they can be tinted per instance.
  get(name, cloneMats = null) {
    const src = this.scenes[name] || (this.scenes[name] = placeholder(name));
    const c = src.clone(true);
    if (cloneMats) {
      const cache = new Map();
      c.traverse(o => {
        if (!o.isMesh) return;
        const swap = m => {
          if (cloneMats === true || cloneMats.includes(m.name)) { if (!cache.has(m)) cache.set(m, m.clone()); return cache.get(m); }
          return m;
        };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
    }
    return c;
  }
}

// Give a flat mesh simple 0..1 UVs from its bounding box (the "screen" objects come from Blender without UVs).
export function planarUV(mesh, axes = 'xy') {
  const g = mesh.geometry; g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const [a, c] = axes.split('');
  for (let i = 0; i < p.count; i++) {
    const v = { x: p.getX(i), y: p.getY(i), z: p.getZ(i) };
    uv[i * 2] = (v[a] - b.min[a]) / ((b.max[a] - b.min[a]) || 1);
    uv[i * 2 + 1] = (v[c] - b.min[c]) / ((b.max[c] - b.min[c]) || 1);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function findMaterial(root, name) {
  let found = null;
  root.traverse(o => { if (found || !o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.name === name) found = m; });
  return found;
}
