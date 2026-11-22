// TORN - CosmeticShop + Mirror. Touch an item on a spinning pedestal to try it on (check the mirror), press BUY.
// Shards are earned by playing. Looks only, no pay-to-win. A free crown hides on top of the central tower.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { COSMETICS } from './config.js';
import { OWN_HEAD_LAYER } from './rig.js';

export class CosmeticShop {
  constructor(game, shopObj, mirrorObj, towerPos) {
    this.game = game; this.shop = shopObj; this.items = []; this.preview = null; this.previewT = 0; this.pressT = 0;
    const list = COSMETICS.filter(c => !c.hidden).slice(0, 12);
    list.forEach((c, i) => {
      const ped = shopObj?.getObjectByName('pedestal_' + (i + 1)); if (!ped) return;
      const disp = this.displayFor(c); disp.position.set(0, 0.01, 0); ped.add(disp);
      this.items.push({ c, ped, disp });
    });
    this.buy = shopObj?.getObjectByName('buy_button'); this.buyBase = this.buy ? this.buy.position.clone() : null;
    this.sign = []; shopObj?.getObjectByName('sign')?.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); this.sign.push(o.material); } });
    // label panel across the top of the booth
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 96; this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.label.position.set(0, 1.78, 0.33); shopObj?.add(this.label);
    this.drawLabel('TOUCH AN ITEM TO TRY IT ON');
    // mirror (only rendered when you're close, to save frames on Quest)
    if (mirrorObj) {
      this.mirror = new Reflector(new THREE.PlaneGeometry(0.84, 1.84), { textureWidth: 512, textureHeight: 1024, color: 0x9aa6a4, clipBias: 0.003 });
      this.mirror.position.copy(mirrorObj.position).add(new THREE.Vector3(0, 1.0, 0.006));
      game.scene.add(this.mirror);
      if (this.mirror.camera) this.mirror.camera.layers.enableAll();
    }
    // hidden free crown on the tower top
    if (towerPos) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x5E625F }));
      ped.position.copy(towerPos).add(new THREE.Vector3(0, 0.25, 0)); game.scene.add(ped);
      game.world.addCentered(ped.position, new THREE.Vector3(0.26, 0.5, 0.26), 'metal', 'pedestal');
      this.crown = game.models.get('hat_crown'); this.crown.position.copy(towerPos).add(new THREE.Vector3(0, 0.52, 0)); game.scene.add(this.crown);
      this.crownGlow = new THREE.PointLight(0xC9A13B, 0.8, 2.5); this.crownGlow.position.copy(this.crown.position).add(new THREE.Vector3(0, 0.2, 0)); game.scene.add(this.crownGlow);
    }
  }
  displayFor(c) {
    const M = this.game.models; let o;
    if (c.model) { o = M.get(c.model); o.scale.multiplyScalar(c.slot === 'face' || c.slot === 'eyes' || c.slot === 'mark' ? 0.9 : 0.75); if (c.slot !== 'hat') { o.position.y = 0.06; } }
    else if (c.slot === 'hands') { o = M.get('survivor_hand_open'); const mat = new THREE.MeshStandardMaterial({ color: c.material.color, metalness: c.material.metalness || 0, roughness: c.material.roughness ?? 0.6, emissive: c.material.emissive || 0x000000, emissiveIntensity: c.material.emissive ? 0.8 : 0 }); o.traverse(m => { if (m.isMesh) m.material = mat; }); o.rotation.z = Math.PI / 2; o.position.set(0, 0.0, 0); o.scale.setScalar(1.3); }
    else if (c.slot === 'blood') { o = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: c.blood, roughness: 0.05, emissive: c.id === 'blood_green' ? c.blood : 0x000000, emissiveIntensity: 0.4 })); o.scale.set(1, 1.3, 1); o.position.y = 0.06; }
    else { o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: c.material.color, emissive: c.material.emissive || 0x000000, emissiveIntensity: c.material.emissiveIntensity || 0, metalness: c.material.metalness || 0, roughness: c.material.roughness ?? 0.7 })); o.position.y = 0.07; }
    const g = new THREE.Group(); g.add(o); return g;
  }
  drawLabel(text, sub = '') {
    const g = this.ctx; g.clearRect(0, 0, 512, 96); g.fillStyle = 'rgba(10,8,6,0.85)'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#FF6A2A'; g.font = 'bold 30px "Courier New", monospace'; g.textAlign = 'center'; g.fillText(text, 256, 40);
    g.fillStyle = '#E8E2D6'; g.font = '22px "Courier New", monospace'; g.fillText(sub || ('YOUR SHARDS: ' + this.game.save.data.shards), 256, 76);
    this.tex.needsUpdate = true;
  }
  owned(c) { return c.price === 0 && !c.hidden || this.game.save.data.owned.includes(c.id); }
  tryOn(c) {
    if (this.preview === c) return;
    this.preview = c; this.previewT = 15;
    const eq = Object.assign({}, this.game.save.data.equipped); eq[c.slot] = c.id;
    this.game.player.creature.applyCosmetics(eq, this.game.save.data.glowColor);
    this.drawLabel(c.name + (this.owned(c) ? ' (OWNED)' : ' - ' + c.price + ' SHARDS'), this.owned(c) ? 'PRESS BUY TO WEAR / TAKE OFF' : 'PRESS BUY. YOU HAVE ' + this.game.save.data.shards);
    this.game.audio?.play('button', this.shop.getWorldPosition(new THREE.Vector3()), { volume: 0.4, rate: 1.5 });
  }
  pressBuy() {
    const G = this.game, S = G.save.data, c = this.preview; if (!c) { this.drawLabel('TOUCH AN ITEM FIRST'); return; }
    G.audio?.play('button', this.buy.getWorldPosition(new THREE.Vector3()), { volume: 0.8 });
    const eq = Object.assign({}, S.equipped);
    if (this.owned(c)) {
      if (eq[c.slot] === c.id) delete eq[c.slot]; else eq[c.slot] = c.id;
      if (c.glow && eq[c.slot] === c.id) G.save.set('glowColor', (S.glowColor + 1) % 3);
      G.save.set('equipped', eq); this.drawLabel(eq[c.slot] === c.id ? 'EQUIPPED ' + c.name : 'TOOK OFF ' + c.name);
    } else if (S.shards >= c.price) {
      G.save.set('shards', S.shards - c.price); G.save.set('owned', [...S.owned, c.id]); eq[c.slot] = c.id; G.save.set('equipped', eq);
      G.audio?.play('win', null, { volume: 0.4 }); this.drawLabel('BOUGHT ' + c.name + '!');
    } else { this.drawLabel('NEED ' + (c.price - S.shards) + ' MORE SHARDS', 'KEEP PLAYING TO EARN SHARDS'); G.audio?.play('lose', null, { volume: 0.3, rate: 1.6 }); return; }
    this.preview = null; G.player.creature.applyCosmetics(G.save.data.equipped, G.save.data.glowColor);
  }
  hit(ray) { // desktop poke
    const objs = this.items.map(i => i.disp); if (this.buy) objs.push(this.buy);
    const h = ray.intersectObjects(objs, true)[0]; if (!h) return false;
    let o = h.object; while (o) { if (o === this.buy) { this.pressBuy(); return true; } const it = this.items.find(i => i.disp === o); if (it) { this.tryOn(it.c); return true; } o = o.parent; }
    return false;
  }
  update(dt, hands, t) {
    const G = this.game;
    for (const it of this.items) it.disp.rotation.y += dt * 0.8;
    for (const m of this.sign) m.emissiveIntensity = Math.random() < 0.03 ? 0.4 : 4;
    if (this.previewT > 0) { this.previewT -= dt; if (this.previewT <= 0 && this.preview) { this.preview = null; G.player.creature.applyCosmetics(G.save.data.equipped, G.save.data.glowColor); this.drawLabel('TOUCH AN ITEM TO TRY IT ON'); } }
    if (this.pressT > 0) { this.pressT -= dt; } else if (this.buy) this.buy.position.copy(this.buyBase);
    const shopPos = this.shop ? this.shop.getWorldPosition(new THREE.Vector3()) : null;
    for (const h of hands) {
      if (!h) continue;
      if (shopPos && h.distanceTo(shopPos) < 2.5) {
        for (const it of this.items) { const p = it.disp.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0)); if (p.distanceTo(h) < 0.13) this.tryOn(it.c); }
        if (this.buy && this.pressT <= 0) { const b = this.buy.getWorldPosition(new THREE.Vector3()); if (b.distanceTo(h) < 0.1) { this.pressT = 0.6; this.buy.position.z = this.buyBase.z - 0.02; this.pressBuy(); } }
      }
      if (this.crown && this.crown.parent && h.distanceTo(this.crown.position) < 0.25) {
        const S = G.save.data;
        if (!S.owned.includes('hat_crown')) G.save.set('owned', [...S.owned, 'hat_crown']);
        const eq = Object.assign({}, S.equipped, { hat: 'hat_crown' }); G.save.set('equipped', eq); G.player.creature.applyCosmetics(eq, S.glowColor);
        G.toast('FOUND: BENT CROWN', '#C9A13B'); G.audio?.play('win', null, { volume: 0.6 });
        this.crown.removeFromParent(); this.crownGlow.removeFromParent();
      }
    }
    if (this.crown && this.crown.parent) this.crown.rotation.y += dt;
    if (this.mirror) { const cam = G.camera.getWorldPosition(new THREE.Vector3()); this.mirror.visible = cam.distanceTo(this.mirror.position) < 7; }
  }
}
