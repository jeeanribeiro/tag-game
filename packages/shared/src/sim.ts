import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BASE_SPEED,
  COUNTDOWN_MS,
  OBSTACLES,
  PLAYER_COLORS,
  PLAYER_RADIUS,
  PODIUM_MS,
  ROUND_MS,
  SPAWN_POINTS,
  SPRINT_MULTIPLIER,
  STAMINA_DRAIN_PER_S,
  STAMINA_MAX,
  STAMINA_REGEN_PER_S,
  STAMINA_SPRINT_MIN,
  TAG_COOLDOWN_MS,
} from './constants';
import type {
  MovableBody,
  PlayerInput,
  PodiumEntry,
  Rect,
  RoomState,
  SimEvent,
  SimOptions,
  SimPlayer,
  Vec2,
} from './types';

export function defaultSimOptions(): SimOptions {
  return {
    countdownMs: COUNTDOWN_MS,
    roundMs: ROUND_MS,
    podiumMs: PODIUM_MS,
    tagCooldownMs: TAG_COOLDOWN_MS,
    spawnPoints: SPAWN_POINTS,
    obstacles: OBSTACLES,
    rng: Math.random,
  };
}

export function createRoomState(): RoomState {
  return {
    phase: 'waiting',
    phaseRemainingMs: 0,
    players: {},
    itId: null,
    immunityRemainingMs: 0,
    roundNumber: 0,
    podium: [],
    nextJoinOrder: 0,
  };
}

export function idleInput(): PlayerInput {
  return { seq: 0, moveX: 0, moveY: 0, sprint: false };
}

export function activePlayers(state: RoomState): SimPlayer[] {
  return Object.values(state.players).filter((player) => !player.spectator);
}

/** Players who join mid-round spectate until the next countdown. */
export function addPlayer(
  state: RoomState,
  id: string,
  nickname: string,
  options: SimOptions,
): SimPlayer {
  const joinOrder = state.nextJoinOrder++;
  const spawn = options.spawnPoints[joinOrder % options.spawnPoints.length] ?? { x: 100, y: 100 };
  const player: SimPlayer = {
    id,
    nickname,
    colorIndex: joinOrder % PLAYER_COLORS.length,
    x: spawn.x,
    y: spawn.y,
    stamina: STAMINA_MAX,
    sprinting: false,
    spectator: state.phase === 'playing' || state.phase === 'podium',
    scoreMs: 0,
    input: idleInput(),
    lastSeq: 0,
    joinOrder,
  };
  state.players[id] = player;
  return player;
}

export function removePlayer(state: RoomState, id: string): void {
  const player = state.players[id];
  if (!player) return;
  delete state.players[id];
  if (state.itId === id) {
    // Hand "it" to the nearest remaining active player so the round can continue.
    const remaining = activePlayers(state);
    let nearest: SimPlayer | null = null;
    let nearestD2 = Infinity;
    for (const candidate of remaining) {
      const dx = candidate.x - player.x;
      const dy = candidate.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearest = candidate;
      }
    }
    state.itId = nearest ? nearest.id : null;
  }
}

export function clampMagnitude(x: number, y: number): Vec2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 1) return { x, y };
  return { x: x / magnitude, y: y / magnitude };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Push a circle out of a rectangle. Returns the corrected center, or null if
 * there is no overlap.
 */
export function resolveCircleRect(x: number, y: number, radius: number, rect: Rect): Vec2 | null {
  const closestX = clamp(x, rect.x, rect.x + rect.w);
  const closestY = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - closestX;
  const dy = y - closestY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return null;
  if (d2 > 0) {
    const distance = Math.sqrt(d2);
    const push = (radius - distance) / distance;
    return { x: x + dx * push, y: y + dy * push };
  }
  // Center is inside the rect: exit through the face with the least penetration.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const least = Math.min(left, right, top, bottom);
  if (least === left) return { x: rect.x - radius, y };
  if (least === right) return { x: rect.x + rect.w + radius, y };
  if (least === top) return { x, y: rect.y - radius };
  return { x, y: rect.y + rect.h + radius };
}

/**
 * Integrate one body for dtMs using its current input. Deterministic and pure
 * with respect to its arguments — the exact same code runs on the server (as
 * the authority) and on the client (as the prediction).
 */
export function stepBody(body: MovableBody, dtMs: number, obstacles: readonly Rect[]): void {
  const dt = dtMs / 1000;
  const move = clampMagnitude(body.input.moveX, body.input.moveY);
  const moving = move.x !== 0 || move.y !== 0;

  if (body.input.sprint && moving) {
    body.sprinting = body.sprinting ? body.stamina > 0 : body.stamina >= STAMINA_SPRINT_MIN;
  } else {
    body.sprinting = false;
  }
  if (body.sprinting) {
    body.stamina = Math.max(0, body.stamina - STAMINA_DRAIN_PER_S * dt);
  } else {
    body.stamina = Math.min(STAMINA_MAX, body.stamina + STAMINA_REGEN_PER_S * dt);
  }

  const speed = BASE_SPEED * (body.sprinting ? SPRINT_MULTIPLIER : 1);
  body.x += move.x * speed * dt;
  body.y += move.y * speed * dt;

  body.x = clamp(body.x, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
  body.y = clamp(body.y, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
  for (const rect of obstacles) {
    const resolved = resolveCircleRect(body.x, body.y, PLAYER_RADIUS, rect);
    if (resolved) {
      body.x = resolved.x;
      body.y = resolved.y;
    }
  }
}

function computePodium(state: RoomState): PodiumEntry[] {
  return activePlayers(state)
    .slice()
    .sort((a, b) => b.scoreMs - a.scoreMs)
    .map((player) => ({
      id: player.id,
      nickname: player.nickname,
      colorIndex: player.colorIndex,
      scoreMs: player.scoreMs,
    }));
}

function startCountdown(state: RoomState, options: SimOptions, events: SimEvent[]): void {
  state.phase = 'countdown';
  state.phaseRemainingMs = options.countdownMs;
  state.roundNumber += 1;
  state.podium = [];
  const players = Object.values(state.players).sort((a, b) => a.joinOrder - b.joinOrder);
  players.forEach((player, index) => {
    player.spectator = false;
    const spawn = options.spawnPoints[index % options.spawnPoints.length];
    if (spawn) {
      player.x = spawn.x;
      player.y = spawn.y;
    }
    player.stamina = STAMINA_MAX;
    player.sprinting = false;
    player.scoreMs = 0;
  });
  const chosen = players[Math.floor(options.rng() * players.length)];
  state.itId = chosen ? chosen.id : null;
  state.immunityRemainingMs = 0;
  events.push({ type: 'phase', phase: 'countdown' });
}

function backToWaiting(state: RoomState, events: SimEvent[]): void {
  state.phase = 'waiting';
  state.phaseRemainingMs = 0;
  state.itId = null;
  state.immunityRemainingMs = 0;
  events.push({ type: 'phase', phase: 'waiting' });
}

/**
 * Advance the authoritative room simulation by dtMs. Pure with respect to its
 * inputs (mutates `state`, returns the events that happened this step).
 *
 * Phases: waiting -> countdown -> playing -> podium -> countdown | waiting.
 */
export function stepRoom(state: RoomState, dtMs: number, options: SimOptions): SimEvent[] {
  const events: SimEvent[] = [];
  const active = activePlayers(state);

  switch (state.phase) {
    case 'waiting': {
      for (const player of active) stepBody(player, dtMs, options.obstacles);
      if (active.length >= 2) startCountdown(state, options, events);
      break;
    }

    case 'countdown': {
      // Players are frozen on their spawn points until the round starts.
      state.phaseRemainingMs -= dtMs;
      if (Object.keys(state.players).length < 2) {
        backToWaiting(state, events);
        break;
      }
      if (state.phaseRemainingMs <= 0) {
        state.phase = 'playing';
        state.phaseRemainingMs = options.roundMs;
        state.immunityRemainingMs = options.tagCooldownMs;
        events.push({ type: 'phase', phase: 'playing' });
      }
      break;
    }

    case 'playing': {
      if (active.length < 2) {
        backToWaiting(state, events);
        break;
      }
      for (const player of active) stepBody(player, dtMs, options.obstacles);

      // Score = time spent NOT being "it".
      for (const player of active) {
        if (player.id !== state.itId) player.scoreMs += dtMs;
      }

      state.immunityRemainingMs = Math.max(0, state.immunityRemainingMs - dtMs);
      const chaser = state.itId ? state.players[state.itId] : undefined;
      if (chaser && state.immunityRemainingMs <= 0) {
        for (const player of active) {
          if (player.id === chaser.id) continue;
          const dx = player.x - chaser.x;
          const dy = player.y - chaser.y;
          const reach = PLAYER_RADIUS * 2;
          if (dx * dx + dy * dy <= reach * reach) {
            events.push({
              type: 'tag',
              oldItId: chaser.id,
              newItId: player.id,
              x: (player.x + chaser.x) / 2,
              y: (player.y + chaser.y) / 2,
            });
            state.itId = player.id;
            state.immunityRemainingMs = options.tagCooldownMs;
            break;
          }
        }
      }

      state.phaseRemainingMs -= dtMs;
      if (state.phaseRemainingMs <= 0) {
        state.phase = 'podium';
        state.phaseRemainingMs = options.podiumMs;
        state.podium = computePodium(state);
        state.itId = null;
        events.push({ type: 'phase', phase: 'podium' });
      }
      break;
    }

    case 'podium': {
      state.phaseRemainingMs -= dtMs;
      if (state.phaseRemainingMs <= 0) {
        if (Object.keys(state.players).length >= 2) {
          startCountdown(state, options, events);
        } else {
          backToWaiting(state, events);
        }
      }
      break;
    }
  }

  return events;
}
