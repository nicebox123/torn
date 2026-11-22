// TORN - main: creates every system, runs the loading screen, then the game loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG, COSMETICS, PALETTE } from './config.js';
import { Save } from './save.js';
import { AudioManager } from './audio.js';
import { ModelLoader, MODEL_LIST, LOADING_FIRST } from './models.js';
import { World } from './world.js';
import { Facility } from './map.js';
import { DecalSystem } from './decals.js';
import { GoreSystem } from './gore.js';
import { OrganPhysics } from './physics.js';
import { TearSystem } from './tear.js';
import { Creature } from './rig.js';
import { Bot } from './bots.js';
import { GameModeManager } from './gamemode.js';
import { ComputerUI } from './computer.js';
import { CosmeticShop } from './shop.js';
import { LoadingScreen } from './loading.js';
import { NetworkManager, rng } from './network.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';

class Events { constructor() { this.m = {}; } on(e, f) { (this.m[e] ||= []).push(f); } emit(e, ...a) { for (const f of this.m[e] || []) f(...a); } }

export class Game {
  constructor() {
    this.save = Save; Save.load();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace; r.xr.enabled = true; r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation?.(1);
    document.body.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(PALETTE.fog); this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.05);
    const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.35;
    this.scene.add(new THREE.HemisphereLight(0x9aaba8, 0x1a1410, 0.75), new THREE.AmbientLight(0xffffff, 0.12));
    for (const [x, y, z, i, d] of [[5, 3.4, -5, 6, 12], [5, 9, 8, 30, 24], [5, 9, 22, 30, 24], [-14, 3.4, 16, 5, 14]]) { const l = new THREE.PointLight(0xDDEFE8, i, d, 1.5); l.position.set(x, y, z); this.scene.add(l); }
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.02, 120);
    this.rig = new THREE.Group(); this.rig.add(this.camera); this.scene.add(this.rig);
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); });
    this.events = new Events(); this.time = 0; this.creatures = []; this.bots = [];
    this.audio = new AudioManager(this.camera); this.models = new ModelLoader(); this.net = new NetworkManager();
    this.input = new Input(r, this.camera, this.rig, r.domElement);
    this.clock = new THREE.Clock(); this.state = 'idle'; this.toasts = []; this.growls = new Map();
    this.fps = { acc: 0, n: 0, bad: 0, good: 0 }; this.minuteT = 0;
    this.botTearMult = 1;
  }
  // ------------------------------------------------------------------ start (called from the menu button)
  async start(desktop) {
    this.input.desktop = desktop;
    this.audio.init(); this.audio.resume();
    if (desktop) { this.camera.position.set(0, 1.6, 0); this.input.yaw = 0; this.input.pitch = 0; try { this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (e) { } }
    this.renderer.setAnimationLoop((t, f) => this.frame(t, f));
    await this.models.loadList(LOADING_FIRST, null);
    this.loading = new LoadingScreen(this); this.loading.attachCamera(this.camera);
    this.loadScene = this.loading.scene; this.loadScene.environment = this.scene.environment; this.loadScene.environmentIntensity = 0.6; this.loadScene.add(this.rig); this.rig.position.set(0, 0, 0);
    this.state = 'loading'; this.progress = 0;
    this.models.loadList(MODEL_LIST, p => this.progress = p * 0.9).then(() => setTimeout(() => this.build(), 30));
  }
  build() {
    this.world = new World();
    this.map = new Facility(this); this.map.build();
    this.decals = new DecalSystem(this); this.gore = new GoreSystem(this); this.phys = new OrganPhysics(this); this.tear = new TearSystem(this);
    this.map.computer?.updateMatrixWorld(true);
    this.computer = new ComputerUI(this, this.map.computer);
    this.player = new LocalPlayer(this); this.creatures.push(this.player.creature);
    this.shop = new CosmeticShop(this, this.map.shop, this.map.mirror, this.map.towerPedestal);
    this.joinRoom('PUBLIC', true);
    this.modes = new GameModeManager(this);
    this.events.on('tear', ({ monster }) => { if (monster.isLocal) this.addShards(CONFIG.SHARDS_PER_TEAR, 'TEAR'); });
    if (this.save.data.mic !== 'OFF') this.setMic(this.save.data.mic);
    this.progress = 1;
  }
  enterGame() {
    this.state = 'game';
    this.loading.dispose(); this.scene.add(this.rig);
    this.player.spawn(this.map.spawnPoint, this.map.spawnYaw); this.player.fade = 1;
    this.audio.startAmbience(() => this.map.randomAmbientPos());
    this.toast('WELCOME TO THE FACILITY', '#E8E2D6');
  }
  // ------------------------------------------------------------------ rooms & bots (fake network)
  joinRoom(code, silent = false) {
    const roster = this.net.joinRoom(code);
    for (const b of this.bots) { this.phys?.removeOwnedBy(b.c); b.c.dispose(); }
    this.creatures = [this.player.creature]; this.bots = [];
    this.phys?.clear(); this.gore?.clear(); this.decals?.clear();
    const R = rng(roster.length * 97 + code.length);
    roster.forEach((e, i) => {
      const c = new Creature(this, { name: e.name, color: e.color, isBot: true }); c.id = 'bot' + i;
      const hats = COSMETICS.filter(x => x.model && !x.hidden); const eq = {};
      if (R() < 0.6) { const h = hats[Math.floor(R() * hats.length)]; eq[h.slot] = h.id; } c.applyCosmetics(eq, Math.floor(R() * 3));
      const bot = new Bot(this, c, e.seed); const w = this.map.randomWaypoint(R, true); bot.spawnAt(w.pos.clone().add(new THREE.Vector3(R() - .5, 0, R() - .5)));
      this.creatures.push(c); this.bots.push(bot);
    });
    if (this.modes) { this.modes.endRound(true); this.modes.huntIndex = 0; }
    if (!silent) { this.player.spawn(this.map.spawnPoint, this.map.spawnYaw); this.player.creature.buildSurvivor(); this.player.creature.setMonster(null); this.toast('ROOM ' + code + ' - ' + this.creatures.length + '/' + CONFIG.ROOM_MAX, '#3CFF6E'); }
  }
  setPlayerName(n) { this.save.set('name', n); this.player.creature.setName(n); }
  async setMic(m) {
    if (m === 'OFF') { this.micStream?.getTracks().forEach(t => t.stop()); this.micStream = null; this.micLevel = undefined; return; }
    if (this.micStream) return;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = this.audio.ctx.createMediaStreamSource(this.micStream); const an = this.audio.ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      const data = new Uint8Array(an.fftSize); let smooth = 0;
      this.micLevel = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) s += Math.abs(v - 128); smooth += (s / data.length / 128 - smooth) * 0.3; return smooth; };
    } catch (e) { this.toast('MIC BLOCKED', '#FF4A3A'); }
  }
  // ------------------------------------------------------------------ shared helpers used by many systems
  haptic(creature, i, intensity, ms) { if (creature && creature.isLocal) this.input.haptic(i, intensity, ms); }
  dragCreature(c, delta, dt, k = 1) { if (c.isLocal) this.player.dragged(delta, dt, k); else if (c.bot) { c.bot.pos.addScaledVector(delta, Math.min(1, dt * 12) * k); c.bot.vel.multiplyScalar(0.6); } }
  knockback(c, v) { if (c.isLocal) this.player.knockback(v); else if (c.bot) { c.bot.vel.add(v); c.bot.ground = false; } }
  botHold(m, i, body) { const b = m.bot; if (!b) return; b.held = { i, node: body.nodes[0] }; this.phys.grab(body.nodes[0], { pos: m.handWorld[i] }); b.holdTimer = 1.2 + Math.random(); }
  creatureAt(p) {
    for (const c of this.creatures) {
      if (!c.alive || c.ghost) continue;
      if (c.monster) { if (c.mon.body.getWorldPosition(new THREE.Vector3()).distanceTo(p) < c.radius + 0.05) return { obj: c.mon.body }; }
      else if (!c.surv.split && c.surv.torso.getWorldPosition(new THREE.Vector3()).distanceTo(p) < 0.2) return { obj: c.surv.tL };
    }
    return null;
  }
  ability(c, type) {
    const pos = c.bodyCenter();
    if (type === 'ROAR') {
      c.anim.roar = 1; this.audio.play('roar', pos, { volume: 1 });
      this.shockwave(pos);
      for (const o of this.creatures) { if (o === c || o.monster || !o.alive) continue; if (o.bodyCenter().distanceTo(pos) < 4) { if (o.isLocal) { this.player.loco.stunned = 1.5; this.player.hurtPulse(0.6); this.toast('STUNNED!', '#FF3030'); } else if (o.bot) o.bot.stun = 1.5; o.flinch(); } }
    } else if (type === 'CRAWL') {
      c.anim.crawl = 6; if (c.isLocal) this.player.crawlT = 6; this.audio.play('growl', pos, { volume: 0.8, rate: 1.3 });
    } else if (type === 'POUNCE') {
      this.audio.play('roar', pos, { volume: 0.7, rate: 1.4 }); c.pounceT = 1;
      if (c.isLocal) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.headQuat).setY(0).normalize(); this.player.loco.addVelocity(f.multiplyScalar(7).add(new THREE.Vector3(0, 3, 0))); this.player.loco.stunned = 0.3; this.player.desktopVel.add(f.clone().multiplyScalar(1).add(new THREE.Vector3(0, 3, 0))); }
    }
  }
  shockwave(pos) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xFFD23F, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; const hit = this.world.raycast(pos, new THREE.Vector3(0, -1, 0), 3); ring.position.copy(hit ? hit.point : pos).add(new THREE.Vector3(0, 0.03, 0));
    this.scene.add(ring); this.fx = this.fx || []; this.fx.push({ o: ring, t: 0, d: 0.6, f: (o, k) => { o.scale.setScalar(0.3 + k * 4); o.material.opacity = 0.8 * (1 - k); } });
  }
  toast(text, color = '#F0EBE1') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
    g.font = 'bold 64px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(text, 512, 64); g.fillStyle = color; g.fillText(text, 512, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
    m.renderOrder = 1001; m.position.set(0, 0.12 - this.toasts.length * 0.11, -1); this.camera.add(m);
    this.toasts.push({ m, t: 2.8 });
  }
  addShards(n, why) {
    const S = this.save.data; const lvBefore = this.save.level;
    this.save.set('shards', S.shards + n); this.save.set('xp', S.xp + n);
    if (this.save.level > lvBefore) { this.toast('LEVEL ' + this.save.level + '!', '#3CFF6E'); if (this.save.level === CONFIG.CRAWLER_UNLOCK_LEVEL) this.toast('CRAWLER UNLOCKED', '#FF2A1A'); }
  }
  debugCycleMonster() {
    const c = this.player.creature; const order = [null, 'BUTCHER', 'STITCHFACE', 'CRAWLER'];
    c.setMonster(order[(order.indexOf(c.monster) + 1) % order.length]); this.toast(c.monster ? 'TEST: ' + c.monster : 'TEST: SURVIVOR');
  }
  // ------------------------------------------------------------------ frame
  frame(t, xrFrame) {
    const real = Math.min(this.clock.getDelta(), 0.05);
    if (this.renderer.xr.isPresenting) this.renderer.xr.updateCamera?.(this.camera);
    if (this.state === 'loading') {
      this.input.update(real); if (this.input.desktop && !this.input.xr) this.input.desktopUpdateLook();
      this.loading.update(real, this.progress);
      this.renderer.render(this.loadScene, this.camera);
      if (this.loading.finished && this.progress >= 1) this.enterGame();
      this.input.endFrame(); return;
    }
    if (this.state !== 'game') { this.renderer.render(this.scene, this.camera); return; }
    const slow = this.tear.slowmo > 0 ? CONFIG.TEAR.SLOWMO_SCALE : 1;
    const dt = real * slow; this.time += dt;
    this.player.update(dt);
    for (const b of this.bots) b.update(dt);
    for (const c of this.creatures) if (c.alive || c.ghost) c.update(dt, this.time); else c.tag.visible = false;
    this.tear.update(dt); this.phys.update(dt); this.gore.update(dt); this.decals.update(dt);
    const hands = [];
    for (const c of this.creatures) if (c.alive && !c.ghost) for (let i = 0; i < 2; i++) hands.push({ pos: c.handWorld[i], vel: c.handVel[i] });
    this.map.update(dt, this.time, hands);
    this.modes.update(dt);
    const ph = this.player.creature.handWorld;
    this.computer.update(dt, [ph[0], ph[1]]); this.shop.update(dt, [ph[0], ph[1]], this.time);
    // monster growl loops + chase music
    let nearest = 1e9; const me = this.player.creature;
    for (const c of this.creatures) {
      let gl = this.growls.get(c);
      if (c.monster && c.alive) { if (!gl) { gl = this.audio.play('growl', c.headPos, { volume: 0.5, loop: true }); if (gl) this.growls.set(c, gl); } gl?.setPos(c.headPos); if (c !== me) nearest = Math.min(nearest, c.headPos.distanceTo(me.headPos)); }
      else if (gl) { gl.stop(); this.growls.delete(c); }
      // crawler pounce pins survivors it lands on
      if (c.monster && c.pounceT > 0) { if (!c.isLocal) c.pounceT -= dt; for (const o of this.creatures) if (!o.monster && o.alive && o.bodyCenter().distanceTo(c.bodyCenter()) < c.radius + 0.45) { if (o.isLocal) this.player.loco.stunned = 1; else if (o.bot) o.bot.stun = 1; } }
    }
    this.audio.setChase(!me.monster && me.alive && !me.ghost ? Math.max(0, 1 - nearest / CONFIG.CHASE_MUSIC_RANGE) : 0);
    this.audio.update();
    // effects & toasts
    if (this.fx) { for (const f of this.fx) { f.t += real; const k = Math.min(1, f.t / f.d); f.f(f.o, k); if (k >= 1) f.o.removeFromParent(); } this.fx = this.fx.filter(f => f.t < f.d); }
    for (const tt of this.toasts) { tt.t -= real; tt.m.material.opacity = Math.min(1, tt.t * 2); if (tt.t <= 0) tt.m.removeFromParent(); }
    this.toasts = this.toasts.filter(x => x.t > 0); this.toasts.forEach((x, i) => x.m.position.y = 0.12 - i * 0.11);
    // shards for playing, auto gore reduction if frames drop
    this.minuteT += real; if (this.minuteT >= 60) { this.minuteT = 0; this.addShards(CONFIG.SHARDS_PER_MINUTE, 'PLAYED'); }
    const F = this.fps; F.acc += real; F.n++;
    if (F.acc > 1) { const avg = F.acc / F.n; if (avg > 1 / 66) { this.gore.quality = Math.max(0.3, this.gore.quality - 0.15); } else if (avg < 1 / 80) this.gore.quality = Math.min(1, this.gore.quality + 0.05); F.acc = 0; F.n = 0; }
    this.botTearMult = { EASY: 0.7, NORMAL: 1, HARD: 1.3 }[this.save.data.botDifficulty] || 1;
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
