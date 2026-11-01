import { describe, it, expect } from 'bun:test';
import { DEFAULT_GOOGLE_CLIENT_ID } from 'portfolio-common';
import { EnvironmentError, parseEnv } from '../env';

const base = {
  MONGO_URL: 'mongodb://127.0.0.1:27017/portfolio',
  JWT_SECRET: 'test-secret',
  ALLOWED_DOMAINS: '["http://localhost:5173"]'
};

const problemsOf = (source: Record<string, string | undefined>) => {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentError);
    return (error as EnvironmentError).problems;
  }
  throw new Error('expected parseEnv to throw');
};

describe('parseEnv', () => {
  it('applies the documented defaults', () => {
    const env = parseEnv(base);
    expect(env.warnings).toEqual([]);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      ALLOWED_DOMAINS: ['http://localhost:5173'],
      GOOGLE_CLIENT_ID: DEFAULT_GOOGLE_CLIENT_ID,
      HOST: '::',
      hostExplicit: false,
      PORT: 3000,
      AUTH_COOKIE_SAMESITE: 'strict',
      authCookieSecure: false,
      apiDocsEnabled: true,
      otelEnabled: false,
      OTEL_SERVICE_NAME: 'portfolio-server'
    });
  });

  it('lists every missing required variable at once', () => {
    expect(problemsOf({})).toEqual([
      'MONGO_URL is required',
      'JWT_SECRET is required',
      'ALLOWED_DOMAINS is required'
    ]);
  });

  it.each([
    ['not JSON', 'http://localhost:5173'],
    ['not an array', '"http://localhost:5173"'],
    ['not strings', '[5173]'],
  ])('rejects ALLOWED_DOMAINS that is %s', (_label, value) => {
    const problems = problemsOf({ ...base, ALLOWED_DOMAINS: value });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ALLOWED_DOMAINS');
  });

  // These never matched an Origin header, so they cannot take a deploy down
  it.each([
    ['a wildcard', '*'],
    ['not an origin', 'localhost:5173'],
    ['a URL with a path', 'https://example.com/app'],
  ])('ignores an ALLOWED_DOMAINS entry that is %s, with a warning', (_label, value) => {
    const env = parseEnv({ ...base, ALLOWED_DOMAINS: JSON.stringify([value, 'https://example.com']) });
    expect(env.ALLOWED_DOMAINS).toEqual(['https://example.com']);
    expect(env.warnings).toHaveLength(1);
    expect(env.warnings[0]).toContain(JSON.stringify(value));
  });

  it('warns when ALLOWED_DOMAINS lists no valid origin', () => {
    const env = parseEnv({ ...base, ALLOWED_DOMAINS: '["*"]' });
    expect(env.ALLOWED_DOMAINS).toEqual([]);
    expect(env.warnings.at(-1)).toContain('no valid origin');
  });

  it('normalizes origins (trailing slash)', () => {
    const env = parseEnv({ ...base, ALLOWED_DOMAINS: '["https://example.com/", "http://localhost:4173"]' });
    expect(env.ALLOWED_DOMAINS).toEqual(['https://example.com', 'http://localhost:4173']);
  });

  it('rejects a MONGO_URL that is not a MongoDB connection string', () => {
    expect(problemsOf({ ...base, MONGO_URL: 'localhost:27017' })[0]).toContain('MONGO_URL');
  });

  it('parses PORT and rejects invalid ones', () => {
    expect(parseEnv({ ...base, PORT: '3101' }).PORT).toBe(3101);
    expect(problemsOf({ ...base, PORT: 'abc' })[0]).toContain('PORT');
    expect(problemsOf({ ...base, PORT: '70000' })[0]).toContain('PORT');
  });

  it('marks an explicit HOST (no IPv4 fallback)', () => {
    expect(parseEnv({ ...base, HOST: '0.0.0.0' })).toMatchObject({ HOST: '0.0.0.0', hostExplicit: true });
  });

  it('uses GOOGLE_CLIENT_ID when set', () => {
    expect(parseEnv({ ...base, GOOGLE_CLIENT_ID: 'mine.apps.googleusercontent.com' }).GOOGLE_CLIENT_ID)
      .toBe('mine.apps.googleusercontent.com');
  });

  it('warns about a short JWT_SECRET in production', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).warnings[0]).toContain('JWT_SECRET');
    expect(parseEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).warnings).toEqual([]);
  });

  it('makes the cookie Secure in production and with SameSite=None', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).authCookieSecure).toBe(true);
    expect(parseEnv({ ...base, AUTH_COOKIE_SAMESITE: 'none' })).toMatchObject({
      AUTH_COOKIE_SAMESITE: 'none',
      authCookieSecure: true
    });
    expect(parseEnv({ ...base, AUTH_COOKIE_SAMESITE: 'Lax' }).AUTH_COOKIE_SAMESITE).toBe('lax');
    expect(problemsOf({ ...base, AUTH_COOKIE_SAMESITE: 'loose' })[0]).toContain('AUTH_COOKIE_SAMESITE');
  });

  it('serves API docs in production only with API_DOCS=true', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).apiDocsEnabled).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'production', API_DOCS: 'true' }).apiDocsEnabled).toBe(true);
  });

  it('enables telemetry only with an OTLP endpoint', () => {
    expect(parseEnv({ ...base, OTEL_EXPORTER_OTLP_ENDPOINT: '' }).otelEnabled).toBe(false);
    expect(parseEnv({ ...base, OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com' }).otelEnabled)
      .toBe(true);
  });
});
