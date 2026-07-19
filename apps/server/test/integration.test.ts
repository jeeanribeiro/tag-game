import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  InputMessage,
  JoinResult,
  ServerToClientEvents,
  Snapshot,
  TagBroadcast,
} from '@tag-game/shared';
import { createGameServer } from '../src/server';
import type { RunningGameServer } from '../src/server';

type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

const PORT = 43158;
const URL = `http://127.0.0.1:${PORT}`;
const TAG_COOLDOWN_MS = 300;

let server: RunningGameServer;
const clients: TestClient[] = [];

function newClient(): TestClient {
  const socket: TestClient = connect(URL, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
}

function join(socket: TestClient, nickname: string, roomCode?: string): Promise<JoinResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('join timed out')), 5000);
    socket.emit('join', roomCode ? { nickname, roomCode } : { nickname }, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function waitForSnapshot(
  socket: TestClient,
  predicate: (snapshot: Snapshot) => boolean,
  timeoutMs = 10_000,
): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('snapshot', handler);
      reject(new Error('timed out waiting for snapshot'));
    }, timeoutMs);
    const handler = (snapshot: Snapshot): void => {
      if (predicate(snapshot)) {
        clearTimeout(timer);
        socket.off('snapshot', handler);
        resolve(snapshot);
      }
    };
    socket.on('snapshot', handler);
  });
}

function waitForTag(socket: TestClient, timeoutMs = 10_000): Promise<TagBroadcast> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for tag')), timeoutMs);
    socket.once('tag', (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
}

/** Steer `chaser` toward `targetId` using real input messages until a tag lands. */
async function chaseUntilTag(
  chaser: TestClient,
  targetId: string,
  selfId: string,
): Promise<TagBroadcast> {
  let seq = 1;
  let latest: Snapshot | null = null;
  const onSnapshot = (snapshot: Snapshot): void => {
    latest = snapshot;
  };
  chaser.on('snapshot', onSnapshot);

  const driver = setInterval(() => {
    const snapshot: Snapshot | null = latest;
    if (!snapshot) return;
    const self = snapshot.players.find((p) => p.id === selfId);
    const target = snapshot.players.find((p) => p.id === targetId);
    if (!self || !target) return;
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const distance = Math.hypot(dx, dy) || 1;
    const input: InputMessage = {
      seq: seq++,
      moveX: dx / distance,
      moveY: dy / distance,
      sprint: true,
    };
    chaser.emit('input', input);
  }, 33);

  try {
    return await waitForTag(chaser);
  } finally {
    clearInterval(driver);
    chaser.off('snapshot', onSnapshot);
  }
}

/** Steer a client to a world position using real inputs, then stop it there. */
async function steerTo(
  socket: TestClient,
  selfId: string,
  target: { x: number; y: number },
  timeoutMs = 10_000,
): Promise<void> {
  let seq = 500_000; // distinct range from the chase driver
  const startedAt = Date.now();
  try {
    for (;;) {
      if (Date.now() - startedAt > timeoutMs) throw new Error('steerTo timed out');
      const snapshot = await waitForSnapshot(socket, () => true, 2000);
      const self = snapshot.players.find((p) => p.id === selfId);
      if (!self) continue;
      const dx = target.x - self.x;
      const dy = target.y - self.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 60) break;
      socket.emit('input', {
        seq: seq++,
        moveX: dx / distance,
        moveY: dy / distance,
        sprint: false,
      });
    }
  } finally {
    socket.emit('input', { seq: seq + 1, moveX: 0, moveY: 0, sprint: false });
  }
}

beforeAll(async () => {
  server = await createGameServer({
    port: PORT,
    webDistPath: null,
    roomOptions: {
      countdownMs: 100,
      roundMs: 120_000,
      podiumMs: 500,
      tagCooldownMs: TAG_COOLDOWN_MS,
      // Spawn the two players close together so the chase is quick.
      spawnPoints: [
        { x: 700, y: 450 },
        { x: 900, y: 450 },
      ],
    },
  });
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  await server.close();
});

describe('two real clients against a running server', () => {
  it('plays a full tag exchange: A tags B, then B tags A back', async () => {
    const a = newClient();
    const b = newClient();

    const joinA = await join(a, 'Ada');
    expect(joinA.ok).toBe(true);
    if (!joinA.ok) return;

    const joinB = await join(b, 'Bob', joinA.roomCode);
    expect(joinB.ok).toBe(true);
    if (!joinB.ok) return;

    // Both players present -> countdown -> playing.
    const playing = await waitForSnapshot(a, (s) => s.phase === 'playing' && s.itId !== null);
    expect(playing.players).toHaveLength(2);

    const itId = playing.itId!;
    const runnerId = itId === joinA.selfId ? joinB.selfId : joinA.selfId;
    const chaserSocket = itId === joinA.selfId ? a : b;
    const runnerSocket = itId === joinA.selfId ? b : a;

    // Exchange 1: the chaser hunts the idle runner down.
    const firstTag = await chaseUntilTag(chaserSocket, runnerId, itId);
    expect(firstTag.oldItId).toBe(itId);
    expect(firstTag.newItId).toBe(runnerId);

    const afterFirst = await waitForSnapshot(a, (s) => s.itId === runnerId);
    expect(afterFirst.itId).toBe(runnerId);

    // Move the previous chaser well out of tag reach and park it there, so the
    // cooldown cannot produce an instant ping-pong tag. The target is on the
    // far side of the arena, away from the (stationary) new chaser.
    await steerTo(chaserSocket, itId, { x: 1400, y: 750 });

    // Exchange 2: after the cooldown, the fresh chaser hunts the parked target.
    await new Promise((resolve) => setTimeout(resolve, TAG_COOLDOWN_MS + 100));
    const secondTag = await chaseUntilTag(runnerSocket, itId, runnerId);
    expect(secondTag.oldItId).toBe(runnerId);
    expect(secondTag.newItId).toBe(itId);

    const afterSecond = await waitForSnapshot(a, (s) => s.itId === itId);
    expect(afterSecond.itId).toBe(itId);

    // Scores moved: time spent not being "it" is rewarded.
    const scores = afterSecond.players.map((p) => p.scoreMs);
    expect(Math.max(...scores)).toBeGreaterThan(0);
  });

  it('ignores malformed and out-of-range inputs instead of trusting them', async () => {
    const a = newClient();
    const b = newClient();

    const joinA = await join(a, 'Eve');
    expect(joinA.ok).toBe(true);
    if (!joinA.ok) return;
    const joinB = await join(b, 'Mallory', joinA.roomCode);
    expect(joinB.ok).toBe(true);
    if (!joinB.ok) return;

    await waitForSnapshot(a, (s) => s.phase === 'playing');
    const before = await waitForSnapshot(a, () => true);
    const selfBefore = before.players.find((p) => p.id === joinA.selfId)!;

    // A devtools cheater: teleports, speed multipliers, garbage types.
    a.emit('input', { seq: 1, moveX: 9000, moveY: 0, sprint: false });
    a.emit('input', { seq: 2, moveX: 1, moveY: 0, sprint: 'yes' });
    a.emit('input', { x: 1, y: 2, teleport: true });
    a.emit('input', { seq: 3, moveX: Number.NaN, moveY: 0, sprint: true });

    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await waitForSnapshot(a, () => true);
    const selfAfter = after.players.find((p) => p.id === joinA.selfId)!;

    // None of those messages moved the player; the server stayed up.
    expect(selfAfter.x).toBeCloseTo(selfBefore.x, 5);
    expect(selfAfter.y).toBeCloseTo(selfBefore.y, 5);
  });

  it('rejects joins to unknown rooms', async () => {
    const c = newClient();
    const result = await join(c, 'Zed', 'ZZZ2');
    expect(result.ok).toBe(false);
  });
});
