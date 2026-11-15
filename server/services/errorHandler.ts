import { ValidationError } from 'elysia';
import mongoose from 'mongoose';
import {
  FieldValidationError,
  HttpError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  TooManyRequestsError,
  inBothLanguages
} from '../errors';
import { m } from './errorHandler.messages';
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
  /** Extra response headers, e.g. Retry-After on a 429 */
  headers?: Record<string, string>;
  /**
   * The body in English, for the log line, when the body is a text in another
   * language (the request's): logs are in English whoever asks
   */
  logMessage?: string;
}

/** A text body in the request's language, with its English for the log when that is another one */
const textBody = ({ text, english }: { text: string; english: string }) => ({
  body: text,
  ...(english === text ? {} : { logMessage: english })
});

/** The message of an error as a body: in the request's language, its English kept for the log */
const messageBody = (error: HttpError) => textBody({ text: error.message, english: error.english });

const INTERNAL_SERVER_ERROR: ResolvedError = {
  status: 500,
  body: 'Internal Server Error',
  level: 'error'
};

/**
 * TypeBox's JSON pointer ('/projects/1/name') as the dotted path Mongoose and
 * FieldValidationError use ('projects.1.name'): `property` has one format
 */
const dottedPath = (pointer: string) =>
  pointer
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.');

// Body of a request validation error, without the submitted value
// (`found`) or a sample of the schema (`expected`) that Elysia includes
const validationBody = (error: ValidationError): ErrorBody => {
  const valueError = error.valueError as { path?: string; message?: string } | undefined;
  return {
    type: 'validation',
    on: String(error.type),
    property: dottedPath(valueError?.path ?? '') || 'root',
    message: valueError?.message ?? m.invalidRequest
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
          : { type: 'validation', on: 'request', property: 'root', message: m.invalidRequest },
      level: 'warn'
    };
  }

  if (code === 'PARSE') {
    // app.ts's bounded body reader stops at its cap inside Elysia's parse
    // step, which wraps whatever it throws in a ParseError
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof PayloadTooLargeError) return { status: cause.status, ...messageBody(cause), level: 'warn' };
    return { status: 400, body: 'Bad Request', level: 'warn' };
  }
  if (code === 'INVALID_COOKIE_SIGNATURE') return { status: 400, body: 'Bad Request', level: 'warn' };
  if (code === 'INVALID_FILE_TYPE') {
    return { status: 422, ...textBody(inBothLanguages(() => m.invalidFileType)), level: 'warn' };
  }

  if (error instanceof FieldValidationError) {
    return {
      status: 422,
      body: { type: 'validation', on: 'body', property: error.property, message: error.message },
      level: 'warn'
    };
  }

  if (error instanceof TooManyRequestsError && error.retryAfterSeconds !== undefined) {
    return {
      status: error.status,
      ...messageBody(error),
      level: 'warn',
      headers: { 'retry-after': String(Math.max(1, Math.ceil(error.retryAfterSeconds))) }
    };
  }

  if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
    return { status: error.status, ...messageBody(error), level: 'warn' };
  }

  // An upstream failure the code that threw it already logged with its cause
  // (e.g. the Claude API during a résumé import): only its message goes out
  if (error instanceof ServiceUnavailableError) {
    return { status: error.status, ...messageBody(error), level: 'warn' };
  }

  if (error instanceof mongoose.Error.CastError) {
    return { status: 400, ...textBody(inBothLanguages(() => m.invalidValueFor(error.path))), level: 'warn' };
  }

  // save() of a document deleted meanwhile, e.g. an experience edited in one
  // tab while another deletes it: what the client asked for no longer exists
  if (error instanceof mongoose.Error.DocumentNotFoundError) {
    return { status: 404, body: 'Not Found', level: 'warn' };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 422,
      body: {
        type: 'validation',
        on: 'body',
        property: Object.keys(error.errors)[0] ?? 'root',
        message: Object.keys(error.errors).length
          ? m.invalidValueFor(Object.keys(error.errors).join(', '))
          : m.invalidValueForRequest
      },
      level: 'warn'
    };
  }

  if (isDuplicateKeyError(error)) return { status: 409, body: 'Conflict', level: 'warn' };

  return INTERNAL_SERVER_ERROR;
};
