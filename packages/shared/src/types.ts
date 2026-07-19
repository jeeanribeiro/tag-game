export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Phase = 'waiting' | 'countdown' | 'playing' | 'podium';

/** A single input sample: unit-clamped move vector plus sprint intent. */
export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  sprint: boolean;
}

/** The minimal player shape the movement integrator needs (used for both sim and client prediction). */
export interface MovableBody {
  x: number;
  y: number;
  stamina: number;
  sprinting: boolean;
  input: PlayerInput;
}

export interface SimPlayer extends MovableBody {
  id: string;
  nickname: string;
  colorIndex: number;
  spectator: boolean;
  scoreMs: number;
  lastSeq: number;
  joinOrder: number;
}

export interface PodiumEntry {
  id: string;
  nickname: string;
  colorIndex: number;
  scoreMs: number;
}

export interface RoomState {
  phase: Phase;
  phaseRemainingMs: number;
  players: Record<string, SimPlayer>;
  /** id of the current chaser, or null outside rounds. */
  itId: string | null;
  /** While > 0 the chaser cannot tag (grace period after a tag / round start). */
  immunityRemainingMs: number;
  roundNumber: number;
  podium: PodiumEntry[];
  nextJoinOrder: number;
}

export type SimEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'tag'; oldItId: string; newItId: string; x: number; y: number };

export interface SimOptions {
  countdownMs: number;
  roundMs: number;
  podiumMs: number;
  tagCooldownMs: number;
  spawnPoints: readonly Vec2[];
  obstacles: readonly Rect[];
  rng: () => number;
}

/** Wire format: per-player state inside a snapshot. */
export interface PlayerSnapshot {
  id: string;
  nickname: string;
  colorIndex: number;
  x: number;
  y: number;
  stamina: number;
  sprinting: boolean;
  spectator: boolean;
  scoreMs: number;
}

/** Wire format: authoritative world state broadcast ~20 times per second. */
export interface Snapshot {
  tick: number;
  phase: Phase;
  phaseRemainingMs: number;
  roundNumber: number;
  itId: string | null;
  immunityMs: number;
  players: PlayerSnapshot[];
  podium: PodiumEntry[];
  /** Sequence number of the recipient's last input the server has applied (for reconciliation). */
  lastSeq: number;
}

export interface TagBroadcast {
  oldItId: string;
  newItId: string;
  x: number;
  y: number;
}

export type JoinResult =
  { ok: true; roomCode: string; selfId: string } | { ok: false; error: string };

export interface ServerToClientEvents {
  snapshot: (snapshot: Snapshot) => void;
  tag: (event: TagBroadcast) => void;
}

export interface ClientToServerEvents {
  join: (message: unknown, ack: (result: JoinResult) => void) => void;
  input: (message: unknown) => void;
}
