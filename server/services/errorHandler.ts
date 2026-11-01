import { ValidationError } from 'elysia';
import mongoose from 'mongoose';
import { HttpError } from '../errors';
import { isDuplicateKeyError } from './mongoErrors';

export type ErrorBody = string | { type: 'validation'; on: string; property: string; message: string };

export interface ResolvedError {
  status: number;
  body: ErrorBody;
  /**
   * 'error' for server faults, 'warn' for client errors, 'silent' for route
   * misses (scanner noise; the http.server.requests metric still counts them)
   */
  level: 'error' | 'warn' | 'silent';
}

const INTERNAL_SERVER_ERROR: ResolvedError = {
  status: 500,
  body: 'Internal Server Error',
  level: 'error'
};

// Body of a request validation error, without the submitted value
// (`found`) or a sample of the schema (`expected`) that Elysia includes
const validationBody = (error: ValidationError): ErrorBody => {
  const valueError = error.valueError as { path?: string; message?: string } | undefined;
  return {
    type: 'validation',
    on: String(error.type),
    property: valueError?.path || 'root',
    message: valueError?.message ?? 'Invalid request'
  };
};

/**
 * Maps any error reaching Elysia's onError hook to a status and a body that
 * is safe to send to clients. Never yields a 2xx status.
 */
export const resolveError = (code: string | number, error: unknown): ResolvedError => {
  if (code === 'NOT_FOUND') return { status: 404, body: 'Not Found', level: 'silent' };

  if (error instanceof ValidationError || code === 'VALIDATION') {
    // A response that fails its own schema is a server bug, not bad input
    if (error instanceof ValidationError && error.type === 'response') return INTERNAL_SERVER_ERROR;
    return {
      status: 422,
      body:
        error instanceof ValidationError
          ? validationBody(error)
          : { type: 'validation', on: 'request', property: 'root', message: 'Invalid request' },
      level: 'warn'
    };
  }

  if (code === 'PARSE') return { status: 400, body: 'Bad Request', level: 'warn' };
  if (code === 'INVALID_COOKIE_SIGNATURE') return { status: 400, body: 'Bad Request', level: 'warn' };
  if (code === 'INVALID_FILE_TYPE') return { status: 422, body: 'Invalid file type', level: 'warn' };

  if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
    return { status: error.status, body: error.message, level: 'warn' };
  }

  if (error instanceof mongoose.Error.CastError) {
    return { status: 400, body: `Invalid value for ${error.path}`, level: 'warn' };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 422,
      body: {
        type: 'validation',
        on: 'body',
        property: Object.keys(error.errors)[0] ?? 'root',
        message: `Invalid value for ${Object.keys(error.errors).join(', ') || 'request'}`
      },
      level: 'warn'
    };
  }

  if (isDuplicateKeyError(error)) return { status: 409, body: 'Conflict', level: 'warn' };

  return INTERNAL_SERVER_ERROR;
};
