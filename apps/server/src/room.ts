import type { Server, Socket } from 'socket.io';
import {
  INPUT_QUEUE_MAX,
  SNAPSHOT_EVERY,
  TICK_MS,
  addPlayer,
  createRoomState,
  defaultSimOptions,
  removePlayer,
  stepRoom,
} from '@tag-game/shared';
import type {
  ClientToServerEvents,
  InputMessage,
  PlayerSnapshot,
  ServerToClientEvents,
  SimOptions,
  Snapshot,
} from '@tag-game/shared';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * One room = one authoritative simulation.
 *
 * A fixed-timestep loop advances the world at 60 Hz regardless of interval
 * jitter (the pump accumulates real elapsed time and steps in exact TICK_MS
 * increments). Every 3rd tick (~20 Hz) a snapshot is broadcast; each player
 * additionally receives the sequence number of their last applied input so
 * the client can reconcile its prediction.
 */
export class Room {
  readonly state = createRoomState();
  private readonly options: SimOptions;
  private readonly sockets = new Map<string, GameSocket>();
  private readonly inputQueues = new Map<string, InputMessage[]>();
  private tickCount = 0;
  private accumulatorMs = 0;
  private lastPumpAt = 0;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    readonly code: string,
    overrides: Partial<SimOptions> = {},
  ) {
    this.options = { ...defaultSimOptions(), ...overrides };
  }

  get playerCount(): number {
    return this.sockets.size;
  }

  get isEmpty(): boolean {
    return this.sockets.size === 0;
  }

  join(socket: GameSocket, nickname: string): void {
    this.sockets.set(socket.id, socket);
    this.inputQueues.set(socket.id, []);
    addPlayer(this.state, socket.id, nickname, this.options);
    void socket.join(this.code);
    if (!this.interval) this.start();
  }

  leave(socketId: string): void {
    this.sockets.delete(socketId);
    this.inputQueues.delete(socketId);
    removePlayer(this.state, socketId);
    if (this.isEmpty) this.stop();
  }

  /** Queue a validated input; one is consumed per tick. Bounded so a client cannot build a backlog. */
  queueInput(socketId: string, input: InputMessage): void {
    const queue = this.inputQueues.get(socketId);
    if (!queue) return;
    if (queue.length >= INPUT_QUEUE_MAX) queue.shift();
    queue.push(input);
  }

  start(): void {
    this.lastPumpAt = Date.now();
    this.accumulatorMs = 0;
    // Pump twice per tick; the accumulator turns wall time into exact fixed steps.
    this.interval = setInterval(this.pump, TICK_MS / 2);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private readonly pump = (): void => {
    const now = Date.now();
    let elapsed = now - this.lastPumpAt;
    this.lastPumpAt = now;
    // Cap catch-up work after event-loop stalls instead of spiraling.
    if (elapsed > 250) elapsed = 250;
    this.accumulatorMs += elapsed;
    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS;
      this.tick();
    }
  };

  private tick(): void {
    this.tickCount += 1;

    for (const [id, player] of Object.entries(this.state.players)) {
      const input = this.inputQueues.get(id)?.shift();
      if (input) {
        player.input = input;
        player.lastSeq = input.seq;
      }
      // No fresh input: the last one keeps applying (a held key stays held).
    }

    const events = stepRoom(this.state, TICK_MS, this.options);
    for (const event of events) {
      if (event.type === 'tag') {
        for (const socket of this.sockets.values()) {
          socket.emit('tag', {
            oldItId: event.oldItId,
            newItId: event.newItId,
            x: event.x,
            y: event.y,
          });
        }
      }
    }

    if (this.tickCount % SNAPSHOT_EVERY === 0) this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    const players: PlayerSnapshot[] = Object.values(this.state.players).map((player) => ({
      id: player.id,
      nickname: player.nickname,
      colorIndex: player.colorIndex,
      x: player.x,
      y: player.y,
      stamina: player.stamina,
      sprinting: player.sprinting,
      spectator: player.spectator,
      scoreMs: player.scoreMs,
    }));

    const base: Omit<Snapshot, 'lastSeq'> = {
      tick: this.tickCount,
      phase: this.state.phase,
      phaseRemainingMs: Math.max(0, Math.round(this.state.phaseRemainingMs)),
      roundNumber: this.state.roundNumber,
      itId: this.state.itId,
      immunityMs: Math.max(0, Math.round(this.state.immunityRemainingMs)),
      players,
      podium: this.state.podium,
    };

    for (const [id, socket] of this.sockets) {
      socket.emit('snapshot', { ...base, lastSeq: this.state.players[id]?.lastSeq ?? 0 });
    }
  }
}
