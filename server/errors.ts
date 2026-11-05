// Errors that map to an HTTP status. `status` is picked up by Elysia and by the
// app's onError handler (services/errorHandler.ts); for 4xx statuses (and
// ServiceUnavailableError) the message is sent to the client as a plain-text
// body, so keep it free of internal details. Any other error becomes a generic
// 500.
export class HttpError extends Error {
  status = 500
  constructor(public message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class BadRequestError extends HttpError {
  status = 400
}

export class InvalidDomainNameError extends HttpError {
  status = 400
}

export class InvalidGoogleTokenError extends HttpError {
  status = 401
}

export class MissingAuthCookieError extends HttpError {
  status = 401
}

export class CouldntVerifyJwtError extends HttpError {
  status = 401
}

export class SubMissingError extends HttpError {
  status = 401
}

export class AuthExpiredError extends HttpError {
  status = 401
}

export class ForbiddenError extends HttpError {
  status = 403
}

export class ResourceNotFoundError extends HttpError {
  status = 404
}

export class DomainDoesNotExistError extends HttpError {
  status = 404
}

export class ConflictError extends HttpError {
  status = 409
}

export class DomainAlreadyExistsError extends HttpError {
  status = 409
}

export class UserAlreadyOwnsDomainError extends HttpError {
  status = 409
}

/** A request body over the size its route accepts */
export class PayloadTooLargeError extends HttpError {
  status = 413
}

export class UnsupportedMediaTypeError extends HttpError {
  status = 415
}

/**
 * A request field fails a rule its TypeBox schema cannot express (e.g. an end
 * date before the start). Answered like a schema validation error: 422 with
 * `{ type: 'validation', on: 'body', property, message }`, where `property` is
 * the field's dotted path (e.g. `projects.1.end`)
 */
export class FieldValidationError extends HttpError {
  status = 422
  constructor(
    public property: string,
    message: string
  ) {
    super(message)
  }
}

/** Well-formed request whose content cannot be processed, e.g. a file that is not a PDF */
export class UnprocessableContentError extends HttpError {
  status = 422
}

/** A rate limit or quota was hit; `retryAfterSeconds` becomes the Retry-After header */
export class TooManyRequestsError extends HttpError {
  status = 429
  constructor(
    message: string,
    public retryAfterSeconds?: number
  ) {
    super(message)
  }
}

// Appointments (Google Calendar)

/** The owner has not connected Google Calendar, or the API has no OAuth client secret */
export class GoogleCalendarNotConnectedError extends HttpError {
  status = 409
}

export class AppointmentScheduleNotFoundError extends HttpError {
  status = 404
}

export class AppointmentEventNotFoundError extends HttpError {
  status = 404
}

export class SlotUnavailableError extends HttpError {
  status = 409
}

/** Google rejected the authorization code sent to /appointments/connect */
export class GoogleCalendarAuthorizationError extends HttpError {
  status = 400
}

/**
 * Google refused the stored grant (refresh token revoked, expired or issued to
 * another OAuth client): the connection was cleared and the owner must
 * connect again. 409, not 401: the admin's own session is fine
 */
export class GoogleCalendarReconnectRequiredError extends HttpError {
  status = 409
}

/**
 * A service the request depends on failed in a way that is not the caller's
 * fault (an upstream outage, the operator's spend limit). Unlike other 5xx,
 * its message is sent to the client, so keep it free of internal details
 */
export class ServiceUnavailableError extends HttpError {
  status = 503
}

// Résumé import (Claude)

/** Résumé import is off: no ANTHROPIC_API_KEY, or a limit set to 0 */
export class ResumeImportDisabledError extends HttpError {
  status = 404
}

export const errors = {
  BadRequestError,
  InvalidDomainNameError,
  InvalidGoogleTokenError,
  MissingAuthCookieError,
  CouldntVerifyJwtError,
  SubMissingError,
  AuthExpiredError,
  ForbiddenError,
  ResourceNotFoundError,
  DomainDoesNotExistError,
  ConflictError,
  DomainAlreadyExistsError,
  UserAlreadyOwnsDomainError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  FieldValidationError,
  UnprocessableContentError,
  TooManyRequestsError,
  GoogleCalendarNotConnectedError,
  AppointmentScheduleNotFoundError,
  AppointmentEventNotFoundError,
  SlotUnavailableError,
  GoogleCalendarAuthorizationError,
  GoogleCalendarReconnectRequiredError,
  ServiceUnavailableError,
  ResumeImportDisabledError
}
