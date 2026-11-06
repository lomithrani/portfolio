import { DEFAULT_GOOGLE_CLIENT_ID } from 'portfolio-common';

// Validates and parses the server's environment once, at startup. index.ts
// imports this module FIRST so a misconfigured deploy fails with one clear
// message listing every problem, before any plugin reads its configuration.

export type CookieSameSite = 'strict' | 'lax' | 'none';

/** Value of OTEL_TRACES_EXPORTER / OTEL_METRICS_EXPORTER / OTEL_LOGS_EXPORTER */
export type OtelExporterChoice = 'otlp' | 'none';

export interface OtelSignals {
  traces: boolean;
  metrics: boolean;
  logs: boolean;
}

export interface ServerEnv {
  NODE_ENV: string;
  isProduction: boolean;
  MONGO_URL: string;
  JWT_SECRET: string;
  /** Allowed CORS origins, parsed from the ALLOWED_DOMAINS JSON array */
  ALLOWED_DOMAINS: string[];
  /** Expected audience of Google ID tokens, and the OAuth client of Google Calendar */
  GOOGLE_CLIENT_ID: string;
  /** OAuth client secret of GOOGLE_CLIENT_ID, used to exchange Google Calendar authorization codes */
  GOOGLE_CLIENT_SECRET?: string;
  /** Google Calendar appointments are off unless GOOGLE_CLIENT_SECRET is set */
  googleCalendarEnabled: boolean;
  /** Interface to bind; defaults to '::' (dual-stack) */
  HOST: string;
  /** True when HOST was set explicitly (disables the IPv4 fallback) */
  hostExplicit: boolean;
  PORT: number;
  AUTH_COOKIE_SAMESITE: CookieSameSite;
  /** Secure flag of the auth cookie: production or SameSite=None */
  authCookieSecure: boolean;
  /**
   * Lower-case name of the request header holding the visitor's IP address, set by the
   * reverse proxy (Railway: x-real-ip, the default when RAILWAY_PROJECT_ID is set). Undefined:
   * the socket's peer address. Only used to rate limit public routes
   */
  CLIENT_IP_HEADER?: string;
  /**
   * Claude API key billed for résumé imports (services/resumeImport.ts); the
   * feature is off without it. Secret: never logged, returned or traced
   */
  ANTHROPIC_API_KEY?: string;
  /** Résumé imports per user per 30-day window (0 turns the feature off) */
  RESUME_IMPORT_MONTHLY_LIMIT: number;
  /** Résumé imports per UTC day across all users (0 turns the feature off) */
  RESUME_IMPORT_DAILY_LIMIT: number;
  /**
   * Résumé import attempts per user per UTC day, failed ones included and
   * never given back (0 turns the feature off)
   */
  RESUME_IMPORT_ATTEMPTS_PER_DAY: number;
  /**
   * Job description imports per UTC day across all recruiters (0 turns the
   * feature off). Each recruiter's own allowance is their plan's
   * (portfolio-common RECRUITER_PLANS), for the lifetime of the account
   */
  JOB_IMPORT_DAILY_LIMIT: number;
  /**
   * Job description import attempts per recruiter per UTC day, failed ones
   * included and never given back (0 turns the feature off)
   */
  JOB_IMPORT_ATTEMPTS_PER_DAY: number;
  /** Serve OpenAPI docs (always outside production, opt-in with API_DOCS=true) */
  apiDocsEnabled: boolean;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVICE_NAME: string;
  /** OTEL_SDK_DISABLED=true: telemetry fully off, as without an endpoint */
  OTEL_SDK_DISABLED: boolean;
  /** 'none' drops that signal's processor (or reader) and exporter */
  OTEL_TRACES_EXPORTER: OtelExporterChoice;
  OTEL_METRICS_EXPORTER: OtelExporterChoice;
  OTEL_LOGS_EXPORTER: OtelExporterChoice;
  /**
   * The OpenTelemetry SDK starts: an OTLP endpoint is configured and
   * OTEL_SDK_DISABLED is not true
   */
  otelEnabled: boolean;
  /** Signals exported over OTLP (all false while otelEnabled is false) */
  otelSignals: OtelSignals;
  /** Period of the 'memory' log line in milliseconds; 0 turns it off */
  MEMORY_LOG_INTERVAL_MS: number;
  TLS_PASSPHRASE?: string;
  /** Non-fatal problems, printed at startup */
  warnings: string[];
}

export class EnvironmentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid server environment:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvironmentError';
  }
}

const SAME_SITE_VALUES: readonly CookieSameSite[] = ['strict', 'lax', 'none'];
// RFC 9110 token
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MIN_PRODUCTION_SECRET_LENGTH = 32;

// A value that is not a JSON array of strings is fatal. Entries that are not
// origins are dropped with a warning instead: they never matched a browser's
// Origin header (the check was always an exact comparison), so failing on them
// would only take down a deploy that works.
const parseAllowedDomains = (raw: string, problems: string[], warnings: string[]): string[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    problems.push(
      `ALLOWED_DOMAINS must be a JSON array of origins, e.g. '["https://example.com"]' (got ${JSON.stringify(raw)})`
    );
    return [];
  }

  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
    problems.push('ALLOWED_DOMAINS must be a JSON array of origin strings');
    return [];
  }

  const origins: string[] = [];
  for (const value of parsed as string[]) {
    if (value === '*') {
      warnings.push(
        'ALLOWED_DOMAINS: ignoring "*"; list explicit origins (a wildcard cannot be used with credentialed requests)'
      );
      continue;
    }
    let url: URL | undefined;
    try {
      url = new URL(value);
    } catch {
      // handled below
    }
    if (
      !url ||
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      warnings.push(
        `ALLOWED_DOMAINS: ignoring ${JSON.stringify(value)}; entries must be origins like https://example.com (scheme, host and optional port only)`
      );
      continue;
    }
    // Browsers send the Origin header without a trailing slash
    origins.push(url.origin);
  }

  if (origins.length === 0) {
    warnings.push('ALLOWED_DOMAINS lists no valid origin: browsers cannot call the API');
  }
  return origins;
};

const parsePort = (raw: string | undefined, problems: string[]): number => {
  if (raw === undefined || raw.trim() === '') return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    problems.push(`PORT must be an integer between 0 and 65535 (got ${JSON.stringify(raw)})`);
    return 3000;
  }
  return port;
};

const optional = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

// OpenTelemetry's own switches, read with the specification's rules (values
// are case-insensitive). A value the SDK would ignore with a warning is fatal
// here instead: a mistyped switch must not leave telemetry silently on.
const parseOtelBoolean = (name: string, raw: string | undefined, problems: string[]): boolean => {
  const value = optional(raw)?.toLowerCase();
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  problems.push(`${name} must be true or false (got ${JSON.stringify(raw)})`);
  return false;
};

const parseOtelExporter = (
  name: string,
  raw: string | undefined,
  problems: string[]
): OtelExporterChoice => {
  const value = optional(raw)?.toLowerCase() ?? 'otlp';
  if (value === 'otlp' || value === 'none') return value;
  problems.push(`${name} must be otlp (the default) or none (got ${JSON.stringify(raw)})`);
  return 'otlp';
};

const DEFAULT_MEMORY_LOG_INTERVAL_MS = 600_000;
const MIN_MEMORY_LOG_INTERVAL_MS = 1_000;
// Longest delay setInterval accepts; above it, the timer fires every 1 ms
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const parseMemoryLogInterval = (raw: string | undefined, problems: string[]): number => {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MEMORY_LOG_INTERVAL_MS;
  // Digits only: Number() would also accept '1e3' or '0x3e8'
  const ms = /^\s*\d+\s*$/.test(raw) ? Number(raw) : Number.NaN;
  if (
    !Number.isInteger(ms) ||
    (ms !== 0 && (ms < MIN_MEMORY_LOG_INTERVAL_MS || ms > MAX_TIMER_DELAY_MS))
  ) {
    problems.push(
      `MEMORY_LOG_INTERVAL_MS must be 0 (off) or a whole number of milliseconds from ${MIN_MEMORY_LOG_INTERVAL_MS} to ${MAX_TIMER_DELAY_MS} (got ${JSON.stringify(raw)})`
    );
    return DEFAULT_MEMORY_LOG_INTERVAL_MS;
  }
  return ms;
};

const DEFAULT_RESUME_IMPORT_MONTHLY_LIMIT = 3;
const DEFAULT_RESUME_IMPORT_DAILY_LIMIT = 30;
const DEFAULT_RESUME_IMPORT_ATTEMPTS_PER_DAY = 10;
const DEFAULT_JOB_IMPORT_DAILY_LIMIT = 30;
const DEFAULT_JOB_IMPORT_ATTEMPTS_PER_DAY = 10;

// A count of requests: 0 or more, digits only (Number() would also accept
// '1e3', '0x3e8' or '2.5'); 0 turns `feature` off
const parseLimit = (
  name: string,
  raw: string | undefined,
  defaultValue: number,
  problems: string[],
  feature: string
): number => {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const value = /^\s*\d+\s*$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value)) {
    problems.push(
      `${name} must be a whole number, 0 (${feature} off) or more (got ${JSON.stringify(raw)})`
    );
    return defaultValue;
  }
  return value;
};

export const parseEnv = (source: Record<string, string | undefined>): ServerEnv => {
  const problems: string[] = [];
  const warnings: string[] = [];

  const required = (name: string, { trim = true } = {}) => {
    const value = source[name];
    if (!optional(value)) {
      problems.push(`${name} is required`);
      return '';
    }
    return trim ? value!.trim() : value!;
  };

  const NODE_ENV = optional(source.NODE_ENV) ?? 'development';
  const isProduction = NODE_ENV === 'production';

  const MONGO_URL = required('MONGO_URL');
  if (MONGO_URL && !/^mongodb(\+srv)?:\/\//.test(MONGO_URL)) {
    problems.push('MONGO_URL must start with mongodb:// or mongodb+srv://');
  }

  // Used verbatim: trimming would invalidate sessions signed with the old value
  const JWT_SECRET = required('JWT_SECRET', { trim: false });

  const rawAllowedDomains = required('ALLOWED_DOMAINS');
  const ALLOWED_DOMAINS = rawAllowedDomains
    ? parseAllowedDomains(rawAllowedDomains, problems, warnings)
    : [];

  const rawSameSite = optional(source.AUTH_COOKIE_SAMESITE)?.toLowerCase() ?? 'strict';
  let AUTH_COOKIE_SAMESITE: CookieSameSite = 'strict';
  if ((SAME_SITE_VALUES as readonly string[]).includes(rawSameSite)) {
    AUTH_COOKIE_SAMESITE = rawSameSite as CookieSameSite;
  } else {
    problems.push(`AUTH_COOKIE_SAMESITE must be one of ${SAME_SITE_VALUES.join(', ')}`);
  }

  const host = optional(source.HOST);
  const PORT = parsePort(source.PORT, problems);

  // Copied from the Google Cloud console; a pasted value with quotes or
  // spaces would only fail later, at the first Google Calendar connection
  const GOOGLE_CLIENT_SECRET = optional(source.GOOGLE_CLIENT_SECRET);
  if (GOOGLE_CLIENT_SECRET && /[\s"']/.test(GOOGLE_CLIENT_SECRET)) {
    problems.push(
      'GOOGLE_CLIENT_SECRET must be the bare client secret from the Google Cloud console (no quotes or spaces)'
    );
  }

  // Behind Railway's edge proxy the socket's peer is the proxy: every visitor would share one
  // address. Railway sets X-Real-IP to the visitor's address (and RAILWAY_PROJECT_ID on every
  // deployment), so that is the default there
  const rawClientIpHeader = optional(source.CLIENT_IP_HEADER);
  if (rawClientIpHeader && !HEADER_NAME.test(rawClientIpHeader)) {
    problems.push(
      `CLIENT_IP_HEADER must be an HTTP header name, e.g. X-Real-IP (got ${JSON.stringify(rawClientIpHeader)})`
    );
  }
  const CLIENT_IP_HEADER =
    rawClientIpHeader?.toLowerCase() ??
    (optional(source.RAILWAY_PROJECT_ID) !== undefined ? 'x-real-ip' : undefined);

  // Copied from the Claude Console; like GOOGLE_CLIENT_SECRET, a pasted value
  // with quotes or spaces would only fail at the first import. The message
  // never repeats the value: it is a secret
  const ANTHROPIC_API_KEY = optional(source.ANTHROPIC_API_KEY);
  if (ANTHROPIC_API_KEY && /[\s"']/.test(ANTHROPIC_API_KEY)) {
    problems.push(
      'ANTHROPIC_API_KEY must be the bare API key from the Claude Console (no quotes or spaces)'
    );
  }
  const RESUME_IMPORT_MONTHLY_LIMIT = parseLimit(
    'RESUME_IMPORT_MONTHLY_LIMIT',
    source.RESUME_IMPORT_MONTHLY_LIMIT,
    DEFAULT_RESUME_IMPORT_MONTHLY_LIMIT,
    problems,
    'résumé import'
  );
  const RESUME_IMPORT_DAILY_LIMIT = parseLimit(
    'RESUME_IMPORT_DAILY_LIMIT',
    source.RESUME_IMPORT_DAILY_LIMIT,
    DEFAULT_RESUME_IMPORT_DAILY_LIMIT,
    problems,
    'résumé import'
  );
  const RESUME_IMPORT_ATTEMPTS_PER_DAY = parseLimit(
    'RESUME_IMPORT_ATTEMPTS_PER_DAY',
    source.RESUME_IMPORT_ATTEMPTS_PER_DAY,
    DEFAULT_RESUME_IMPORT_ATTEMPTS_PER_DAY,
    problems,
    'résumé import'
  );
  const JOB_IMPORT_DAILY_LIMIT = parseLimit(
    'JOB_IMPORT_DAILY_LIMIT',
    source.JOB_IMPORT_DAILY_LIMIT,
    DEFAULT_JOB_IMPORT_DAILY_LIMIT,
    problems,
    'job description import'
  );
  const JOB_IMPORT_ATTEMPTS_PER_DAY = parseLimit(
    'JOB_IMPORT_ATTEMPTS_PER_DAY',
    source.JOB_IMPORT_ATTEMPTS_PER_DAY,
    DEFAULT_JOB_IMPORT_ATTEMPTS_PER_DAY,
    problems,
    'job description import'
  );

  const OTEL_SDK_DISABLED = parseOtelBoolean('OTEL_SDK_DISABLED', source.OTEL_SDK_DISABLED, problems);
  const OTEL_TRACES_EXPORTER = parseOtelExporter('OTEL_TRACES_EXPORTER', source.OTEL_TRACES_EXPORTER, problems);
  const OTEL_METRICS_EXPORTER = parseOtelExporter('OTEL_METRICS_EXPORTER', source.OTEL_METRICS_EXPORTER, problems);
  const OTEL_LOGS_EXPORTER = parseOtelExporter('OTEL_LOGS_EXPORTER', source.OTEL_LOGS_EXPORTER, problems);
  const MEMORY_LOG_INTERVAL_MS = parseMemoryLogInterval(source.MEMORY_LOG_INTERVAL_MS, problems);

  if (problems.length > 0) throw new EnvironmentError(problems);

  if (isProduction && JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
    // Not fatal: refusing to boot would take an existing deploy down
    warnings.push(
      `JWT_SECRET is shorter than ${MIN_PRODUCTION_SECRET_LENGTH} characters; use a long random value in production`
    );
  }

  const OTEL_EXPORTER_OTLP_ENDPOINT = optional(source.OTEL_EXPORTER_OTLP_ENDPOINT);
  const otelEnabled = OTEL_EXPORTER_OTLP_ENDPOINT !== undefined && !OTEL_SDK_DISABLED;

  return {
    NODE_ENV,
    isProduction,
    MONGO_URL,
    JWT_SECRET,
    ALLOWED_DOMAINS,
    GOOGLE_CLIENT_ID: optional(source.GOOGLE_CLIENT_ID) ?? DEFAULT_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    googleCalendarEnabled: GOOGLE_CLIENT_SECRET !== undefined,
    HOST: host ?? '::',
    hostExplicit: host !== undefined,
    PORT,
    AUTH_COOKIE_SAMESITE,
    authCookieSecure: isProduction || AUTH_COOKIE_SAMESITE === 'none',
    CLIENT_IP_HEADER,
    ANTHROPIC_API_KEY,
    RESUME_IMPORT_MONTHLY_LIMIT,
    RESUME_IMPORT_DAILY_LIMIT,
    RESUME_IMPORT_ATTEMPTS_PER_DAY,
    JOB_IMPORT_DAILY_LIMIT,
    JOB_IMPORT_ATTEMPTS_PER_DAY,
    apiDocsEnabled: !isProduction || source.API_DOCS === 'true',
    OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: optional(source.OTEL_SERVICE_NAME) ?? 'portfolio-server',
    OTEL_SDK_DISABLED,
    OTEL_TRACES_EXPORTER,
    OTEL_METRICS_EXPORTER,
    OTEL_LOGS_EXPORTER,
    otelEnabled,
    otelSignals: {
      traces: otelEnabled && OTEL_TRACES_EXPORTER === 'otlp',
      metrics: otelEnabled && OTEL_METRICS_EXPORTER === 'otlp',
      logs: otelEnabled && OTEL_LOGS_EXPORTER === 'otlp'
    },
    MEMORY_LOG_INTERVAL_MS,
    TLS_PASSPHRASE: optional(source.TLS_PASSPHRASE),
    warnings
  };
};

export const env: ServerEnv = parseEnv(Bun.env);
for (const warning of env.warnings) console.warn(`[WARN] ${warning}`);
