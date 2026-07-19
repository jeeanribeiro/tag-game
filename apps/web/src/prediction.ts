import { OBSTACLES, TICK_MS, idleInput, stepBody } from '@tag-game/shared';
import type { InputMessage, MovableBody, Snapshot } from '@tag-game/shared';
import type { CurrentInput } from './input';

export interface PredictedSelf {
  x: number;
  y: number;
  stamina: number;
  sprinting: boolean;
}

/**
 * Client-side prediction for the local player.
 *
 * The client runs the exact same `stepBody` the server runs, at the same
 * 60 Hz fixed timestep, sending one input per predicted tick. When a snapshot
 * arrives, the authoritative self-state is adopted and every input the server
 * has not yet applied (seq > snapshot.lastSeq) is replayed on top — so the
 * local player feels instant while the server stays in charge.
 */
export class LocalPredictor {
  private body: MovableBody | null = null;
  private pending: InputMessage[] = [];
  private seq = 0;
  private accumulatorMs = 0;
  private lastFrameAt: number | null = null;
  private displayX = 0;
  private displayY = 0;
  private hasDisplay = false;
  spectator = false;
  /** countdown/podium: the server ignores movement, so don't predict any. */
  frozen = true;

  constructor(
    private readonly selfId: string,
    private readonly send: (input: InputMessage) => void,
  ) {}

  frame(now: number, current: CurrentInput): void {
    if (this.lastFrameAt === null) this.lastFrameAt = now;
    const frameDt = Math.min(250, now - this.lastFrameAt);
    this.lastFrameAt = now;
    const body = this.body;
    if (!body || this.spectator) return;

    if (this.frozen) {
      this.accumulatorMs = 0;
    } else {
      this.accumulatorMs += frameDt;
      while (this.accumulatorMs >= TICK_MS) {
        this.accumulatorMs -= TICK_MS;
        this.seq += 1;
        const input: InputMessage = {
          seq: this.seq,
          moveX: current.moveX,
          moveY: current.moveY,
          sprint: current.sprint,
        };
        this.pending.push(input);
        if (this.pending.length > 240) this.pending.shift();
        this.send(input);
        body.input = input;
        stepBody(body, TICK_MS, OBSTACLES);
      }
    }

    if (!this.hasDisplay) {
      this.displayX = body.x;
      this.displayY = body.y;
      this.hasDisplay = true;
    }
    // Ease the rendered position toward the reconciled prediction; snap on teleports.
    if (Math.hypot(body.x - this.displayX, body.y - this.displayY) > 200) {
      this.displayX = body.x;
      this.displayY = body.y;
    } else {
      const alpha = 1 - Math.exp(-frameDt / 40);
      this.displayX += (body.x - this.displayX) * alpha;
      this.displayY += (body.y - this.displayY) * alpha;
    }
  }

  /** Reconciliation: adopt server truth, replay unacknowledged inputs. */
  onSnapshot(snapshot: Snapshot): void {
    const self = snapshot.players.find((player) => player.id === this.selfId);
    if (!self) return;
    this.spectator = self.spectator;
    this.frozen = snapshot.phase === 'countdown' || snapshot.phase === 'podium';

    const body: MovableBody = {
      x: self.x,
      y: self.y,
      stamina: self.stamina,
      sprinting: self.sprinting,
      input: idleInput(),
    };
    this.pending = this.pending.filter((input) => input.seq > snapshot.lastSeq);
    for (const input of this.pending) {
      body.input = input;
      stepBody(body, TICK_MS, OBSTACLES);
    }
    this.body = body;
  }

  state(): (PredictedSelf & { displayX: number; displayY: number }) | null {
    if (!this.body || !this.hasDisplay) return null;
    return {
      x: this.body.x,
      y: this.body.y,
      stamina: this.body.stamina,
      sprinting: this.body.sprinting,
      displayX: this.displayX,
      displayY: this.displayY,
    };
  }
}
