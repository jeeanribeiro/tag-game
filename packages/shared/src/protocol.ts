import { z } from 'zod';
import { MAX_NICKNAME_LENGTH, ROOM_CODE_LENGTH } from './constants';

export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((code) => code.toUpperCase());

/** First message a client sends. Anything that does not parse is rejected. */
export const joinMessageSchema = z.strictObject({
  nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH),
  roomCode: roomCodeSchema.optional(),
});

export type JoinMessage = z.infer<typeof joinMessageSchema>;

/**
 * The ONLY gameplay message a client can send: a unit-clamped move intent.
 * Position, speed, stamina and tags are computed exclusively on the server,
 * so editing client state in devtools moves nothing but local pixels.
 */
export const inputMessageSchema = z.strictObject({
  seq: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31),
  moveX: z.number().min(-1).max(1),
  moveY: z.number().min(-1).max(1),
  sprint: z.boolean(),
});

export type InputMessage = z.infer<typeof inputMessageSchema>;
