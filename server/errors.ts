export class DomainDoesNotExistError extends Error {
  constructor(public message: string) {
    super(message)
  }
}

export class MissingAuthCookieError extends Error {
  constructor(public message: string) {
    super(message)
  }
}

export class CouldntVerifyJwtError extends Error {
  constructor(public message: string) {
    super(message)
  }
}

export class SubMissingError extends Error {
  constructor(public message: string) {
    super(message)
  }
}

export class CannotSaveExperienceError extends Error {
  constructor(public message: string) {
    super(message)
  }
}