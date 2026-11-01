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
  UnsupportedMediaTypeError
}
