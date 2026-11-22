// TORN - NetworkManager. Demo = fake/local: a "room" is just a seeded set of bots.
// Phase 2 swaps this file for a real backend (same method names), so the rest of the game doesn't change.
import { BOT_NAMES, CONFIG } from './config.js';

export function hashCode(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }

export class NetworkManager {
  constructor() { this.room = 'PUBLIC'; this.isPublic = true; this.listeners = []; this.reports = []; }
  onRoomChange(fn) { this.listeners.push(fn); }
  // Returns the bot roster for the room (names/colors) — deterministic per code, like a real room would be.
  rosterFor(code) {
    const r = rng(hashCode(code + ':torn'));
    const count = code === 'PUBLIC' ? 7 : 3 + Math.floor(r() * 6); // 4–9 players including you
    const names = BOT_NAMES.slice().sort(() => r() - 0.5);
    const bots = [];
    for (let i = 0; i < Math.min(count, CONFIG.ROOM_MAX - 1); i++) {
      bots.push({ name: names[i % names.length], color: [Math.floor(r() * 10), Math.floor(r() * 10), Math.floor(r() * 10)], seed: Math.floor(r() * 1e9) });
    }
    return bots;
  }
  joinRoom(code) {
    this.room = code || 'PUBLIC'; this.isPublic = this.room === 'PUBLIC';
    const roster = this.rosterFor(this.room);
    for (const fn of this.listeners) fn(this.room, roster);
    return roster;
  }
  leaveRoom() { return this.joinRoom('PUBLIC'); }
  report(name, reason) { this.reports.push({ name, reason, room: this.room, t: Date.now() }); console.log('[REPORT]', name, reason, this.room); }
}
