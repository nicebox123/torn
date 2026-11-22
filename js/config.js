// TORN - tunable numbers and editable lists. Change things here first.
export const CONFIG = {
  // --- player rig
  ARM_REACH_SCALE: 1.3,        // virtual hand offset from shoulder vs your real reach
  SEATED_REACH_SCALE: 1.6,
  ARM_SEG_SCALE: 1.25,         // survivor arm models are stretched this much along their length
  HAND_RADIUS: 0.06,
  HEAD_RADIUS: 0.12,
  BODY_RADIUS: 0.24,           // single body sphere used for world collision (fits 0.6 m vents)
  BODY_OFFSET: 0.2,            // body sphere centre below the eyes
  NAMETAG_HEIGHT: 0.3,

  // --- locomotion stand-in defaults (replace with your locomotion code's values)
  GRAVITY: -9.8,
  MAX_JUMP_SPEED: 6.5,
  JUMP_MULTIPLIER: 1.1,
  VELOCITY_LIMIT: 0.4,
  VELOCITY_HISTORY: 8,
  ONE_ARM_LAUNCH: 0.8,
  MONSTER_SPEED_MULT: 0.88,
  STITCHFACE_SPEED_MULT: 1.12,
  SURFACES: {
    metal:  { slip: 0.0,  jump: 1.0, speed: 1.0, sound: 'metal' },
    dirt:   { slip: 0.0,  jump: 1.0, speed: 1.0, sound: 'dirt' },
    wood:   { slip: 0.0,  jump: 1.0, speed: 1.0, sound: 'wood' },
    slip:   { slip: 0.85, jump: 0.6, speed: 1.0, sound: 'wet' },
    bouncy: { slip: 0.0,  jump: 1.5, speed: 1.0, sound: 'bouncy' },
    sticky: { slip: 0.0,  jump: 0.5, speed: 0.5, sound: 'sticky' },
    climb:  { slip: 0.0,  jump: 1.05, speed: 1.0, sound: 'metal', grip: 0.03 },
  },

  // --- tearing
  TEAR: {
    BREAK_DIST: 0.32,          // extra hand separation needed (m) at tear speed 1
    SPEED_BONUS: 0.18,         // how much pull speed (m/s) counts toward tension
    YANK_SPEED: 3.2,           // one-handed yank needs this hand speed (2x force)
    GRAB_RANGE: 0.14,
    STRUGGLE_TIME: 1.5,        // seconds of hard shaking to break free
    STRUGGLE_SPEED: 1.6,       // controller speed that counts as shaking
    SLOWMO: 0.2, SLOWMO_SCALE: 0.3,
  },
  MONSTERS: {
    BUTCHER:    { tear: 1.6, speed: 0.88, ability: 'ROAR',   cooldown: 20, radius: 0.45, label: 'THE BUTCHER' },
    STITCHFACE: { tear: 0.7, speed: 1.12, ability: 'CRAWL',  cooldown: 15, radius: 0.36, label: 'STITCHFACE' },
    CRAWLER:    { tear: 1.1, speed: 0.92, ability: 'POUNCE', cooldown: 12, radius: 0.34, label: 'THE CRAWLER' },
  },
  CRAWLER_UNLOCK_LEVEL: 5,

  // --- limits
  MAX_PARTS: 20, MAX_ORGANS: 30, MAX_DECALS: 150, MAX_PARTICLES: 500, MAX_POOLS: 12,
  PART_LIFETIME: 60,

  // --- rounds
  COUNTDOWN: 5, ROUND_OVER: 10,
  INFECTION_TIME: 300, HUNT_TIME: 180, HUNT_BLINDFOLD: 10,
  ROOM_MAX: 10,
  CHASE_MUSIC_RANGE: 10,

  // --- economy
  SHARDS_PER_MINUTE: 1, SHARDS_PER_WIN: 10, SHARDS_PER_TEAR: 5, XP_PER_LEVEL: 100,
};

// Cosmetic list. offset/rot/scale are relative to the attach point (hat = top of head, face = front of face).
// Edit these to nudge items on the head.
export const COSMETICS = [
  { id: 'hat_party',        name: 'PARTY HAT',    slot: 'hat',  price: 40,  model: 'hat_party',        offset: [0, -0.01, 0], rot: [0, 0, 0.12], scale: 1 },
  { id: 'hat_hardhat',      name: 'HARD HAT',     slot: 'hat',  price: 60,  model: 'hat_hardhat',      offset: [0, -0.035, 0], rot: [0, 0, 0], scale: 1 },
  { id: 'hat_crown',        name: 'BENT CROWN',   slot: 'hat',  price: 0,   model: 'hat_crown',        offset: [0, -0.015, 0], rot: [0.1, 0, 0], scale: 1, hidden: true },
  { id: 'hat_traffic_cone', name: 'TRAFFIC CONE', slot: 'hat',  price: 50,  model: 'hat_traffic_cone', offset: [0, -0.02, 0], rot: [0, 0, -0.08], scale: 0.85 },
  { id: 'hat_bucket',       name: 'RUSTY BUCKET', slot: 'hat',  price: 30,  model: 'hat_bucket',       offset: [0, -0.06, 0], rot: [0, 0, 0.1], scale: 1 },
  { id: 'hat_chef',         name: 'CHEF HAT',     slot: 'hat',  price: 70,  model: 'hat_chef',         offset: [0, -0.02, 0], rot: [0, 0, 0], scale: 1 },
  { id: 'mask_hockey',      name: 'HOCKEY MASK',  slot: 'face', price: 80,  model: 'mask_hockey',      offset: [0, 0, 0.008], rot: [0, 0, 0], scale: 1 },
  { id: 'mask_gas',         name: 'GAS MASK',     slot: 'face', price: 90,  model: 'mask_gas',         offset: [0, -0.01, 0.01], rot: [0, 0, 0], scale: 1 },
  { id: 'mask_surgical',    name: 'SURGICAL MASK',slot: 'face', price: 35,  model: 'mask_surgical',    offset: [0, 0, 0.004], rot: [0, 0, 0], scale: 1 },
  { id: 'eyes_glowing',     name: 'GLOW EYES',    slot: 'eyes', price: 75,  model: 'eyes_glowing',     offset: [0, 0, 0], rot: [0, 0, 0], scale: 1, glow: ['#3CFF6E', '#FF2A1A', '#B04CFF'] },
  { id: 'face_stitches_X',  name: 'X STITCH',     slot: 'mark', price: 25,  model: 'face_stitches_X',  offset: [0, 0, 0], rot: [0, 0, 0], scale: 1 },
  { id: 'hand_gold',        name: 'GOLD HANDS',   slot: 'hands', price: 120, material: { color: '#C9A13B', metalness: 1, roughness: 0.3 } },
  { id: 'hand_rust',        name: 'RUSTY HANDS',  slot: 'hands', price: 40,  material: { color: '#7A4A2A', metalness: 0.4, roughness: 0.9 } },
  { id: 'hand_neon',        name: 'NEON HANDS',   slot: 'hands', price: 90,  material: { color: '#3CFF6E', emissive: '#3CFF6E', roughness: 0.4 } },
  { id: 'hand_bone',        name: 'BONE HANDS',   slot: 'hands', price: 50,  material: { color: '#E9DFC8', roughness: 0.7 } },
  { id: 'blood_black',      name: 'BLACK BLOOD',  slot: 'blood', price: 60,  blood: '#120808' },
  { id: 'blood_green',      name: 'TOXIC BLOOD',  slot: 'blood', price: 80,  blood: '#39FF6A' },
  { id: 'blood_gold',       name: 'GOLD BLOOD',   slot: 'blood', price: 100, blood: '#E5B83B' },
  { id: 'mskin_burned',     name: 'BURNED SKIN',  slot: 'mskin', price: 150, material: { color: '#1A1412', emissive: '#FF6A1A', emissiveIntensity: 0.35 } },
  { id: 'mskin_frozen',     name: 'FROZEN SKIN',  slot: 'mskin', price: 150, material: { color: '#9FD3E6', emissive: '#F0FAFF', emissiveIntensity: 0.1 } },
  { id: 'mskin_rusted',     name: 'RUSTED SKIN',  slot: 'mskin', price: 120, material: { color: '#7A4A2A', metalness: 0.5, roughness: 0.8 } },
];

export const ATTACH = {
  // in survivor_head model space (three.js: +Y up, face toward +Z), origin = neck base
  hat: [0, 0.24, 0],
  face: [0, 0.135, 0.118],
  eyes: [0, 0.135, 0.118],
  mark: [0, 0.135, 0.118],
};

export const TIPS = [
  'Shake hard to break free when grabbed.',
  'Blood is slippery. Use it.',
  'Monsters can\'t fit in vents.',
  'Squeeze a heart. Go on.',
  'Gore can be turned off at the Computer.',
  'Slam a head into the floor. Hard.',
  'Losing an arm slows you down. Losing two stops you.',
  'Hide in the labs. Breathe quietly.',
];

export const BOT_NAMES = ['SUBJECT102', 'STITCHY', 'LIMBO', 'NUMB', 'PATCHES', 'SUBJECT77', 'BUTTONS', 'TWITCH',
  'HOLLOW', 'SEAMS', 'LEFTOVER', 'SUBJECT9', 'MOTH', 'GRIN', 'SPOOL', 'THREADS', 'RAGDOLL', 'SOCKET', 'KNOT', 'LINT'];

export const PALETTE = {
  skin: '#E8E2D6', fog: '#0E1212', blood: '#8A0303', bloodDark: '#5C0000', bloodDry: '#3B0A0A',
  stuffing: '#F5F3EE', ghost: '#BFE3FF', screenText: '#3CFF6E', screenBg: '#0A140C', tip: '#CFC8B8',
};
