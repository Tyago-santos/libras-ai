/**
 * Erros com códigos estáveis (§8: "Documentar os códigos de erro").
 * Códigos documentados em docs/architecture.md.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "SESSION_NOT_FOUND"
  | "SESSION_ENDED"
  | "TRANSLATION_NOT_FOUND"
  | "UTTERANCE_NOT_FOUND"
  | "QUEUE_FULL"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ERROR"
  | "ANIMATION_NOT_AVAILABLE"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  SESSION_NOT_FOUND: 404,
  SESSION_ENDED: 409,
  TRANSLATION_NOT_FOUND: 404,
  UTTERANCE_NOT_FOUND: 404,
  QUEUE_FULL: 429,
  RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_ERROR: 502,
  ANIMATION_NOT_AVAILABLE: 404,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const isAppError = (err: unknown): err is AppError =>
  err instanceof AppError;
