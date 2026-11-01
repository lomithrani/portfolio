// Binds the HTTP server. The default host '::' is dual-stack (IPv4 + IPv6) and
// is what Railway needs for its private network, but it fails with
// EAFNOSUPPORT on machines without IPv6 (some containers, sandboxes, WSL).
// Without an explicit HOST we then fall back to IPv4 on all interfaces.

export const IPV4_FALLBACK_HOST = '0.0.0.0';

export interface ListenTarget<TLS> {
  listen(options: { hostname: string; port: number; tls?: TLS }): unknown;
}

export interface ListenOptions<TLS> {
  host: string;
  /** HOST was set explicitly: never silently bind somewhere else */
  hostExplicit: boolean;
  port: number;
  tls?: TLS;
  onFallback?: (error: unknown) => void;
}

const isAddressFamilyUnsupported = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EAFNOSUPPORT';

/** Starts listening and returns the host actually bound */
export const listenWithFallback = <TLS>(
  target: ListenTarget<TLS>,
  options: ListenOptions<TLS>
): string => {
  const { host, hostExplicit, port, tls } = options;
  try {
    target.listen({ hostname: host, port, tls });
    return host;
  } catch (error) {
    if (hostExplicit || host !== '::' || !isAddressFamilyUnsupported(error)) throw error;
    options.onFallback?.(error);
    target.listen({ hostname: IPV4_FALLBACK_HOST, port, tls });
    return IPV4_FALLBACK_HOST;
  }
};

/** http://host:port, with brackets around IPv6 hosts */
export const formatListenUrl = (host: string, port: number, tls: boolean) =>
  `${tls ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${port}`;
