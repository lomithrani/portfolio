// `status` is picked up by Elysia to set the HTTP status of the error response
export class DomainDoesNotExistError extends Error {
  status = 404
  constructor(public message: string) {
    super(message)
  }
}

export class DomainAlreadyExistsError extends Error {
  status = 409
  constructor(public message: string) {
    super(message)
  }
}

export class MissingAuthCookieError extends Error {
  status = 401
  constructor(public message: string) {
    super(message)
  }
}

export class CouldntVerifyJwtError extends Error {
  status = 401
  constructor(public message: string) {
    super(message)
  }
}

export class SubMissingError extends Error {
  status = 401
  constructor(public message: string) {
    super(message)
  }
}

export class CannotSaveExperienceError extends Error {
  status = 500
  constructor(public message: string) {
    super(message)
  }
}

export class AuthExpiredError extends Error {
  status = 401
  constructor(public message: string) {
    super(message)
  }
}

export class UserAlreadyOwnsDomainError extends Error {
  status = 409
  constructor(public message: string) {
    super(message)
  }
}

export const errors = {
  DomainDoesNotExistError,
  DomainAlreadyExistsError,
  MissingAuthCookieError,
  CouldntVerifyJwtError,
  SubMissingError,
  CannotSaveExperienceError,
  AuthExpiredError,
  UserAlreadyOwnsDomainError
}