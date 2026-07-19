import { ROOM_CODE_LENGTH } from '@tag-game/shared';
import type { SimOptions } from '@tag-game/shared';
import { Room } from './room';

/** No 0/O or 1/I so codes survive being read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 200;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly roomOptions: Partial<SimOptions> = {}) {}

  get size(): number {
    return this.rooms.size;
  }

  create(): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code: string;
    do {
      code = this.generateCode();
    } while (this.rooms.has(code));
    const room = new Room(code, this.roomOptions);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Remove a socket from its room and garbage-collect the room when empty. */
  leave(room: Room, socketId: string): void {
    room.leave(socketId);
    if (room.isEmpty) this.rooms.delete(room.code);
  }

  closeAll(): void {
    for (const room of this.rooms.values()) room.stop();
    this.rooms.clear();
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }
}
