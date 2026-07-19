import { describe, expect, it } from 'vitest';
import {
  ARENA_WIDTH,
  BASE_SPEED,
  PLAYER_RADIUS,
  SPRINT_MULTIPLIER,
  STAMINA_MAX,
  STAMINA_SPRINT_MIN,
  TICK_MS,
  addPlayer,
  clampMagnitude,
  createRoomState,
  defaultSimOptions,
  idleInput,
  removePlayer,
  resolveCircleRect,
  stepBody,
  stepRoom,
} from '../src/index';
import type { MovableBody, RoomState, SimEvent, SimOptions } from '../src/index';

function testOptions(overrides: Partial<SimOptions> = {}): SimOptions {
  return {
    ...defaultSimOptions(),
    countdownMs: 100,
    roundMs: 10_000,
    podiumMs: 100,
    tagCooldownMs: 500,
    rng: () => 0, // deterministic: first player (by join order) becomes "it"
    ...overrides,
  };
}

function makeBody(overrides: Partial<MovableBody> = {}): MovableBody {
  return {
    x: 800,
    y: 450,
    stamina: STAMINA_MAX,
    sprinting: false,
    input: idleInput(),
    ...overrides,
  };
}

function run(state: RoomState, ms: number, options: SimOptions): SimEvent[] {
  const events: SimEvent[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
    events.push(...stepRoom(state, TICK_MS, options));
  }
  return events;
}

/** Step until the predicate holds (checked after every tick) or maxMs elapses. */
function runUntil(
  state: RoomState,
  options: SimOptions,
  predicate: () => boolean,
  maxMs = 30_000,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (let elapsed = 0; elapsed < maxMs; elapsed += TICK_MS) {
    events.push(...stepRoom(state, TICK_MS, options));
    if (predicate()) return events;
  }
  throw new Error('runUntil: predicate never became true');
}

describe('clampMagnitude', () => {
  it('leaves unit and sub-unit vectors untouched', () => {
    expect(clampMagnitude(0.5, 0)).toEqual({ x: 0.5, y: 0 });
    expect(clampMagnitude(0, -1)).toEqual({ x: 0, y: -1 });
  });

  it('normalizes oversized vectors so diagonals are not faster', () => {
    const clamped = clampMagnitude(1, 1);
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(1, 10);
  });
});

describe('stepBody movement', () => {
  it('moves at BASE_SPEED without sprint', () => {
    const body = makeBody({ input: { seq: 1, moveX: 1, moveY: 0, sprint: false } });
    const startX = body.x;
    for (let i = 0; i < 60; i++) stepBody(body, TICK_MS, []);
    expect(body.x - startX).toBeCloseTo(BASE_SPEED, 5);
  });

  it('moves at sprint speed while stamina lasts', () => {
    const body = makeBody({ input: { seq: 1, moveX: 1, moveY: 0, sprint: true } });
    const startX = body.x;
    for (let i = 0; i < 60; i++) stepBody(body, TICK_MS, []);
    expect(body.x - startX).toBeCloseTo(BASE_SPEED * SPRINT_MULTIPLIER, 5);
    expect(body.stamina).toBeLessThan(STAMINA_MAX);
  });

  it('clamps the body inside the arena', () => {
    const body = makeBody({
      x: ARENA_WIDTH - PLAYER_RADIUS - 1,
      input: { seq: 1, moveX: 1, moveY: 0, sprint: true },
    });
    for (let i = 0; i < 300; i++) stepBody(body, TICK_MS, []);
    expect(body.x).toBe(ARENA_WIDTH - PLAYER_RADIUS);
  });

  it('never exceeds sprint speed even for degenerate inputs', () => {
    const body = makeBody({ input: { seq: 1, moveX: 1, moveY: 1, sprint: true } });
    const start = { x: body.x, y: body.y };
    for (let i = 0; i < 60; i++) stepBody(body, TICK_MS, []);
    const travelled = Math.hypot(body.x - start.x, body.y - start.y);
    expect(travelled).toBeLessThanOrEqual(BASE_SPEED * SPRINT_MULTIPLIER + 1e-6);
  });
});

describe('stamina', () => {
  it('drains while sprinting and regenerates when walking', () => {
    const body = makeBody({ input: { seq: 1, moveX: 1, moveY: 0, sprint: true } });
    for (let i = 0; i < 120; i++) stepBody(body, TICK_MS, []);
    const drained = body.stamina;
    expect(drained).toBeLessThan(STAMINA_MAX);

    body.input = { seq: 2, moveX: 1, moveY: 0, sprint: false };
    for (let i = 0; i < 120; i++) stepBody(body, TICK_MS, []);
    expect(body.stamina).toBeGreaterThan(drained);
  });

  it('cannot start sprinting below the minimum threshold', () => {
    const body = makeBody({
      stamina: STAMINA_SPRINT_MIN - 1,
      input: { seq: 1, moveX: 1, moveY: 0, sprint: true },
    });
    stepBody(body, TICK_MS, []);
    expect(body.sprinting).toBe(false);
  });

  it('keeps sprinting below the threshold until stamina hits zero (hysteresis)', () => {
    const body = makeBody({
      stamina: STAMINA_SPRINT_MIN + 1,
      input: { seq: 1, moveX: 1, moveY: 0, sprint: true },
    });
    stepBody(body, TICK_MS, []);
    expect(body.sprinting).toBe(true);
    body.stamina = STAMINA_SPRINT_MIN - 5;
    stepBody(body, TICK_MS, []);
    expect(body.sprinting).toBe(true);
    body.stamina = 0;
    stepBody(body, TICK_MS, []);
    expect(body.sprinting).toBe(false);
  });
});

describe('resolveCircleRect', () => {
  const rect = { x: 100, y: 100, w: 200, h: 100 };

  it('returns null when there is no overlap', () => {
    expect(resolveCircleRect(50, 50, 10, rect)).toBeNull();
  });

  it('pushes a circle out of a rect edge', () => {
    const resolved = resolveCircleRect(95, 150, 10, rect);
    expect(resolved).not.toBeNull();
    expect(resolved!.x).toBeCloseTo(90, 5);
    expect(resolved!.y).toBe(150);
  });

  it('pushes a fully-contained circle out through the nearest face', () => {
    const resolved = resolveCircleRect(110, 150, 10, rect);
    expect(resolved).toEqual({ x: 90, y: 150 });
  });

  it('blocks walking through an obstacle', () => {
    const body = makeBody({ x: 60, y: 150, input: { seq: 1, moveX: 1, moveY: 0, sprint: false } });
    for (let i = 0; i < 600; i++) stepBody(body, TICK_MS, [rect]);
    expect(body.x).toBeLessThanOrEqual(rect.x - PLAYER_RADIUS + 1e-6);
  });
});

describe('room phases and tag rules', () => {
  it('starts a countdown once two players are present, then plays', () => {
    const options = testOptions();
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    expect(stepRoom(state, TICK_MS, options)).toEqual([]);
    expect(state.phase).toBe('waiting');

    addPlayer(state, 'b', 'Bob', options);
    const events = run(state, 200, options);
    expect(events.some((e) => e.type === 'phase' && e.phase === 'countdown')).toBe(true);
    expect(events.some((e) => e.type === 'phase' && e.phase === 'playing')).toBe(true);
    expect(state.phase).toBe('playing');
    expect(state.itId).toBe('a'); // rng() => 0 picks the first joiner
    expect(state.immunityRemainingMs).toBeGreaterThan(0);
  });

  it('tags on contact after immunity, flips "it" and restarts the cooldown', () => {
    const options = testOptions();
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    run(state, 200, options); // through countdown into playing
    run(state, options.tagCooldownMs, options); // burn initial immunity

    const chaser = state.players['a']!;
    const runner = state.players['b']!;
    chaser.x = 500;
    chaser.y = 450;
    runner.x = 500 + PLAYER_RADIUS * 2 - 1;
    runner.y = 450;

    const events = stepRoom(state, TICK_MS, options);
    const tag = events.find((e) => e.type === 'tag');
    expect(tag).toBeDefined();
    expect(tag).toMatchObject({ oldItId: 'a', newItId: 'b' });
    expect(state.itId).toBe('b');
    expect(state.immunityRemainingMs).toBe(options.tagCooldownMs);
  });

  it('does not allow an immediate tag-back during the cooldown', () => {
    const options = testOptions();
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    run(state, 200, options);
    run(state, options.tagCooldownMs, options);

    state.players['a']!.x = 500;
    state.players['a']!.y = 450;
    state.players['b']!.x = 500 + PLAYER_RADIUS;
    state.players['b']!.y = 450;
    stepRoom(state, TICK_MS, options);
    expect(state.itId).toBe('b');

    // Still overlapping on the next ticks, but immunity blocks the tag-back.
    const events = run(state, options.tagCooldownMs / 2, options);
    expect(events.filter((e) => e.type === 'tag')).toHaveLength(0);
    expect(state.itId).toBe('b');
  });

  it('scores time NOT being it, and only during play', () => {
    const options = testOptions();
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    run(state, 200, options);

    const playedMs = 1000;
    run(state, playedMs, options);
    expect(state.players['a']!.scoreMs).toBe(0); // "it" scores nothing
    expect(state.players['b']!.scoreMs).toBeGreaterThan(playedMs * 0.9);
  });

  it('ends the round with a podium sorted by score', () => {
    const options = testOptions({ roundMs: 500 });
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    run(state, 200, options);
    const events = runUntil(state, options, () => state.phase === 'podium');
    expect(events.some((e) => e.type === 'phase' && e.phase === 'podium')).toBe(true);
    expect(state.podium[0]!.id).toBe('b');
    expect(state.podium[1]!.id).toBe('a');
  });

  it('promotes mid-round joiners from spectator at the next countdown', () => {
    const options = testOptions({ roundMs: 500 });
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    run(state, 200, options);
    expect(state.phase).toBe('playing');

    const late = addPlayer(state, 'c', 'Cy', options);
    expect(late.spectator).toBe(true);
    expect(state.players['c']!.scoreMs).toBe(0);

    runUntil(state, options, () => state.phase === 'countdown'); // round -> podium -> countdown
    expect(state.players['c']!.spectator).toBe(false);
  });

  it('returns to waiting when a player leaves mid-round', () => {
    const options = testOptions();
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    run(state, 200, options);
    expect(state.phase).toBe('playing');

    removePlayer(state, 'b');
    const events = stepRoom(state, TICK_MS, options);
    expect(events.some((e) => e.type === 'phase' && e.phase === 'waiting')).toBe(true);
    expect(state.itId).toBeNull();
  });

  it('hands "it" to the nearest player when the chaser disconnects', () => {
    const options = testOptions();
    const state = createRoomState();
    addPlayer(state, 'a', 'Ada', options);
    addPlayer(state, 'b', 'Bob', options);
    addPlayer(state, 'c', 'Cy', options);
    run(state, 200, options);
    expect(state.itId).toBe('a');

    const chaser = state.players['a']!;
    state.players['b']!.x = chaser.x + 50;
    state.players['b']!.y = chaser.y;
    state.players['c']!.x = chaser.x + 500;
    state.players['c']!.y = chaser.y;

    removePlayer(state, 'a');
    expect(state.itId).toBe('b');
  });
});
