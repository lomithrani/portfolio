import { describe, it, expect } from 'bun:test';
import { Elysia, t } from 'elysia';
import mongoose from 'mongoose';
import { resolveError } from '../services/errorHandler';
import {
  BadRequestError,
  HttpError,
  ConflictError,
  DomainDoesNotExistError,
  ForbiddenError,
  GoogleCalendarReconnectRequiredError,
  InvalidGoogleTokenError,
  MissingAuthCookieError,
  ResourceNotFoundError,
  TooManyRequestsError,
  ServiceUnavailableError,
  PayloadTooLargeError
} from '../errors';
import { Domain } from '../models/database';

describe('resolveError', () => {
  it.each([
    [new BadRequestError('bad'), 400],
    [new InvalidGoogleTokenError('Invalid Google token'), 401],
    [new MissingAuthCookieError('Unauthorized'), 401],
    [new ForbiddenError('Forbidden'), 403],
    [new ResourceNotFoundError('Workflow not found'), 404],
    [new DomainDoesNotExistError('Domain not found'), 404],
    [new ConflictError('Conflict'), 409],
    [new GoogleCalendarReconnectRequiredError('Reconnect Google Calendar'), 409],
    [new PayloadTooLargeError('Payload Too Large'), 413],
  ])('keeps the status of %p', (error, status) => {
    const resolved = resolveError('UNKNOWN', error);
    expect(resolved.status).toBe(status);
    expect(resolved.body).toBe(error.message);
  });

  it('logs a grant Google refused at warn: an expected state, not a server fault', () => {
    expect(resolveError('UNKNOWN', new GoogleCalendarReconnectRequiredError('Reconnect Google Calendar'))).toEqual({
      status: 409,
      body: 'Reconnect Google Calendar',
      level: 'warn'
    });
  });

  it('maps a 429 to a Retry-After header in whole seconds', () => {
    expect(resolveError('UNKNOWN', new TooManyRequestsError('Slow down', 59.2))).toEqual({
      status: 429,
      body: 'Slow down',
      level: 'warn',
      headers: { 'retry-after': '60' }
    });
    // A quota without a known end
    expect(resolveError('UNKNOWN', new TooManyRequestsError('Quota reached'))).toEqual({
      status: 429,
      body: 'Quota reached',
      level: 'warn'
    });
  });

  it('sends the message of a ServiceUnavailableError with its 503 (the thrower logged the cause)', () => {
    expect(resolveError('ServiceUnavailableError', new ServiceUnavailableError('Try again later'))).toEqual({
      status: 503,
      body: 'Try again later',
      level: 'warn'
    });
  });

  it('keeps other 5xx HttpErrors generic', () => {
    class GatewayError extends HttpError {
      status = 502;
    }
    expect(resolveError('UNKNOWN', new GatewayError('upstream said: secret detail'))).toEqual({
      status: 500,
      body: 'Internal Server Error',
      level: 'error'
    });
  });

  it('maps unmatched routes to 404 without logging them', () => {
    expect(resolveError('NOT_FOUND', new Error('NOT_FOUND'))).toEqual({
      status: 404,
      body: 'Not Found',
      level: 'silent'
    });
  });

  it('maps body parse errors to 400', () => {
    expect(resolveError('PARSE', new Error('Bad Request')).status).toBe(400);
  });

  it('maps a Mongoose CastError (e.g. a malformed id) to 400', () => {
    const error = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    expect(resolveError('UNKNOWN', error)).toMatchObject({ status: 400 });
  });

  it('maps a Mongoose ValidationError to 422 without echoing values', async () => {
    const error = await new Domain({ name: '-bad name-' }).validate().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
    const resolved = resolveError('UNKNOWN', error);
    expect(resolved.status).toBe(422);
    expect(JSON.stringify(resolved.body)).not.toContain('-bad name-');
  });

  it('maps duplicate key errors to 409 without the index details', () => {
    const error = Object.assign(
      new Error('E11000 duplicate key error collection: db.skills index: displayName_1 dup key'),
      { code: 11000 }
    );
    expect(resolveError('UNKNOWN', error)).toEqual({ status: 409, body: 'Conflict', level: 'warn' });
  });

  it.each([
    ['a plain Error', new Error('Unauthorized: internal detail')],
    ['a 5xx HttpError', new HttpError('user 65ab... could not be saved')],
    ['a thrown string', 'boom'],
    ['undefined', undefined],
  ])('maps %s to a generic 500', (_label, error) => {
    expect(resolveError('UNKNOWN', error)).toEqual({
      status: 500,
      body: 'Internal Server Error',
      level: 'error'
    });
  });
});

describe('error responses through Elysia', () => {
  // A minimal app with the same onError wiring as createApp
  const app = new Elysia()
    .onError(({ code, error, set }) => {
      const { status, body } = resolveError(code, error);
      set.status = status;
      return body;
    })
    .get('/plain', () => {
      throw new Error('secret internal detail');
    })
    .get('/forbidden', () => {
      throw new ForbiddenError('Forbidden');
    })
    .post('/validated', ({ body }) => body, {
      body: t.Object({ name: t.String({ minLength: 1 }) })
    });

  const request = (path: string, init?: RequestInit) =>
    app.handle(new Request(`http://localhost${path}`, init));

  it('never answers 200 for a thrown error', async () => {
    const result = await request('/plain');
    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Internal Server Error');
  });

  it('answers 403 for authorization failures', async () => {
    expect((await request('/forbidden')).status).toBe(403);
  });

  it('answers 422 for validation errors without the submitted value', async () => {
    const result = await request('/validated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', password: 'hunter2' })
    });
    expect(result.status).toBe(422);
    const text = await result.text();
    expect(text).not.toContain('hunter2');
    expect(JSON.parse(text)).toMatchObject({ type: 'validation', on: 'body', property: '/name' });
  });

  it('answers 400 for a malformed JSON body', async () => {
    const result = await request('/validated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":'
    });
    expect(result.status).toBe(400);
  });
});
