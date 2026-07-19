/** Classic token bucket: allows short bursts, enforces a steady rate. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefill = now;
  }

  tryRemove(now = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

/** Clients legitimately send 60 inputs/s; anything wildly above that is dropped. */
export const INPUT_BUCKET_CAPACITY = 180;
export const INPUT_BUCKET_REFILL_PER_S = 90;
