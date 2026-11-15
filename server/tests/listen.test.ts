import { describe, it, expect, mock } from 'bun:test';
import { formatListenUrl, listenWithFallback } from '../services/listen';
import { redactConnectionString } from '../services/redact';

const eafnosupport = () =>
  Object.assign(new Error('listen EAFNOSUPPORT: address family not supported'), {
    code: 'EAFNOSUPPORT'
  });

// Behaves like Bun.serve on a host without IPv6
const ipv4OnlyServer = () =>
  mock((options: { hostname: string; port: number }) => {
    if (options.hostname === '::') throw eafnosupport();
  });

describe('listenWithFallback', () => {
  it('binds the dual-stack default when available', () => {
    const listen = mock(() => {});
    expect(listenWithFallback({ listen }, { host: '::', hostExplicit: false, port: 3000 })).toBe('::');
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it('falls back to 0.0.0.0 when IPv6 is unavailable and HOST is unset', () => {
    const listen = ipv4OnlyServer();
    const onFallback = mock(() => {});

    const host = listenWithFallback({ listen }, { host: '::', hostExplicit: false, port: 3000, onFallback });

    expect(host).toBe('0.0.0.0');
    expect(listen.mock.calls.map(([options]) => options.hostname)).toEqual(['::', '0.0.0.0']);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('does not fall back when HOST was set explicitly', () => {
    const listen = ipv4OnlyServer();
    expect(() => listenWithFallback({ listen }, { host: '::', hostExplicit: true, port: 3000 })).toThrow(
      'EAFNOSUPPORT'
    );
  });

  it('rethrows other errors (e.g. port in use)', () => {
    const listen = mock(() => {
      throw Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' });
    });
    expect(() => listenWithFallback({ listen }, { host: '::', hostExplicit: false, port: 3000 })).toThrow(
      'EADDRINUSE'
    );
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it('formats URLs with bracketed IPv6 hosts', () => {
    expect(formatListenUrl('::', 3000, false)).toBe('http://[::]:3000');
    expect(formatListenUrl('0.0.0.0', 3000, true)).toBe('https://0.0.0.0:3000');
  });
});

describe('redactConnectionString', () => {
  it.each([
    ['mongodb+srv://user:s3cr3t@cluster0.example.net/db?retryWrites=true', 'mongodb+srv://***@cluster0.example.net/db?retryWrites=true'],
    ['mongodb://user:p%40ss@h1:27017,h2:27017/db', 'mongodb://***@h1:27017,h2:27017/db'],
    ['mongodb://127.0.0.1:27017/wf-server', 'mongodb://127.0.0.1:27017/wf-server'],
  ])('redacts %s', (url, expected) => {
    expect(redactConnectionString(url)).toBe(expected);
  });
});
