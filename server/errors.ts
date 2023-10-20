export class DomainDoesNotExistError extends Error {
  constructor(public message: string) {
    super(message)
  }
}