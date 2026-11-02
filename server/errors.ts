// Errors that map to an HTTP status. `status` is picked up by Elysia and by the
// app's onError handler (services/errorHandler.ts); for 4xx statuses the
// message is sent to the client as a plain-text body, so keep it free of
// internal details. Anything that is not an HttpError becomes a generic 500.
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

export class UnsupportedMediaTypeError extends HttpError {
  status = 415
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
  UnsupportedMediaTypeError,
  TooManyRequestsError,
  GoogleCalendarNotConnectedError,
  AppointmentScheduleNotFoundError,
  AppointmentEventNotFoundError,
  SlotUnavailableError,
  GoogleCalendarAuthorizationError
}
