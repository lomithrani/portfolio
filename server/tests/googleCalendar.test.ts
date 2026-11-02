import { describe, it, expect } from 'bun:test';
import { GoogleCalendarReconnectRequiredError } from '../errors';
import { isRejectedInsert, refusedGrantReason } from '../services/googleCalendar';

// Shaped like the GaxiosError google-auth-library throws: the HTTP status, and
// the parsed body in response.data (appointments.test.ts runs into real ones)
const gaxiosError = (status: number, data: unknown) =>
  Object.assign(new Error('request failed'), { status, response: { status, data } });

const apiError = (code: number, status: string, reason?: string) => ({
  error: { code, status, message: status, ...(reason && { errors: [{ reason }] }) }
});

describe('refusedGrantReason', () => {
  it.each([
    [
      'a revoked or expired refresh token',
      gaxiosError(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
      'invalid_grant'
    ],
    [
      'a refresh token of another OAuth client',
      gaxiosError(401, { error: 'unauthorized_client', error_description: 'Unauthorized' }),
      'unauthorized_client'
    ],
    ['a revoked access token', gaxiosError(401, apiError(401, 'UNAUTHENTICATED', 'authError')), 'unauthenticated']
  ])('recognizes %s', (_, error, reason) => {
    expect(refusedGrantReason(error)).toBe(reason);
  });

  it.each([
    ['a wrong client secret', gaxiosError(401, { error: 'invalid_client', error_description: 'Unauthorized' })],
    ['an unsupported grant type', gaxiosError(400, { error: 'unsupported_grant_type' })],
    ['a rate limit', gaxiosError(403, apiError(403, 'PERMISSION_DENIED', 'rateLimitExceeded'))],
    ['a calendar without write access', gaxiosError(403, apiError(403, 'PERMISSION_DENIED', 'forbidden'))],
    ['an unknown event', gaxiosError(404, apiError(404, 'NOT_FOUND', 'notFound'))],
    ['a Google outage', gaxiosError(503, apiError(503, 'UNAVAILABLE'))],
    ['a network error', new TypeError('fetch failed')],
    ['a non-error', 'invalid_grant'],
    ['nothing', undefined]
  ])('ignores %s', (_, error) => {
    expect(refusedGrantReason(error)).toBeNull();
  });
});

describe('isRejectedInsert', () => {
  it('takes refused credentials for a refusal: Google created no event', () => {
    expect(isRejectedInsert(new GoogleCalendarReconnectRequiredError('Reconnect'))).toBe(true);
  });
});
