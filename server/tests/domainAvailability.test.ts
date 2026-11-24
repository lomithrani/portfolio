// GET /domain/:name/availability against a real MongoDB (MONGO_URL, local or
// from TEST_MONGO_URL): the live hint of the claim forms. Each test creates
// its own domains and users, named with a suffix unique to that test, and
// removes them (and its rate limit counters) after: tests pass in any order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, RateLimitCounter, User } from '../models/database';
import { rateLimitAddress } from '../services/clientAddress';
import { DOMAIN_AVAILABILITY_REQUESTS_PER_IP } from '../services/domainAvailability';
import { rateLimitKey } from '../services/rateLimit';
import { assertDisposableDatabase } from './testDatabase';

const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `avail-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let t: ReturnType<typeof testNames>;
let app: ReturnType<typeof createApp>;
let connected = false;
/** Rate limit keys this test counted on, removed after it */
let rateLimitKeys: string[] = [];

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), RateLimitCounter.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  app = createApp();
  rateLimitKeys = [];
});

afterEach(async () => {
  mock.restore();
  if (!connected) return;
  const named = new RegExp(`-${t.suffix}(@|$)`);
  await Domain.deleteMany({ name: named });
  await User.deleteMany({ email: named });
  for (const key of rateLimitKeys) {
    await RateLimitCounter.deleteMany({ _id: { $regex: `^${key}:` } });
  }
});

const availability = async (name: string, headers: Record<string, string> = {}) => {
  const response = await app.fetch(
    new Request(`http://localhost/domain/${encodeURIComponent(name)}/availability`, { headers })
  );
  const text = await response.text();
  return { status: response.status, text, headers: response.headers, json: <T = any>() => JSON.parse(text) as T };
};

/** A domain owned by a user of this test */
const createDomain = async (name: string) => {
  const admin = await User.create({ email: t.email(`admin-${name}`), googleId: t.id(`sub-${name}`) });
  await Domain.create({ name, admin: admin._id, experiences: [] });
  return admin;
};

describe('GET /domain/:name/availability', () => {
  it('says a free name is available, normalised as it would be claimed', async () => {
    const name = t.id('free');

    const result = await availability(` ${name.toUpperCase()} `);

    expect(result.status).toBe(200);
    expect(result.json()).toEqual({ name, available: true });
  });

  it("says a claimed name is taken, without anything about its portfolio or owner", async () => {
    const name = t.id('taken');
    const admin = await createDomain(name);
    const exists = spyOn(Domain, 'exists');

    const result = await availability(name.toUpperCase());

    expect(result.status).toBe(200);
    expect(result.json()).toEqual({ name, available: false, reason: 'taken' });
    expect(result.text).not.toContain(admin.id);
    expect(result.text).not.toContain('admin');
    // One existence check (no document loaded or populated)
    expect(exists).toHaveBeenCalledTimes(1);
    expect(exists).toHaveBeenCalledWith({ name });
  });

  it.each(['legal', 'privacy', 'terms', 'cookies', 'account', 'jobs', 'Recruiter', 'opportunities'])(
    'says the route name %s is reserved, without a lookup',
    async (name) => {
      const exists = spyOn(Domain, 'exists');

      const result = await availability(name);

      expect(result.json()).toEqual({ name: name.toLowerCase(), available: false, reason: 'reserved' });
      expect(exists).not.toHaveBeenCalled();
    }
  );

  it.each(['-bad', 'bad-', 'jane..doe', 'wp-login.php', 'config.json', 'og-hire.png', 'a b', 'é', 'x'.repeat(64)])(
    'says %s is not a valid name, without a lookup',
    async (name) => {
      const exists = spyOn(Domain, 'exists');

      const result = await availability(name);

      expect(result.status).toBe(200);
      expect(result.json()).toMatchObject({ available: false, reason: 'invalid' });
      expect(exists).not.toHaveBeenCalled();
    }
  );

  it('refuses a name longer than any claim would take (422)', async () => {
    expect((await availability('x'.repeat(256))).status).toBe(422);
  });

  it('needs no session', async () => {
    const result = await availability(t.id('anonymous'), { Cookie: 'auth=not-a-jwt' });
    expect(result.status).toBe(200);
  });

  it('rate limits lookups per IP address (IPv6: per /64), whatever their answer', async () => {
    const savedHeader = env.CLIENT_IP_HEADER;
    env.CLIENT_IP_HEADER = 'x-real-ip';
    try {
      const group = () => Math.floor(Math.random() * 0x10000).toString(16);
      const network = `2001:db8:${group()}:${group()}`;
      const otherNetwork = `2001:db8:${group()}:${group()}::1`;
      rateLimitKeys = [`${network}::1`, otherNetwork].map((ip) =>
        rateLimitKey('domain-availability:ip', rateLimitAddress(ip))
      );
      const fromNetwork = (host: number) => ({ 'X-Real-IP': `${network}::${host.toString(16)}` });
      const { limit } = DOMAIN_AVAILABILITY_REQUESTS_PER_IP;

      // In batches: each lookup is counted, free, taken or reserved
      for (let first = 1; first <= limit; first += 50) {
        const batch = Array.from({ length: Math.min(50, limit - first + 1) }, (_, i) => first + i);
        const results = await Promise.all(
          batch.map((i) => availability(i % 3 ? t.id(`n${i}`) : 'legal', fromNetwork(i)))
        );
        expect(results.map((result) => result.status)).toEqual(batch.map(() => 200));
      }

      const exists = spyOn(Domain, 'exists');
      const limited = await availability(t.id('one-more'), fromNetwork(0xffff));
      expect(limited.status).toBe(429);
      expect(limited.text).toStartWith('Too many requests from your network. Try again in ');
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(exists).not.toHaveBeenCalled();

      // Another network is not affected
      expect((await availability(t.id('elsewhere'), { 'X-Real-IP': otherNetwork })).status).toBe(200);
    } finally {
      env.CLIENT_IP_HEADER = savedHeader;
    }
  });
});
