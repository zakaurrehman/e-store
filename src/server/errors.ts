/**
 * An expected, user-safe failure (validation, business rule, permission).
 * Its message may be shown to the user. Anything else is treated as an internal error.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: string, message: string, options: { status?: number; fieldErrors?: Record<string, string[]> } = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = options.status ?? 400;
    this.fieldErrors = options.fieldErrors;
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;

export class PermissionError extends DomainError {
  constructor(message = "You don't have permission to do that.") {
    super("FORBIDDEN", message, { status: 403 });
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", message, { status: 404 });
  }
}
