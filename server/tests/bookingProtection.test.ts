// Pure helpers of the POST /appointments/book protection. The rate limits and
// reservations themselves run against MongoDB in appointments.test.ts.
import { describe, it, expect, afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { env } from '../env';
import { clientAddress, rateLimitAddress } from '../services/clientAddress';
import { normalizeEmail } from '../services/appointmentBookings';
import { hashValue } from '../services/rateLimit';

describe('clientAddress', () => {
  const savedHeader = env.CLIENT_IP_HEADER;
  afterEach(() => {
    env.CLIENT_IP_HEADER = savedHeader;
  });

  const socket = { requestIP: () => ({ address: '10.0.0.7' }) };
  const request = (headers: Record<string, string> = {}) => new Request('http://localhost/', { headers });

  it("uses the socket's peer without a configured header, ignoring forwarded ones", () => {
    env.CLIENT_IP_HEADER = undefined;
    expect(clientAddress(request({ 'X-Real-IP': '203.0.113.9' }), socket)).toBe('10.0.0.7');
    expect(clientAddress(request(), null)).toBeNull();
  });

  it('uses the configured header, falling back to the socket without it', () => {
    env.CLIENT_IP_HEADER = 'x-real-ip';
    expect(clientAddress(request({ 'X-Real-IP': ' 203.0.113.9 ' }), socket)).toBe('203.0.113.9');
    expect(clientAddress(request(), socket)).toBe('10.0.0.7');
    expect(clientAddress(request(), null)).toBeNull();
  });

  it('takes the address the closest proxy appended to X-Forwarded-For', () => {
    env.CLIENT_IP_HEADER = 'x-forwarded-for';
    expect(clientAddress(request({ 'X-Forwarded-For': '1.2.3.4, 203.0.113.9' }), socket)).toBe('203.0.113.9');
  });
});

describe('rateLimitAddress', () => {
  it.each([
    ['203.0.113.9', '203.0.113.9'],
    ['::ffff:203.0.113.9', '203.0.113.9'],
    ['2001:db8:a:b:1:2:3:4', '2001:db8:a:b::/64'],
    ['2001:0DB8:000a:000b::1', '2001:db8:a:b::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:db8:a::', '2001:db8:a:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['64:ff9b::203.0.113.9', '64:ff9b:0:0::/64'],
    ['not an address', 'not an address']
  ])('counts %s as %s', (ip, expected) => {
    expect(rateLimitAddress(ip)).toBe(expected);
  });

  it('counts every address of an IPv6 /64 together', () => {
    expect(rateLimitAddress('2001:db8:a:b::1')).toBe(rateLimitAddress('2001:db8:a:b:ffff:ffff:ffff:ffff'));
    expect(rateLimitAddress('2001:db8:a:b::1')).not.toBe(rateLimitAddress('2001:db8:a:c::1'));
  });
});

describe('normalizeEmail', () => {
  it.each([
    [' Jane.Doe@Example.com ', 'jane.doe@example.com'],
    ['jane+recruiting@example.com', 'jane@example.com'],
    ['J.a.n.e+x@GoogleMail.com', 'jane@gmail.com'],
    ['jane.doe@gmail.com', 'janedoe@gmail.com']
  ])('keys %s as %s', (email, expected) => {
    expect(normalizeEmail(email)).toBe(expected);
  });
});

describe('hashValue', () => {
  it('is keyed with the server secret: a plain SHA-256 of a candidate address does not match it', () => {
    const address = 'jane@example.com';
    expect(hashValue(address)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashValue(address)).toBe(hashValue(address));
    expect(hashValue(address)).not.toBe(createHash('sha256').update(address).digest('hex'));
  });
});
