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
      OTEL_SERVICE_NAME: 'portfolio-server',
      OTEL_SDK_DISABLED: false,
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'otlp',
      otelSignals: { traces: false, metrics: false, logs: false },
      MEMORY_LOG_INTERVAL_MS: 600_000,
      ANTHROPIC_API_KEY: undefined,
      RESUME_IMPORT_MONTHLY_LIMIT: 3,
      RESUME_IMPORT_DAILY_LIMIT: 30,
      RESUME_IMPORT_ATTEMPTS_PER_DAY: 10,
      JOB_IMPORT_DAILY_LIMIT: 30,
      JOB_IMPORT_ATTEMPTS_PER_DAY: 10,
      GITHUB_ISSUES_TOKEN: undefined,
      GITHUB_ISSUES_REPO: 'lomithrani/portfolio'
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

  it('enables Google Calendar only with GOOGLE_CLIENT_SECRET', () => {
    expect(parseEnv(base)).toMatchObject({ GOOGLE_CLIENT_SECRET: undefined, googleCalendarEnabled: false });
    expect(parseEnv({ ...base, GOOGLE_CLIENT_SECRET: '  ' }).googleCalendarEnabled).toBe(false);
    expect(parseEnv({ ...base, GOOGLE_CLIENT_SECRET: ' GOCSPX-abc_123 ' })).toMatchObject({
      GOOGLE_CLIENT_SECRET: 'GOCSPX-abc_123',
      googleCalendarEnabled: true
    });
  });

  it.each([
    ['quoted', '"GOCSPX-abc"'],
    ['with a space inside', 'GOCSPX abc'],
  ])('rejects a GOOGLE_CLIENT_SECRET %s', (_label, value) => {
    const problems = problemsOf({ ...base, GOOGLE_CLIENT_SECRET: value });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('GOOGLE_CLIENT_SECRET');
    // The secret itself is never echoed into logs
    expect(problems[0]).not.toContain('abc');
  });

  describe('step suggestions', () => {
    it('reads GITHUB_ISSUES_TOKEN trimmed, an empty one as unset, and the repository', () => {
      expect(parseEnv({ ...base, GITHUB_ISSUES_TOKEN: '  ' }).GITHUB_ISSUES_TOKEN).toBeUndefined();
      const parsed = parseEnv({ ...base, GITHUB_ISSUES_TOKEN: ' github_pat_11ABC_def ', GITHUB_ISSUES_REPO: ' octo-org/some.repo_1 ' });
      expect(parsed.GITHUB_ISSUES_TOKEN).toBe('github_pat_11ABC_def');
      expect(parsed.GITHUB_ISSUES_REPO).toBe('octo-org/some.repo_1');
    });

    it.each([
      ['quoted', '"github_pat_topsecret"'],
      ['with a space inside', 'github_pat topsecret']
    ])('rejects a GITHUB_ISSUES_TOKEN %s, without repeating it', (_label, value) => {
      const problems = problemsOf({ ...base, GITHUB_ISSUES_TOKEN: value });
      expect(problems).toEqual(['GITHUB_ISSUES_TOKEN must be the bare GitHub token (no quotes or spaces)']);
      expect(problems[0]).not.toContain('topsecret');
    });

    it.each(['portfolio', 'https://github.com/octo/portfolio', 'octo/portfolio/issues', 'octo/port folio', '-octo/portfolio', 'octo/../x', 'octo/..', 'octo/.'])(
      'rejects a GITHUB_ISSUES_REPO that is not owner/name: %s',
      (value) => {
        expect(problemsOf({ ...base, GITHUB_ISSUES_REPO: value })).toEqual([
          `GITHUB_ISSUES_REPO must be a GitHub repository as owner/name (got ${JSON.stringify(value)})`
        ]);
      }
    );
  });

  describe('résumé import', () => {
    it('reads ANTHROPIC_API_KEY trimmed, an empty one as unset', () => {
      expect(parseEnv({ ...base, ANTHROPIC_API_KEY: '  ' }).ANTHROPIC_API_KEY).toBeUndefined();
      expect(parseEnv({ ...base, ANTHROPIC_API_KEY: ' sk-ant-api03-abc_DEF-123 ' }).ANTHROPIC_API_KEY)
        .toBe('sk-ant-api03-abc_DEF-123');
    });

    it.each([
      ['quoted', '"sk-ant-api03-topsecret"'],
      ['single-quoted', "'sk-ant-api03-topsecret'"],
      ['with a space inside', 'sk-ant-api03 topsecret'],
    ])('rejects an ANTHROPIC_API_KEY %s, without repeating it', (_label, value) => {
      const problems = problemsOf({ ...base, ANTHROPIC_API_KEY: value });
      expect(problems).toEqual([
        'ANTHROPIC_API_KEY must be the bare API key from the Claude Console (no quotes or spaces)'
      ]);
      expect(problems[0]).not.toContain('topsecret');
    });

    it('parses the limits: whole numbers, 0 included (feature off)', () => {
      expect(
        parseEnv({ ...base, RESUME_IMPORT_MONTHLY_LIMIT: ' 5 ', RESUME_IMPORT_DAILY_LIMIT: '0', RESUME_IMPORT_ATTEMPTS_PER_DAY: '4' })
      ).toMatchObject({
        RESUME_IMPORT_MONTHLY_LIMIT: 5,
        RESUME_IMPORT_DAILY_LIMIT: 0,
        RESUME_IMPORT_ATTEMPTS_PER_DAY: 4
      });
      expect(
        parseEnv({ ...base, RESUME_IMPORT_MONTHLY_LIMIT: '', RESUME_IMPORT_DAILY_LIMIT: ' ', RESUME_IMPORT_ATTEMPTS_PER_DAY: '' })
      ).toMatchObject({
        RESUME_IMPORT_MONTHLY_LIMIT: 3,
        RESUME_IMPORT_DAILY_LIMIT: 30,
        RESUME_IMPORT_ATTEMPTS_PER_DAY: 10
      });
    });

    it.each(['-1', '2.5', '1e3', '0x10', 'three', '99999999999999999999'])(
      'rejects the limit %p',
      (value) => {
        expect(problemsOf({ ...base, RESUME_IMPORT_MONTHLY_LIMIT: value })).toEqual([
          `RESUME_IMPORT_MONTHLY_LIMIT must be a whole number, 0 (résumé import off) or more (got ${JSON.stringify(value)})`
        ]);
        expect(problemsOf({ ...base, RESUME_IMPORT_DAILY_LIMIT: value })[0]).toStartWith('RESUME_IMPORT_DAILY_LIMIT');
        expect(problemsOf({ ...base, RESUME_IMPORT_ATTEMPTS_PER_DAY: value })[0]).toStartWith('RESUME_IMPORT_ATTEMPTS_PER_DAY');
      }
    );
  });

  describe('job description import', () => {
    it('parses the limits: whole numbers, 0 included (feature off)', () => {
      expect(parseEnv({ ...base, JOB_IMPORT_DAILY_LIMIT: ' 50 ', JOB_IMPORT_ATTEMPTS_PER_DAY: '0' })).toMatchObject({
        JOB_IMPORT_DAILY_LIMIT: 50,
        JOB_IMPORT_ATTEMPTS_PER_DAY: 0
      });
      expect(parseEnv({ ...base, JOB_IMPORT_DAILY_LIMIT: '', JOB_IMPORT_ATTEMPTS_PER_DAY: ' ' })).toMatchObject({
        JOB_IMPORT_DAILY_LIMIT: 30,
        JOB_IMPORT_ATTEMPTS_PER_DAY: 10
      });
    });

    it('reads them apart from the résumé import limits', () => {
      expect(parseEnv({ ...base, RESUME_IMPORT_DAILY_LIMIT: '0', RESUME_IMPORT_ATTEMPTS_PER_DAY: '1' })).toMatchObject({
        JOB_IMPORT_DAILY_LIMIT: 30,
        JOB_IMPORT_ATTEMPTS_PER_DAY: 10
      });
    });

    it.each(['-1', '2.5', '1e3', '0x10', 'three', '99999999999999999999'])('rejects the limit %p', (value) => {
      // 0 turns the job description import off, not the résumé import
      expect(problemsOf({ ...base, JOB_IMPORT_DAILY_LIMIT: value, JOB_IMPORT_ATTEMPTS_PER_DAY: value })).toEqual([
        `JOB_IMPORT_DAILY_LIMIT must be a whole number, 0 (job description import off) or more (got ${JSON.stringify(value)})`,
        `JOB_IMPORT_ATTEMPTS_PER_DAY must be a whole number, 0 (job description import off) or more (got ${JSON.stringify(value)})`
      ]);
    });
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

  it('reads the client IP from the socket, X-Real-IP on Railway, or CLIENT_IP_HEADER', () => {
    expect(parseEnv(base).CLIENT_IP_HEADER).toBeUndefined();
    // Railway sets RAILWAY_PROJECT_ID on every deployment, and X-Real-IP at its edge
    expect(parseEnv({ ...base, RAILWAY_PROJECT_ID: 'b2c4' }).CLIENT_IP_HEADER).toBe('x-real-ip');
    expect(parseEnv({ ...base, RAILWAY_PROJECT_ID: 'b2c4', CLIENT_IP_HEADER: 'CF-Connecting-IP' }).CLIENT_IP_HEADER)
      .toBe('cf-connecting-ip');
    expect(problemsOf({ ...base, CLIENT_IP_HEADER: 'X Real IP' })[0]).toContain('CLIENT_IP_HEADER');
  });

  it('enables telemetry only with an OTLP endpoint', () => {
    expect(parseEnv({ ...base, OTEL_EXPORTER_OTLP_ENDPOINT: '' }).otelEnabled).toBe(false);
    expect(parseEnv({ ...base, OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com' })).toMatchObject({
      otelEnabled: true,
      otelSignals: { traces: true, metrics: true, logs: true }
    });
  });

  describe('OpenTelemetry switches', () => {
    const otel = { ...base, OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com' };

    it('turns everything off with OTEL_SDK_DISABLED=true (any case), as without an endpoint', () => {
      for (const value of ['true', 'TRUE', ' True ']) {
        expect(parseEnv({ ...otel, OTEL_SDK_DISABLED: value })).toMatchObject({
          OTEL_SDK_DISABLED: true,
          otelEnabled: false,
          otelSignals: { traces: false, metrics: false, logs: false }
        });
      }
      for (const value of ['false', 'False', '', ' ']) {
        expect(parseEnv({ ...otel, OTEL_SDK_DISABLED: value })).toMatchObject({
          OTEL_SDK_DISABLED: false,
          otelEnabled: true
        });
      }
    });

    it.each([
      ['OTEL_TRACES_EXPORTER', { traces: false, metrics: true, logs: true }],
      ['OTEL_METRICS_EXPORTER', { traces: true, metrics: false, logs: true }],
      ['OTEL_LOGS_EXPORTER', { traces: true, metrics: true, logs: false }]
    ] as const)('%s=none turns off that signal only', (name, signals) => {
      for (const value of ['none', 'NONE', ' none ']) {
        const env = parseEnv({ ...otel, [name]: value });
        expect(env[name]).toBe('none');
        expect(env.otelEnabled).toBe(true);
        expect(env.otelSignals).toEqual(signals);
      }
      expect(parseEnv({ ...otel, [name]: 'OTLP' })[name]).toBe('otlp');
    });

    it('keeps the SDK on when every signal is none (OTEL_SDK_DISABLED=true is the full off)', () => {
      const env = parseEnv({
        ...otel,
        OTEL_TRACES_EXPORTER: 'none',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_LOGS_EXPORTER: 'none'
      });
      expect(env.otelEnabled).toBe(true);
      expect(env.otelSignals).toEqual({ traces: false, metrics: false, logs: false });
    });

    it('validates the switches even while telemetry is off', () => {
      expect(parseEnv({ ...base, OTEL_METRICS_EXPORTER: 'none' })).toMatchObject({
        OTEL_METRICS_EXPORTER: 'none',
        otelEnabled: false
      });
      expect(problemsOf({ ...base, OTEL_TRACES_EXPORTER: 'console' })).toEqual([
        'OTEL_TRACES_EXPORTER must be otlp (the default) or none (got "console")'
      ]);
    });

    it('rejects values the SDK would ignore, all at once', () => {
      expect(
        problemsOf({
          ...otel,
          OTEL_SDK_DISABLED: 'yes',
          OTEL_TRACES_EXPORTER: 'otlp,none',
          OTEL_METRICS_EXPORTER: 'prometheus',
          OTEL_LOGS_EXPORTER: 'off'
        })
      ).toEqual([
        'OTEL_SDK_DISABLED must be true or false (got "yes")',
        'OTEL_TRACES_EXPORTER must be otlp (the default) or none (got "otlp,none")',
        'OTEL_METRICS_EXPORTER must be otlp (the default) or none (got "prometheus")',
        'OTEL_LOGS_EXPORTER must be otlp (the default) or none (got "off")'
      ]);
    });
  });

  describe('MEMORY_LOG_INTERVAL_MS', () => {
    it('defaults to 10 minutes and accepts 0 (off) or 1 s up to the timer limit', () => {
      expect(parseEnv({ ...base, MEMORY_LOG_INTERVAL_MS: '' }).MEMORY_LOG_INTERVAL_MS).toBe(600_000);
      expect(parseEnv({ ...base, MEMORY_LOG_INTERVAL_MS: '0' }).MEMORY_LOG_INTERVAL_MS).toBe(0);
      expect(parseEnv({ ...base, MEMORY_LOG_INTERVAL_MS: ' 1000 ' }).MEMORY_LOG_INTERVAL_MS).toBe(1000);
      expect(parseEnv({ ...base, MEMORY_LOG_INTERVAL_MS: '2147483647' }).MEMORY_LOG_INTERVAL_MS)
        .toBe(2_147_483_647);
    });

    it.each(['abc', '-1', '999', '1.5', '2147483648', 'Infinity', '1e3', '0x3e8'])('rejects %p', (value) => {
      const problems = problemsOf({ ...base, MEMORY_LOG_INTERVAL_MS: value });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('MEMORY_LOG_INTERVAL_MS must be 0 (off)');
    });
  });
});
