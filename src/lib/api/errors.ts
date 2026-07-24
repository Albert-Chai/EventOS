import { ERROR_CODES, type ErrorCode } from "./error-codes";

/**
 * The only error type services and repositories should throw deliberately.
 * `withApi` maps it to the §16 error envelope; anything else becomes a
 * generic INTERNAL_ERROR so internals are never leaked to the client.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  /** Attached to logs but never sent to the client. */
  readonly cause: unknown;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    const spec = ERROR_CODES[code];
    super(options.message ?? spec.message);
    this.name = "AppError";
    this.code = code;
    this.status = spec.status;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// --- Convenience constructors for the codes used most often -----------------

export const unauthenticated = (message?: string) => new AppError("UNAUTHENTICATED", { message });

export const forbidden = (message?: string) => new AppError("FORBIDDEN", { message });

export const notFound = (
  code: Extract<ErrorCode, `${string}NOT_FOUND`> = "NOT_FOUND",
  message?: string,
) => new AppError(code, { message });

export const validationError = (details: Record<string, unknown>, message?: string) =>
  new AppError("VALIDATION_ERROR", { details, message });
