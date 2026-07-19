import { describe, expect, it } from 'vitest';
import { SnapshotBuffer } from '../src/index';
import type { PlayerSnapshot, Snapshot } from '../src/index';

function snapshotAt(tick: number, x: number, y: number): Snapshot {
  const player: PlayerSnapshot = {
    id: 'p1',
    nickname: 'P1',
    colorIndex: 0,
    x,
    y,
    stamina: 100,
    sprinting: false,
    spectator: false,
    scoreMs: 0,
  };
  return {
    tick,
    phase: 'playing',
    phaseRemainingMs: 60_000,
    roundNumber: 1,
    itId: null,
    immunityMs: 0,
    players: [player],
    podium: [],
    lastSeq: 0,
  };
}

describe('SnapshotBuffer', () => {
  it('returns nothing when empty', () => {
    const buffer = new SnapshotBuffer(100);
    expect(buffer.sample(1000).size).toBe(0);
    expect(buffer.latest()).toBeNull();
  });

  it('interpolates linearly between two bracketing snapshots', () => {
    const buffer = new SnapshotBuffer(100);
    buffer.push(snapshotAt(1, 0, 0), 1000);
    buffer.push(snapshotAt(2, 100, 50), 1050);

    // renderTime = 1125 - 100 = 1025, halfway between the two snapshots
    const positions = buffer.sample(1125);
    expect(positions.get('p1')).toEqual({ x: 50, y: 25 });
  });

  it('clamps to the newest snapshot instead of extrapolating', () => {
    const buffer = new SnapshotBuffer(100);
    buffer.push(snapshotAt(1, 0, 0), 1000);
    buffer.push(snapshotAt(2, 100, 0), 1050);

    const positions = buffer.sample(5000);
    expect(positions.get('p1')).toEqual({ x: 100, y: 0 });
  });

  it('clamps to the oldest snapshot before the buffer starts', () => {
    const buffer = new SnapshotBuffer(100);
    buffer.push(snapshotAt(1, 40, 40), 1000);
    buffer.push(snapshotAt(2, 100, 0), 1050);

    const positions = buffer.sample(900);
    expect(positions.get('p1')).toEqual({ x: 40, y: 40 });
  });

  it('keeps players that only exist in the newer snapshot', () => {
    const buffer = new SnapshotBuffer(100);
    buffer.push(snapshotAt(1, 0, 0), 1000);
    const withNew = snapshotAt(2, 100, 0);
    withNew.players.push({ ...withNew.players[0]!, id: 'p2', x: 7, y: 8 });
    buffer.push(withNew, 1050);

    const positions = buffer.sample(1125);
    expect(positions.get('p2')).toEqual({ x: 7, y: 8 });
  });

  it('evicts the oldest snapshots beyond its capacity', () => {
    const buffer = new SnapshotBuffer(100, 3);
    for (let i = 0; i < 10; i++) buffer.push(snapshotAt(i, i * 10, 0), 1000 + i * 50);
    expect(buffer.latest()!.tick).toBe(9);
    // Oldest retained snapshot is tick 7 (at=1350): sampling far in the past clamps to it.
    expect(buffer.sample(0).get('p1')).toEqual({ x: 70, y: 0 });
  });
});
