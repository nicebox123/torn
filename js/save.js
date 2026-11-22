// TORN - SaveSettings: everything the Computer changes, plus shards/cosmetics, kept in localStorage.
const KEY = 'torn.save.v1';
const DEFAULTS = {
  name: '', color: [9, 9, 9], mode: 'INFECTION', monster: 'BUTCHER', mic: 'OFF', gore: 'FULL',
  turn: 'SNAP', turnSpeed: 4, vignette: true, seated: false, heightAdjust: 0, botDifficulty: 'NORMAL',
  shards: 0, xp: 0, owned: [], equipped: {}, glowColor: 0, muted: [],
};
export const Save = {
  data: null,
  load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { d = {}; }
    this.data = Object.assign(structuredClone(DEFAULTS), d);
    if (!this.data.name) this.data.name = 'SUBJECT' + Math.floor(1000 + Math.random() * 9000);
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode etc. */ } },
  set(k, v) { this.data[k] = v; this.save(); },
  get level() { return Math.floor(this.data.xp / 100) + 1; },
};
