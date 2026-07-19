import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  InputMessage,
  JoinResult,
  ServerToClientEvents,
  Snapshot,
  TagBroadcast,
} from '@tag-game/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Thin typed wrapper around the socket.io connection. */
export class NetClient {
  private socket: GameSocket | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      const socket: GameSocket = this.socket ?? io();
      this.socket = socket;
      const timer = setTimeout(() => {
        reject(new Error('Could not reach the server.'));
      }, 8000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Connection failed.'));
      });
    });
  }

  join(nickname: string, roomCode?: string): Promise<JoinResult> {
    const socket = this.socket;
    if (!socket) return Promise.resolve({ ok: false, error: 'Not connected.' });
    return new Promise((resolve) => {
      const message = roomCode ? { nickname, roomCode } : { nickname };
      socket.timeout(8000).emit('join', message, (error, result) => {
        if (error || !result) resolve({ ok: false, error: 'Join timed out.' });
        else resolve(result);
      });
    });
  }

  /** Inputs are volatile: a lost packet is stale by the next tick anyway. */
  sendInput(input: InputMessage): void {
    this.socket?.volatile.emit('input', input);
  }

  onSnapshot(handler: (snapshot: Snapshot) => void): void {
    this.socket?.on('snapshot', handler);
  }

  onTag(handler: (event: TagBroadcast) => void): void {
    this.socket?.on('tag', handler);
  }

  onDisconnect(handler: () => void): void {
    this.socket?.on('disconnect', handler);
  }
}
