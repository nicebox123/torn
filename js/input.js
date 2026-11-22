// TORN - input: Quest controllers in VR, or a desktop test mode (mouse + keyboard) so you can try things on a PC.
// hands[0] = LEFT, hands[1] = RIGHT. Positions/rotations are world space.
import * as THREE from 'three';

export class Input {
  constructor(renderer, camera, rig, dom) {
    this.renderer = renderer; this.camera = camera; this.rig = rig; this.dom = dom;
    this.hands = [0, 1].map(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), local: new THREE.Vector3(), grip: false, trigger: false, a: false, b: false,
      stick: { x: 0, y: 0 }, gripDown: false, gripUp: false, trigDown: false, aDown: false, bDown: false, connected: false, vel: new THREE.Vector3(), prev: new THREE.Vector3(), source: null }));
    this.head = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), local: new THREE.Vector3() };
    this.grips = [];
    for (let i = 0; i < 2; i++) {
      const g = renderer.xr.getControllerGrip(i); rig.add(g); this.grips.push(g);
      g.addEventListener('connected', e => { const idx = e.data.handedness === 'left' ? 0 : 1; this.hands[idx].source = e.data; this.hands[idx].grip3d = g; this.hands[idx].connected = true; });
      g.addEventListener('disconnected', () => { for (const h of this.hands) if (h.grip3d === g) { h.connected = false; h.source = null; } });
    }
    // desktop
    this.keys = new Set(); this.mouse = { l: false, r: false, dx: 0, dy: 0, wheel: 0 }; this.yaw = Math.PI / 2; this.pitch = 0; this.reach = [0, 0]; this.spread = 0;
    this.pressed = new Set();
    addEventListener('keydown', e => { if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    dom.addEventListener('mousedown', e => { if (document.pointerLockElement !== dom && this.desktop) { try { dom.requestPointerLock?.()?.catch?.(() => {}); } catch (err) { } return; } if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true; });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('mousemove', e => { if (document.pointerLockElement === dom) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    this.desktop = false;
  }
  get xr() { return this.renderer.xr.isPresenting; }
  down(code) { return this.pressed.has(code); }
  haptic(i, intensity, ms) {
    const h = this.hands[i]; const gp = h.source?.gamepad; const act = gp?.hapticActuators?.[0];
    try { if (act?.pulse) act.pulse(Math.min(1, intensity), ms); else if (gp?.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity }); } catch (e) { }
  }
  update(dt) {
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.head.pos); this.camera.getWorldQuaternion(this.head.quat); this.head.local.copy(this.camera.position);
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i]; const wasGrip = h.grip, wasTrig = h.trigger, wasA = h.a, wasB = h.b;
      if (this.xr && h.connected && h.grip3d) {
        h.grip3d.updateMatrixWorld(true);
        h.grip3d.getWorldPosition(h.pos); h.grip3d.getWorldQuaternion(h.quat); h.local.copy(h.grip3d.position);
        const gp = h.source?.gamepad;
        if (gp) {
          h.trigger = (gp.buttons[0]?.value || 0) > 0.6; h.grip = (gp.buttons[1]?.value || 0) > 0.55;
          h.a = !!gp.buttons[4]?.pressed; h.b = !!gp.buttons[5]?.pressed;
          h.stick.x = gp.axes[2] || 0; h.stick.y = gp.axes[3] || 0;
        }
      } else if (this.desktop) this.desktopHand(i, h);
      h.gripDown = h.grip && !wasGrip; h.gripUp = !h.grip && wasGrip; h.trigDown = h.trigger && !wasTrig; h.aDown = h.a && !wasA; h.bDown = h.b && !wasB;
      h.vel.subVectors(h.pos, h.prev).divideScalar(Math.max(dt, 1e-4)); h.prev.copy(h.pos);
    }
  }
  // desktop test mode: mouse look; hold left/right mouse = reach + grip that hand; Q/E pulls hands apart; wheel = reach
  desktopUpdateLook() {
    this.yaw -= this.mouse.dx * 0.0025; this.pitch -= this.mouse.dy * 0.0025; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    this.mouse.dx = this.mouse.dy = 0;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.mouse.wheel) { this.extra = Math.max(-0.1, Math.min(0.35, (this.extra || 0) - this.mouse.wheel * 0.05)); this.mouse.wheel = 0; }
  }
  desktopHand(i, h) {
    const want = i === 0 ? this.mouse.l : this.mouse.r;
    this.reach[i] += ((want ? 0.32 : 0) - this.reach[i]) * 0.25;
    const spreadKey = this.keys.has('KeyQ') || this.keys.has('KeyE');
    this.spread += ((spreadKey ? 0.35 : 0) - this.spread) * (spreadKey ? 0.06 : 0.3);
    const side = i === 0 ? -1 : 1;
    const off = new THREE.Vector3(side * (0.18 + this.spread), -0.22 + (this.keys.has('KeyE') ? this.spread * 0.6 : 0) * (i === 1 ? 1 : 0), -0.3 - this.reach[i] - (this.extra || 0));
    h.pos.copy(off.applyQuaternion(this.head.quat)).add(this.head.pos);
    h.quat.copy(this.head.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.4)));
    h.grip = want; h.trigger = this.keys.has('KeyR'); h.a = false; h.b = this.keys.has('KeyV');
    h.connected = true;
  }
  endFrame() { this.pressed.clear(); }
}
