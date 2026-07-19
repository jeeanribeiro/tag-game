import { describe, expect, it } from 'vitest';
import { inputMessageSchema, joinMessageSchema } from '../src/index';

describe('joinMessageSchema', () => {
  it('accepts a nickname with an optional room code and uppercases the code', () => {
    const parsed = joinMessageSchema.parse({ nickname: '  Ada ', roomCode: 'ab2z' });
    expect(parsed.nickname).toBe('Ada');
    expect(parsed.roomCode).toBe('AB2Z');
  });

  it('rejects empty and oversized nicknames', () => {
    expect(joinMessageSchema.safeParse({ nickname: '   ' }).success).toBe(false);
    expect(joinMessageSchema.safeParse({ nickname: 'x'.repeat(40) }).success).toBe(false);
  });

  it('rejects malformed room codes and unknown keys', () => {
    expect(joinMessageSchema.safeParse({ nickname: 'Ada', roomCode: 'toolong' }).success).toBe(
      false,
    );
    expect(joinMessageSchema.safeParse({ nickname: 'Ada', admin: true }).success).toBe(false);
  });
});

describe('inputMessageSchema', () => {
  const valid = { seq: 1, moveX: 0.5, moveY: -1, sprint: false };

  it('accepts a well-formed input', () => {
    expect(inputMessageSchema.parse(valid)).toEqual(valid);
  });

  it('rejects out-of-range move vectors (no speed hacking via the wire)', () => {
    expect(inputMessageSchema.safeParse({ ...valid, moveX: 50 }).success).toBe(false);
    expect(inputMessageSchema.safeParse({ ...valid, moveY: -1.01 }).success).toBe(false);
  });

  it('rejects NaN, Infinity and non-numeric values', () => {
    expect(inputMessageSchema.safeParse({ ...valid, moveX: Number.NaN }).success).toBe(false);
    expect(inputMessageSchema.safeParse({ ...valid, moveY: Infinity }).success).toBe(false);
    expect(inputMessageSchema.safeParse({ ...valid, seq: '1' }).success).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(inputMessageSchema.safeParse({ ...valid, speed: 9000 }).success).toBe(false);
  });
});
