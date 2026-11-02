import { DEFAULT_GOOGLE_CLIENT_ID } from 'portfolio-common';

// Validates and parses the server's environment once, at startup. index.ts
// imports this module FIRST so a misconfigured deploy fails with one clear
// message listing every problem, before any plugin reads its configuration.

export type CookieSameSite = 'strict' | 'lax' | 'none';

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
  /** Serve OpenAPI docs (always outside production, opt-in with API_DOCS=true) */
  apiDocsEnabled: boolean;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVICE_NAME: string;
  /** Telemetry is fully off unless an OTLP endpoint is configured */
  otelEnabled: boolean;
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

  if (problems.length > 0) throw new EnvironmentError(problems);

  if (isProduction && JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
    // Not fatal: refusing to boot would take an existing deploy down
    warnings.push(
      `JWT_SECRET is shorter than ${MIN_PRODUCTION_SECRET_LENGTH} characters; use a long random value in production`
    );
  }

  const OTEL_EXPORTER_OTLP_ENDPOINT = optional(source.OTEL_EXPORTER_OTLP_ENDPOINT);

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
    apiDocsEnabled: !isProduction || source.API_DOCS === 'true',
    OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: optional(source.OTEL_SERVICE_NAME) ?? 'portfolio-server',
    otelEnabled: OTEL_EXPORTER_OTLP_ENDPOINT !== undefined,
    TLS_PASSPHRASE: optional(source.TLS_PASSPHRASE),
    warnings
  };
};

export const env: ServerEnv = parseEnv(Bun.env);
for (const warning of env.warnings) console.warn(`[WARN] ${warning}`);
