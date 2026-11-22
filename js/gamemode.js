// TORN - GameModeManager. Rounds loop on their own: WAITING -> COUNTDOWN (5 s) -> PLAYING -> ROUND OVER (10 s) -> ...
// CASUAL (free roam), INFECTION (torn survivors turn into monsters), MONSTER HUNT (one monster, dead = ghosts).
// Also: respawn "stitch-up" (parts fly back + glowing needle), infection transform, and the big mode screen.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { planarUV } from './models.js';

const MON_TYPES = ['BUTCHER', 'STITCHFACE', 'CRAWLER'];

export class GameModeManager {
  constructor(game) {
    this.game = game; this.mode = game.save.data.mode; this.state = 'WAITING'; this.timer = 0; this.round = 0; this.huntIndex = 0;
    this.message = ''; this.winners = []; this.static = 0; this.lastBeep = -1;
    this.needles = []; this.jobs = [];
    // mode screen canvas
    const scr = game.map.modeScreen?.getObjectByName('screen');
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 384; this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    if (scr && scr.isMesh) { if (!scr.geometry.attributes.uv) planarUV(scr, 'xy'); scr.material = new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide }); }
    this.drawT = 0;
    game.events.on('killed', (v, how) => this.onKilled(v, how));
    game.events.on('armLost', (v) => { if (!v.armsPresent[0] && !v.armsPresent[1]) this.onKilled(v, 'arms'); });
  }
  get players() { return this.game.creatures; }
  survivors() { return this.players.filter(c => !c.monster && c.alive && !c.ghost && !c.infecting && !(this.mode === 'INFECTION' && c.doomed)); }
  setMode(m) { this.mode = m; this.game.save.set('mode', m); this.endRound(true); }
  // ------------------------------------------------------------------ round flow
  update(dt) {
    this.timer -= dt; this.static = Math.max(0, this.static - dt);
    const n = this.players.length;
    if (this.mode === 'CASUAL') { if (this.state !== 'CASUAL') { this.resetAll(); this.state = 'CASUAL'; this.message = 'FREE ROAM'; } }
    else if (this.state === 'CASUAL' || this.state === 'WAITING') { if (n >= 2) this.startCountdown(); else this.state = 'WAITING'; }
    else if (this.state === 'COUNTDOWN') {
      const s = Math.ceil(this.timer); if (s !== this.lastBeep && s <= 5 && s > 0) { this.lastBeep = s; this.game.audio?.play('beep', null, { volume: 0.5 }); }
      if (this.timer <= 0) this.startRound();
    } else if (this.state === 'PLAYING') {
      this.checkWin();
      if (this.state === 'PLAYING' && this.timer <= 0) this.timeUp();
    } else if (this.state === 'ROUND_OVER' && this.timer <= 0) this.startCountdown();
    this.updateRespawns(dt); this.updateInfections();
    this.drawT -= dt; if (this.drawT <= 0) { this.drawT = 0.1; this.draw(); }
  }
  startCountdown() {
    this.state = 'COUNTDOWN'; this.timer = CONFIG.COUNTDOWN; this.lastBeep = -1; this.static = 0.6;
    this.message = this.mode === 'INFECTION' ? 'INFECTION' : 'MONSTER HUNT';
    this.resetAll();
  }
  // everyone regrows: torn parts fly back and get stitched up; monsters turn back into survivors
  resetAll() {
    const G = this.game;
    for (const c of this.players) {
      c.doomed = false; c.infecting = 0;
      if (c.ghost) c.setGhost(false);
      if (c.monster) { c.setMonster(null); }
      G.tear.releaseAll(c);
      const damaged = !c.alive || c.surv.headless || c.surv.split || !c.armsPresent[0] || !c.armsPresent[1];
      if (damaged) this.respawn(c, null); else if (c.bot) c.bot.blind = 0;
    }
    G.decals.clearBodyDecals();
  }
  startRound() {
    const G = this.game; this.state = 'PLAYING'; this.round++; this.static = 0.5;
    const list = this.players;
    let mon;
    if (this.mode === 'INFECTION') { mon = list[Math.floor(Math.random() * list.length)]; this.timer = CONFIG.INFECTION_TIME; }
    else { mon = list[this.huntIndex % list.length]; this.huntIndex++; this.timer = CONFIG.HUNT_TIME; }
    const type = mon.isLocal ? this.playerMonsterChoice() : MON_TYPES[Math.floor(Math.random() * (G.save.level >= CONFIG.CRAWLER_UNLOCK_LEVEL ? 3 : 2))];
    mon.setMonster(type);
    if (mon.bot) mon.bot.spawnAt(mon.bot.pos);
    if (this.mode === 'HUNT') { if (mon.bot) mon.bot.blind = CONFIG.HUNT_BLINDFOLD; if (mon.isLocal) G.player.blindfold(CONFIG.HUNT_BLINDFOLD); }
    G.audio?.play('siren', null, { volume: 0.45 });
    this.message = (mon.isLocal ? 'YOU ARE ' : mon.name + ' IS ') + CONFIG.MONSTERS[type].label;
    G.toast(mon.isLocal ? 'YOU ARE THE MONSTER' : mon.name + ' IS THE MONSTER', mon.isLocal ? '#FF3030' : '#F0EBE1');
  }
  playerMonsterChoice() {
    const G = this.game; let t = G.save.data.monster;
    if (this.mode === 'INFECTION') t = MON_TYPES[Math.floor(Math.random() * 3)];
    if (t === 'CRAWLER' && G.save.level < CONFIG.CRAWLER_UNLOCK_LEVEL) t = 'BUTCHER';
    return t;
  }
  checkWin() {
    const surv = this.survivors();
    const monsters = this.players.filter(c => c.monster);
    if (!monsters.length) return;
    if (this.mode === 'INFECTION') {
      if (surv.length === 0) this.endRound(false, 'MONSTERS WIN', monsters);
      else if (surv.length === 1 && this.players.length > 2) this.endRound(false, surv[0].name + ' SURVIVED!', surv);
    } else if (surv.length === 0) this.endRound(false, 'THE MONSTER WINS', monsters);
  }
  timeUp() { const s = this.survivors(); if (s.length) this.endRound(false, this.mode === 'HUNT' ? 'SURVIVORS WIN' : s.map(x => x.name).slice(0, 2).join(' & ') + ' SURVIVED!', s); else this.endRound(false, 'MONSTERS WIN', this.players.filter(c => c.monster)); }
  endRound(silent, msg = '', winners = []) {
    const G = this.game;
    if (silent) { this.state = 'WAITING'; this.timer = 0; return; }
    this.state = 'ROUND_OVER'; this.timer = CONFIG.ROUND_OVER; this.message = msg; this.winners = winners; this.static = 1;
    const won = winners.includes(G.player.creature);
    G.audio?.play(won ? 'win' : 'lose', null, { volume: 0.7 });
    if (won) G.addShards(CONFIG.SHARDS_PER_WIN, 'ROUND WON');
    G.toast(msg, won ? '#3CFF6E' : '#F0EBE1');
  }
  // ------------------------------------------------------------------ deaths
  onKilled(v, how) {
    if (this.state !== 'PLAYING' || v.monster) return;
    const G = this.game;
    if (this.mode === 'INFECTION') {
      v.doomed = true;
      setTimeout(() => { if (this.state === 'PLAYING' && v.doomed) this.respawn(v, () => this.infect(v)); }, 2000);
    } else if (this.mode === 'HUNT') {
      if (how === 'arms') return; // armless survivors stay alive (a teammate can drag them)
      setTimeout(() => { if (this.state === 'PLAYING') this.makeGhost(v); }, 1500);
    }
  }
  makeGhost(v) {
    const G = this.game;
    this.respawn(v, () => { v.setGhost(true); v.alive = true; v.ghost = true; G.audio?.play('ghost', v.headPos, { volume: 0.6 }); if (v.isLocal) G.toast('YOU ARE A GHOST - FLY WITH THE STICK', '#BFE3FF'); });
  }
  infect(v) {
    // survivor swells, darkens and stretches for 3 s with cracking sounds, eyes start glowing (runs in update)
    const base = new Map(); for (const m of v.skinMats) base.set(m, m.color.clone());
    v.infecting = 3; v.doomed = false;
    for (const e of v.surv.eyes) e.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#FFD23F'); } });
    this.jobs.push({ v, start: this.game.time, base });
  }
  updateInfections() {
    const G = this.game;
    for (const J of this.jobs) {
      const v = J.v, k = Math.min(1, (G.time - J.start) / 3);
      v.surv.group.scale.set(1 + 0.5 * k, 1 + 0.6 * k, 1 + 0.5 * k);
      for (const [m, c] of J.base) m.color.copy(c).lerp(new THREE.Color('#3a2e2a'), k);
      for (const e of v.surv.eyes) e.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = 3 * k; });
      if (Math.random() < 0.12) G.audio?.play('bone', v.headPos, { volume: 0.5, rate: 0.7 });
      if (k >= 1) {
        J.done = true; v.surv.group.scale.set(1, 1, 1); for (const [m, c] of J.base) m.color.copy(c);
        if (this.state !== 'PLAYING') { v.infecting = 0; continue; }
        const types = MON_TYPES.slice(0, v.isLocal && G.save.level < CONFIG.CRAWLER_UNLOCK_LEVEL ? 2 : 3);
        v.setMonster(types[Math.floor(Math.random() * types.length)]); v.infecting = 0; v.anim.transform = 0.6;
        if (v.isLocal) G.toast('YOU ARE INFECTED', '#FF3030');
      }
    }
    this.jobs = this.jobs.filter(j => !j.done);
  }
  // ------------------------------------------------------------------ respawn stitch-up (1.5 s)
  respawn(c, then) {
    const G = this.game;
    if (c.respawning) return;
    c.respawning = true;
    const home = c.bot ? c.bot.pos.clone() : c.headPos.clone().add(new THREE.Vector3(0, -CONFIG.BODY_OFFSET, 0));
    // dead body parts left on the floor: respawn where the torso ended up
    const bodies = G.phys.bodies.filter(b => b.owner === c && !b.dead);
    const torsoBody = bodies.find(b => b.info.kind === 'torso' || b.info.kind === 'half');
    if (torsoBody && !c.isLocal) home.copy(torsoBody.center()).setY(Math.max(torsoBody.center().y, 0) + CONFIG.BODY_RADIUS + 0.05);
    const flying = [];
    for (const b of bodies) { b.frozen = true; for (const bi of b.bind) flying.push({ o: bi.obj, from: bi.obj.position.clone(), q: bi.obj.quaternion.clone() }); }
    this.needles.push({ c, t: 0, flying, home, then, built: false, bodies });
  }
  updateRespawns(dt) {
    const G = this.game;
    for (const R of this.needles) {
      R.t += dt;
      const k = Math.min(1, R.t / 0.9);
      const e = k * k * (3 - 2 * k);
      const dest = R.home.clone().add(new THREE.Vector3(0, 0.1, 0));
      for (const f of R.flying) { f.o.position.lerpVectors(f.from, dest, e); f.o.scale.setScalar(1 - 0.5 * e); }
      if (R.t >= 0.9 && !R.built) {
        R.built = true;
        for (const b of R.bodies) G.phys.kill(b);
        const c = R.c;
        c.buildSurvivor(); c.alive = true; c.downed = false;
        if (c.bot) { c.bot.spawnAt(R.home); }
        c.headPos.copy(R.home).add(new THREE.Vector3(0, CONFIG.BODY_OFFSET, 0)); c.prevHead.copy(c.headPos);
        if (c.isLocal) G.player.onRespawn();
        // glowing needle zips along each seam
        R.needle = G.models.get('respawn_needle'); R.needle.scale.setScalar(2); G.scene.add(R.needle);
        const lineGeo = new THREE.BufferGeometry(); R.linePts = []; R.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
        G.scene.add(R.line); G.audio?.play('click', R.home, { volume: 0.6, rate: 0.5 }); G.gore.mist(R.home, true);
      }
      if (R.built && R.needle) {
        const c = R.c, s = Math.min(1, (R.t - 0.9) / 0.6);
        const center = c.surv.torso.getWorldPosition(new THREE.Vector3());
        const yawQ = c.surv.torso.getWorldQuaternion(new THREE.Quaternion());
        // seam path: around the neck, both shoulders, down the centre seam
        const a = s * Math.PI * 2 * 3;
        let p;
        if (s < 0.33) p = new THREE.Vector3(Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.06);
        else if (s < 0.66) { const side = s < 0.5 ? 1 : -1; p = new THREE.Vector3(side * 0.17, 0.115 + Math.sin(a) * 0.04, Math.cos(a) * 0.04); }
        else p = new THREE.Vector3(0, 0.2 - (s - 0.66) / 0.34 * 0.38, -0.145);
        p.applyQuaternion(yawQ).add(center);
        R.needle.position.copy(p); R.needle.lookAt(center); R.needle.rotateY(Math.PI / 2);
        R.linePts.push(p.clone()); R.line.geometry.setFromPoints(R.linePts);
        R.line.material.opacity = 1 - Math.max(0, s - 0.7) / 0.3;
      }
      if (R.t >= 1.5) {
        if (R.needle) { R.needle.removeFromParent(); R.line.removeFromParent(); }
        R.c.respawning = false; R.done = true; if (R.then) R.then();
      }
    }
    this.needles = this.needles.filter(r => !r.done);
  }
  // ------------------------------------------------------------------ the big CRT
  draw() {
    const g = this.ctx, W = 512, H = 384;
    g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
    if (this.static > 0) { const img = g.createImageData(W / 4, H / 4); for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255 * Math.min(1, this.static * 1.5); } const c2 = document.createElement('canvas'); c2.width = W / 4; c2.height = H / 4; c2.getContext('2d').putImageData(img, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(c2, 0, 0, W, H); }
    g.fillStyle = '#F0EBE1'; g.textAlign = 'center'; g.font = 'bold 54px "Courier New", monospace';
    const label = { CASUAL: 'CASUAL', INFECTION: 'INFECTION', HUNT: 'MONSTER HUNT' }[this.mode];
    g.fillText(label, W / 2, 70);
    g.font = 'bold 30px "Courier New", monospace';
    const st = { WAITING: 'WAITING FOR PLAYERS', COUNTDOWN: 'STARTING IN ' + Math.max(0, Math.ceil(this.timer)), PLAYING: 'TIME ' + fmt(this.timer), ROUND_OVER: 'ROUND OVER', CASUAL: 'NO MONSTERS. HANG OUT.' }[this.state] || '';
    g.fillText(st, W / 2, 130);
    const mons = this.players.filter(c => c.monster).map(c => c.name);
    g.fillStyle = '#FF3a3a'; g.font = 'bold 28px "Courier New", monospace';
    if (this.state === 'PLAYING' && mons.length) { g.fillText('MONSTER: ' + mons.slice(0, 3).join(', ') + (mons.length > 3 ? ' +' + (mons.length - 3) : ''), W / 2, 190); }
    g.fillStyle = '#F0EBE1'; g.font = 'bold 26px "Courier New", monospace';
    wrap(g, this.state === 'PLAYING' ? 'SURVIVORS LEFT: ' + this.survivors().length : this.message, W / 2, 250, 470, 32);
    g.font = '20px "Courier New", monospace'; g.fillStyle = '#9a9a96';
    g.fillText('ROOM ' + this.game.net.room + '  -  ' + this.players.length + '/' + CONFIG.ROOM_MAX, W / 2, 350);
    for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, W, 2); }
    this.tex.needsUpdate = true;
  }
}
const fmt = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function wrap(g, text, x, y, maxW, lh) { const words = String(text).split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t; } g.fillText(line, x, y); }
