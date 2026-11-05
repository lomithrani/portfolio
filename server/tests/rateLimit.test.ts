// Fixed-window counters of services/rateLimit.ts against a real MongoDB
// (MONGO_URL, local or from TEST_MONGO_URL). Each test counts on keys of its
// own, named with a unique suffix, and removes them after.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { RateLimitCounter } from '../models/database';
import { consumeRateLimit, peekRateLimit, refundRateLimit, takeRateLimit } from '../services/rateLimit';
import { assertDisposableDatabase } from './testDatabase';

const HOUR = 60 * 60_000;
const limit = { limit: 2, windowMs: HOUR };

let connected = false;
const keys: string[] = [];

/** A key no other test uses */
const newKey = () => {
  const key = `rate-limit-test:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  keys.push(key);
  return key;
};

const windowEnd = () => new Date((Math.floor(Date.now() / HOUR) + 1) * HOUR);

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await RateLimitCounter.init();
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

afterEach(async () => {
  if (connected && keys.length > 0) {
    await RateLimitCounter.deleteMany({ _id: { $regex: `^(${keys.join('|')}):` } });
  }
  keys.length = 0;
});

describe('takeRateLimit', () => {
  it('counts every request, says when one is over the limit, and when the window ends', async () => {
    const key = newKey();

    const first = await takeRateLimit(key, limit);
    expect(first).toEqual({
      counterId: `${key}:${windowEnd().getTime() - HOUR}`,
      count: 1,
      resetsAt: windowEnd(),
      retryAfterSeconds: null
    });
    expect((await takeRateLimit(key, limit)).retryAfterSeconds).toBeNull();

    const over = await takeRateLimit(key, limit);
    expect(over.count).toBe(3);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
    expect(over.retryAfterSeconds).toBeLessThanOrEqual(HOUR / 1000);
  });

  it('gives each of concurrent requests its own count', async () => {
    const key = newKey();
    const taken = await Promise.all(Array.from({ length: 5 }, () => takeRateLimit(key, limit)));
    expect(taken.map((result) => result.count).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(taken.filter((result) => result.retryAfterSeconds === null)).toHaveLength(2);
  });

  it('stores the counter with its window end, for MongoDB to delete it', async () => {
    const key = newKey();
    const { counterId } = await takeRateLimit(key, limit);
    const stored: unknown = await RateLimitCounter.findById(counterId).lean();
    expect(stored).toEqual({ _id: counterId, count: 1, expiresAt: windowEnd() });
  });
});

describe('consumeRateLimit', () => {
  it('returns null while allowed, then the seconds left in the window', async () => {
    const key = newKey();
    expect(await consumeRateLimit(key, limit)).toBeNull();
    expect(await consumeRateLimit(key, limit)).toBeNull();
    expect(await consumeRateLimit(key, limit)).toBeGreaterThan(0);
  });
});

describe('refundRateLimit', () => {
  it('gives one request back, on the counter it was counted on', async () => {
    const key = newKey();
    await takeRateLimit(key, limit);
    const second = await takeRateLimit(key, limit);

    await refundRateLimit(second.counterId);
    expect((await peekRateLimit(key, limit)).count).toBe(1);
    // A refunded slot can be taken again
    expect((await takeRateLimit(key, limit)).retryAfterSeconds).toBeNull();
  });

  it('never goes below 0', async () => {
    const key = newKey();
    const { counterId } = await takeRateLimit(key, limit);
    await refundRateLimit(counterId);
    await refundRateLimit(counterId);
    expect(await RateLimitCounter.findById(counterId).lean()).toMatchObject({ count: 0 });
  });

  it('does nothing once the counter is gone (its window is over)', async () => {
    const key = newKey();
    const counterId = `${key}:0`;
    await refundRateLimit(counterId);
    expect(await RateLimitCounter.findById(counterId).lean()).toBeNull();
  });
});

describe('peekRateLimit', () => {
  it('reads the current count without counting', async () => {
    const key = newKey();
    expect(await peekRateLimit(key, limit)).toEqual({ count: 0, resetsAt: windowEnd() });
    // Nothing is created by a read
    expect(await RateLimitCounter.countDocuments({ _id: { $regex: `^${key}:` } })).toBe(0);

    await takeRateLimit(key, limit);
    await peekRateLimit(key, limit);
    expect(await peekRateLimit(key, limit)).toEqual({ count: 1, resetsAt: windowEnd() });
  });
});
