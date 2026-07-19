import type { Rect, Vec2 } from './types';

/** Arena size in world units. */
export const ARENA_WIDTH = 1600;
export const ARENA_HEIGHT = 900;

export const PLAYER_RADIUS = 18;

/** Base movement speed in world units per second. */
export const BASE_SPEED = 230;
export const SPRINT_MULTIPLIER = 1.6;

export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_PER_S = 35;
export const STAMINA_REGEN_PER_S = 22;
/** Minimum stamina required to start sprinting (hysteresis so sprint does not flicker at 0). */
export const STAMINA_SPRINT_MIN = 10;

/** After a tag, the new chaser cannot tag anyone for this long. */
export const TAG_COOLDOWN_MS = 3000;

/** Authoritative simulation rate. */
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
/** Snapshot broadcast rate. */
export const SNAPSHOT_RATE = 20;
export const SNAPSHOT_EVERY = TICK_RATE / SNAPSHOT_RATE;

/** How far in the past remote players are rendered (interpolation buffer). */
export const INTERP_DELAY_MS = 100;

export const COUNTDOWN_MS = 3000;
export const ROUND_MS = 90_000;
export const PODIUM_MS = 8000;

export const MAX_PLAYERS_PER_ROOM = 8;
export const MAX_NICKNAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 4;

/** Server keeps at most this many unprocessed inputs per player (one is consumed per tick). */
export const INPUT_QUEUE_MAX = 8;

/** Distinct player colors on a dark arena. */
export const PLAYER_COLORS = [
  '#38bdf8',
  '#4ade80',
  '#facc15',
  '#c084fc',
  '#fb923c',
  '#f472b6',
  '#2dd4bf',
  '#a3e635',
] as const;

export const OBSTACLES: readonly Rect[] = [
  { x: 380, y: 200, w: 120, h: 260 },
  { x: 1100, y: 440, w: 120, h: 260 },
  { x: 700, y: 90, w: 200, h: 90 },
  { x: 700, y: 720, w: 200, h: 90 },
];

export const SPAWN_POINTS: readonly Vec2[] = [
  { x: 200, y: 200 },
  { x: 1400, y: 700 },
  { x: 1400, y: 200 },
  { x: 200, y: 700 },
  { x: 800, y: 450 },
  { x: 200, y: 450 },
  { x: 1400, y: 450 },
  { x: 620, y: 620 },
];
