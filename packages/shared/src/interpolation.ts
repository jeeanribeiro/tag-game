import { INTERP_DELAY_MS } from './constants';
import type { Snapshot, Vec2 } from './types';

interface TimedSnapshot {
  at: number;
  snapshot: Snapshot;
}

/**
 * Buffers server snapshots (timestamped with local receipt time) and samples
 * player positions ~INTERP_DELAY_MS in the past, linearly interpolating
 * between the two snapshots that bracket the render time. No extrapolation:
 * when the buffer runs dry the newest known position is held, so remote
 * players never overshoot on packet loss.
 */
export class SnapshotBuffer {
  private readonly buffer: TimedSnapshot[] = [];

  constructor(
    private readonly delayMs: number = INTERP_DELAY_MS,
    private readonly maxSize: number = 60,
  ) {}

  push(snapshot: Snapshot, at: number): void {
    this.buffer.push({ at, snapshot });
    if (this.buffer.length > this.maxSize) this.buffer.shift();
  }

  latest(): Snapshot | null {
    const last = this.buffer[this.buffer.length - 1];
    return last ? last.snapshot : null;
  }

  /** Interpolated positions per player id at (now - delayMs). */
  sample(now: number): Map<string, Vec2> {
    const positions = new Map<string, Vec2>();
    if (this.buffer.length === 0) return positions;

    const renderTime = now - this.delayMs;
    const first = this.buffer[0];
    const last = this.buffer[this.buffer.length - 1];
    if (!first || !last) return positions;

    if (renderTime <= first.at) {
      for (const player of first.snapshot.players) {
        positions.set(player.id, { x: player.x, y: player.y });
      }
      return positions;
    }
    if (renderTime >= last.at) {
      for (const player of last.snapshot.players) {
        positions.set(player.id, { x: player.x, y: player.y });
      }
      return positions;
    }

    let older = first;
    let newer = last;
    for (let i = 1; i < this.buffer.length; i++) {
      const candidate = this.buffer[i];
      if (!candidate) continue;
      if (candidate.at >= renderTime) {
        newer = candidate;
        older = this.buffer[i - 1] ?? first;
        break;
      }
    }

    const span = newer.at - older.at;
    const alpha = span > 0 ? (renderTime - older.at) / span : 1;
    const olderById = new Map(older.snapshot.players.map((player) => [player.id, player]));

    for (const player of newer.snapshot.players) {
      const previous = olderById.get(player.id);
      if (!previous) {
        positions.set(player.id, { x: player.x, y: player.y });
        continue;
      }
      positions.set(player.id, {
        x: previous.x + (player.x - previous.x) * alpha,
        y: previous.y + (player.y - previous.y) * alpha,
      });
    }
    return positions;
  }
}
