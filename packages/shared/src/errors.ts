/**
 * Standard error system for AeroPDF (PRD §16).
 * Every failure surfaced to clients is an {@link AeroError} so the API can render the
 * canonical `{ success: false, error: { code, message, details } }` envelope.
 */

export type ErrorCode =
  | "INVALID_API_KEY"
  | "FILE_TOO_LARGE"
  | "INVALID_PDF"
  | "PDF_PASSWORD_REQUIRED"
  | "PDF_PASSWORD_INVALID"
  | "PDF_RENDER_FAILED"
  | "HTML_RENDER_TIMEOUT"
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_RENDER_FAILED"
  | "FONT_LOAD_FAILED"
  | "STORAGE_ERROR"
  | "JOB_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "RATE_LIMIT_EXCEEDED"
  | "UNSUPPORTED_OPERATION"
  | "VALIDATION_ERROR"
  | "INTERNAL";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  INVALID_API_KEY: 401,
  FILE_TOO_LARGE: 413,
  INVALID_PDF: 422,
  PDF_PASSWORD_REQUIRED: 422,
  PDF_PASSWORD_INVALID: 422,
  PDF_RENDER_FAILED: 500,
  HTML_RENDER_TIMEOUT: 504,
  TEMPLATE_NOT_FOUND: 404,
  TEMPLATE_RENDER_FAILED: 422,
  FONT_LOAD_FAILED: 500,
  STORAGE_ERROR: 500,
  JOB_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  RATE_LIMIT_EXCEEDED: 429,
  UNSUPPORTED_OPERATION: 400,
  VALIDATION_ERROR: 400,
  INTERNAL: 500,
};

export class AeroError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AeroError";
    this.code = code;
    this.statusCode = DEFAULT_STATUS[code] ?? 500;
    this.details = details;
  }

  toResponse(): { success: false; error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
    return {
      success: false,
      error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) },
    };
  }
}

/** Wrap an unknown thrown value into an AeroError. */
export function toAeroError(err: unknown): AeroError {
  if (err instanceof AeroError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AeroError("INTERNAL", message);
}
