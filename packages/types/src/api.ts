/**
 * Every API response uses one of these two shapes (docs/conventions.md → API).
 * Success: `{ data, meta? }` — Failure: `{ error }`.
 */
export interface ApiSuccess<T> {
  data: T;
  meta?: PageMeta;
}

export interface ApiFailure {
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** Safe, user-facing Arabic message. Never a stack trace or internal detail. */
  message: string;
  /** Per-field validation problems, keyed by field path. */
  fields?: Record<string, string>;
  /** Correlates with server logs (X-Request-Id). */
  requestId: string;
}

/** Cursor pagination — stable under inserts, scales to large tables. */
export interface PageMeta {
  nextCursor: string | null;
  limit: number;
}

export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SLOT_UNAVAILABLE',
  'PAYMENT_FAILED',
  'INTERNAL',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiFailure<T>(res: ApiResponse<T>): res is ApiFailure {
  return 'error' in res;
}
