import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { MAX_PLAYERS_PER_ROOM, inputMessageSchema, joinMessageSchema } from '@tag-game/shared';
import type { SimOptions } from '@tag-game/shared';
import { INPUT_BUCKET_CAPACITY, INPUT_BUCKET_REFILL_PER_S, TokenBucket } from './rateLimit';
import type { GameServer } from './room';
import type { Room } from './room';
import { RoomManager } from './roomManager';

export interface GameServerOptions {
  port: number;
  host?: string;
  /** Directory with the built web client, or null to run API-only (tests). */
  webDistPath?: string | null;
  /** Override room timings/spawns — used by the integration tests. */
  roomOptions?: Partial<SimOptions>;
}

export interface RunningGameServer {
  port: number;
  httpServer: HttpServer;
  io: GameServer;
  close: () => Promise<void>;
}

export async function createGameServer(options: GameServerOptions): Promise<RunningGameServer> {
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  if (options.webDistPath && existsSync(options.webDistPath)) {
    app.use(express.static(options.webDistPath));
  }

  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer, { serveClient: false });
  const manager = new RoomManager(options.roomOptions);

  io.on('connection', (socket) => {
    let room: Room | null = null;
    const inputBucket = new TokenBucket(INPUT_BUCKET_CAPACITY, INPUT_BUCKET_REFILL_PER_S);
    const joinBucket = new TokenBucket(3, 0.5);

    socket.on('join', (raw, ack) => {
      if (typeof ack !== 'function') return;
      if (!joinBucket.tryRemove()) {
        ack({ ok: false, error: 'Too many join attempts, slow down.' });
        return;
      }
      if (room) {
        ack({ ok: false, error: 'Already in a room.' });
        return;
      }
      const parsed = joinMessageSchema.safeParse(raw);
      if (!parsed.success) {
        ack({ ok: false, error: 'Invalid join message.' });
        return;
      }
      const { nickname, roomCode } = parsed.data;

      let target: Room | null;
      if (roomCode) {
        target = manager.get(roomCode) ?? null;
        if (!target) {
          ack({ ok: false, error: `Room ${roomCode} not found.` });
          return;
        }
        if (target.playerCount >= MAX_PLAYERS_PER_ROOM) {
          ack({ ok: false, error: `Room ${roomCode} is full.` });
          return;
        }
      } else {
        target = manager.create();
        if (!target) {
          ack({ ok: false, error: 'Server is at capacity, try again later.' });
          return;
        }
      }

      target.join(socket, nickname);
      room = target;
      ack({ ok: true, roomCode: target.code, selfId: socket.id });
    });

    socket.on('input', (raw) => {
      if (!room) return;
      if (!inputBucket.tryRemove()) return; // flooding: drop silently
      const parsed = inputMessageSchema.safeParse(raw);
      if (!parsed.success) return; // malformed: drop, never trust
      room.queueInput(socket.id, parsed.data);
    });

    socket.on('disconnect', () => {
      if (room) {
        manager.leave(room, socket.id);
        room = null;
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host ?? '0.0.0.0', () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  return {
    port: options.port,
    httpServer,
    io,
    close: async () => {
      manager.closeAll();
      io.disconnectSockets(true);
      await io.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
    },
  };
}
