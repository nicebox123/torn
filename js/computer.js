// TORN - ComputerUI. The chunky terminal at spawn. Every key is a physical object you press with your hands.
// Pages: ROOM, NAME, COLOR, MODE, MONSTER, MIC, GORE, TURN, INFO. Arrow keys switch pages. Everything is saved.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { isNameAllowed, randomSubjectName, cleanTyped } from './namefilter.js';
import { planarUV } from './models.js';

const PAGES = ['ROOM', 'NAME', 'COLOR', 'MODE', 'MONSTER', 'MIC', 'GORE', 'TURN', 'INFO'];
const LABELS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'ENTER', 'DELETE', 'LEFT', 'RIGHT', 'SPACE'];

export class ComputerUI {
  constructor(game, terminal) {
    this.game = game; this.term = terminal; this.page = 0; this.buf = ''; this.msg = ''; this.msgT = 0; this.channel = 0; this.sel = -1;
    this.keys = [];
    for (const L of LABELS) {
      const k = terminal?.getObjectByName('key_' + L); if (!k) continue;
      const box = new THREE.Box3().setFromObject(k); // world box at load (for size)
      const inv = new THREE.Matrix4().copy(k.matrixWorld).invert();
      const lb = box.clone().applyMatrix4(inv);
      this.keys.push({ label: L, obj: k, baseY: k.position.y, half: Math.max(0.03, (lb.max.x - lb.min.x) / 2), down: 0, held: [false, false] });
    }
    const scr = terminal?.getObjectByName('screen');
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 384; this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    if (scr && scr.isMesh) { if (!scr.geometry.attributes.uv) planarUV(scr, 'xy'); scr.material = new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide }); }
    this.dirty = true; this.cool = [0, 0];
  }
  get S() { return this.game.save.data; }
  say(m, t = 3) { this.msg = m; this.msgT = t; this.dirty = true; }
  // ------------------------------------------------------------------ input
  press(L) {
    const G = this.game, S = this.S, page = PAGES[this.page];
    G.audio?.play('click', this.term ? this.term.getWorldPosition(new THREE.Vector3()) : null, { volume: 0.8 });
    this.dirty = true;
    if (L === 'LEFT' || L === 'RIGHT') { this.page = (this.page + (L === 'LEFT' ? -1 : 1) + PAGES.length) % PAGES.length; this.buf = ''; this.sel = -1; return; }
    const isChar = L.length === 1, isDigit = /^[0-9]$/.test(L);
    switch (page) {
      case 'ROOM':
        if (isChar && this.buf.length < 10) this.buf += L;
        else if (L === 'DELETE') this.buf = this.buf.slice(0, -1);
        else if (L === 'ENTER') { const code = cleanTyped(this.buf, 10).replace(/ /g, ''); G.joinRoom(code || 'PUBLIC'); this.say(code ? 'JOINED ' + code : 'BACK TO PUBLIC'); this.buf = ''; }
        else if (L === 'SPACE') { G.joinRoom('PUBLIC'); this.say('LEFT ROOM - PUBLIC LOBBY'); this.buf = ''; }
        break;
      case 'NAME':
        if ((isChar || L === 'SPACE') && this.buf.length < 12) this.buf += L === 'SPACE' ? ' ' : L;
        else if (L === 'DELETE') this.buf = this.buf.slice(0, -1);
        else if (L === 'ENTER') {
          const n = cleanTyped(this.buf, 12).trim();
          if (!n) { this.say('TYPE A NAME FIRST'); break; }
          if (isNameAllowed(n)) { G.setPlayerName(n); this.say('NAME SET: ' + n); }
          else { const r = randomSubjectName(); G.setPlayerName(r); this.say('NAME NOT ALLOWED', 4); }
          this.buf = '';
        }
        break;
      case 'COLOR':
        if (L === 'R' || L === 'G' || L === 'B') this.channel = 'RGB'.indexOf(L);
        else if (isDigit) { const c = S.color.slice(); c[this.channel] = +L; G.save.set('color', c); G.player.creature.setColor(c); this.channel = (this.channel + 1) % 3; }
        break;
      case 'MODE':
        if ('123'.includes(L)) { const m = ['CASUAL', 'INFECTION', 'HUNT'][+L - 1]; G.modes.setMode(m); this.say('MODE: ' + (m === 'HUNT' ? 'MONSTER HUNT' : m)); }
        if (L === 'E' || L === 'N' || L === 'H') { G.save.set('botDifficulty', { E: 'EASY', N: 'NORMAL', H: 'HARD' }[L]); this.say('BOTS: ' + S.botDifficulty); }
        break;
      case 'MONSTER':
        if ('123'.includes(L)) {
          const m = ['BUTCHER', 'STITCHFACE', 'CRAWLER'][+L - 1];
          if (m === 'CRAWLER' && G.save.level < CONFIG.CRAWLER_UNLOCK_LEVEL) { this.say('LOCKED - REACH LEVEL ' + CONFIG.CRAWLER_UNLOCK_LEVEL); break; }
          G.save.set('monster', m); this.say('MONSTER: ' + m);
        }
        break;
      case 'MIC':
        if ('123'.includes(L)) { const m = ['ALL CHAT', 'PUSH TO TALK', 'OFF'][+L - 1]; G.save.set('mic', m); G.setMic(m); this.say('MIC: ' + m); }
        break;
      case 'GORE':
        if ('123'.includes(L)) { const m = ['FULL', 'LOW', 'OFF'][+L - 1]; G.save.set('gore', m); this.say('GORE: ' + m); }
        break;
      case 'TURN':
        if (L === 'S' || L === 'M' || L === 'N') { G.save.set('turn', { S: 'SNAP', M: 'SMOOTH', N: 'NONE' }[L]); }
        else if (isDigit) G.save.set('turnSpeed', +L);
        else if (L === 'V') G.save.set('vignette', !S.vignette);
        else if (L === 'Z') G.save.set('seated', !S.seated);
        else if (L === 'U') G.save.set('heightAdjust', Math.min(0.2, +(S.heightAdjust + 0.05).toFixed(2)));
        else if (L === 'D') G.save.set('heightAdjust', Math.max(-0.2, +(S.heightAdjust - 0.05).toFixed(2)));
        break;
      case 'INFO': {
        const list = G.creatures.filter(c => !c.isLocal);
        if (isDigit && +L >= 1 && +L <= list.length) this.sel = +L - 1;
        else if (L === 'M' && this.sel >= 0) { const n = list[this.sel].name; const muted = new Set(S.muted); muted.has(n) ? muted.delete(n) : muted.add(n); G.save.set('muted', [...muted]); this.say(muted.has(n) ? 'MUTED ' + n : 'UNMUTED ' + n); }
        else if (L === 'R' && this.sel >= 0) { const n = list[this.sel].name; G.net.report(n, 'player report'); this.say('REPORTED ' + n + '. THANK YOU.'); }
        break;
      }
    }
  }
  // fingertip contact with the physical keys
  update(dt, hands) {
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) { this.msg = ''; this.dirty = true; } }
    this.cool[0] -= dt; this.cool[1] -= dt;
    if (!this.term) return;
    const kb = this.term.getObjectByName('keyboard');
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(kb.getWorldQuaternion(new THREE.Quaternion()));
    const near = hands.some(h => h && h.distanceTo(this.term.position) < 1.8);
    for (const k of this.keys) {
      if (k.down > 0) { k.down -= dt; k.obj.position.y = k.baseY - 0.015 * Math.min(1, k.down / 0.06 + 0.3); } else k.obj.position.y = k.baseY;
      if (!near) continue;
      const top = k.obj.localToWorld(new THREE.Vector3(0, 0.03, 0));
      hands.forEach((h, i) => {
        if (!h) return;
        const rel = h.clone().sub(top); const along = rel.dot(up); const lat = rel.addScaledVector(up, -along).length();
        const touching = lat < k.half * 0.9 && along < CONFIG.HAND_RADIUS + 0.005 && along > -0.04;
        if (touching && !k.held[i] && this.cool[i] <= 0) { k.held[i] = true; k.down = 0.15; this.cool[i] = 0.12; this.press(k.label); this.game.haptic(this.game.player?.creature, i, 0.35, 25); }
        else if (!touching && (along > 0.1 || lat > k.half + 0.03)) k.held[i] = false;
      });
    }
    if (this.dirty) { this.draw(); this.dirty = false; }
  }
  pressFromRay(ray) {
    if (!this.term) return false;
    const hits = ray.intersectObjects(this.keys.map(k => k.obj), true);
    if (!hits.length) return false;
    let o = hits[0].object; while (o && !this.keys.find(k => k.obj === o)) o = o.parent;
    const k = this.keys.find(k => k.obj === o); if (!k) return false;
    k.down = 0.15; this.press(k.label); return true;
  }
  // ------------------------------------------------------------------ screen
  draw() {
    const g = this.ctx, W = 512, H = 384, S = this.S, G = this.game, page = PAGES[this.page];
    g.fillStyle = PALETTE.screenBg; g.fillRect(0, 0, W, H);
    g.fillStyle = PALETTE.screenText; g.font = 'bold 22px "Courier New", monospace'; g.textAlign = 'left';
    g.fillText('< ' + page + ' >', 16, 32); g.textAlign = 'right'; g.fillText((this.page + 1) + '/' + PAGES.length, W - 16, 32); g.textAlign = 'left';
    g.fillRect(16, 42, W - 32, 2);
    g.font = '20px "Courier New", monospace';
    const L = (t, y, big) => { g.font = (big ? 'bold 26px' : '20px') + ' "Courier New", monospace'; g.fillText(t, 20, y); };
    const opt = (items, cur, y) => items.forEach((it, i) => L((it === cur ? '> ' : '  ') + (i + 1) + ' ' + it, y + i * 30, it === cur));
    switch (page) {
      case 'ROOM': L('ROOM: ' + G.net.room + ' - ' + G.creatures.length + '/' + CONFIG.ROOM_MAX, 84, true); L('TYPE A CODE (10 MAX):', 130); L('[' + this.buf.padEnd(10, '_') + ']', 166, true); L('ENTER = JOIN / CREATE', 216); L('SPACE = LEAVE (PUBLIC)', 244); L('DELETE = BACKSPACE', 272); break;
      case 'NAME': L('NAME: ' + S.name, 84, true); L('TYPE A NEW NAME (12 MAX):', 130); L('[' + this.buf.padEnd(12, '_') + ']', 166, true); L('ENTER = SAVE   DELETE = BACK', 216); break;
      case 'COLOR': {
        L('PRESS R, G OR B THEN 0-9', 80);
        ['R', 'G', 'B'].forEach((c, i) => { L((this.channel === i ? '> ' : '  ') + c + ': ' + S.color[i], 120 + i * 34, this.channel === i); g.fillRect(150, 104 + i * 34, S.color[i] * 18, 18); });
        const tint = new THREE.Color(S.color[0] / 9, S.color[1] / 9, S.color[2] / 9).multiply(new THREE.Color(PALETTE.skin));
        g.fillStyle = '#' + tint.getHexString(); g.fillRect(360, 100, 120, 120); g.strokeStyle = PALETTE.screenText; g.strokeRect(360, 100, 120, 120); g.fillStyle = PALETTE.screenText;
        L('PREVIEW', 240); break;
      }
      case 'MODE': opt(['CASUAL', 'INFECTION', 'MONSTER HUNT'], { CASUAL: 'CASUAL', INFECTION: 'INFECTION', HUNT: 'MONSTER HUNT' }[S.mode], 84); L('BOTS: ' + S.botDifficulty + '  (E/N/H)', 200); L('NOW: ' + G.modes.state, 236); break;
      case 'MONSTER': { const lv = G.save.level; opt(['BUTCHER', 'STITCHFACE', 'CRAWLER' + (lv < CONFIG.CRAWLER_UNLOCK_LEVEL ? ' (LOCKED)' : '')], S.monster === 'CRAWLER' ? 'CRAWLER' : S.monster, 84); L('USED IN MONSTER HUNT', 200); L('LEVEL ' + lv + '  XP ' + S.xp + '/' + lv * CONFIG.XP_PER_LEVEL, 236); L('CRAWLER UNLOCKS AT LEVEL ' + CONFIG.CRAWLER_UNLOCK_LEVEL, 264); break; }
      case 'MIC': opt(['ALL CHAT', 'PUSH TO TALK', 'OFF'], S.mic, 84); L('PUSH TO TALK: HOLD B / Y', 200); L('(VOICE CHAT ARRIVES IN PHASE 2)', 228); break;
      case 'GORE': opt(['FULL', 'LOW', 'OFF'], S.gore, 84); L('OFF = STUFFED TOY MODE', 200); break;
      case 'TURN': L('S SNAP   M SMOOTH   N NONE', 80); L('TURN: ' + S.turn + '   SPEED: ' + S.turnSpeed + ' (0-9)', 116, true); L('V VIGNETTE: ' + (S.vignette ? 'ON' : 'OFF'), 160); L('Z SEATED MODE: ' + (S.seated ? 'ON' : 'OFF'), 190); L('U/D HEIGHT: ' + (S.heightAdjust >= 0 ? '+' : '') + S.heightAdjust.toFixed(2) + ' M', 220); break;
      case 'INFO': {
        const list = G.creatures.filter(c => !c.isLocal);
        L('PLAYERS (PRESS 1-9):', 76);
        list.slice(0, 9).forEach((c, i) => { const muted = S.muted.includes(c.name); L((this.sel === i ? '> ' : '  ') + (i + 1) + ' ' + c.name.padEnd(12) + (muted ? ' [MUTED]' : '') + (c.monster ? ' *' : ''), 104 + i * 22, false); });
        L('M = MUTE   R = REPORT', 316); break;
      }
    }
    g.font = 'bold 20px "Courier New", monospace';
    if (this.msg) { g.fillStyle = this.msg.includes('NOT') || this.msg.includes('LOCK') ? '#FF4A3A' : PALETTE.screenText; g.fillText(this.msg, 20, 350); }
    g.fillStyle = PALETTE.screenText; g.textAlign = 'right'; g.fillText('SHARDS ' + S.shards + '  LV ' + G.save.level, W - 16, 374); g.textAlign = 'left';
    for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y, W, 1); }
    this.tex.needsUpdate = true;
  }
}
