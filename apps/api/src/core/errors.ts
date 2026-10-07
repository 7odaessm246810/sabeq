/**
 * Every failure the API reports is an `AppError`. The error handler turns it into the shared envelope
 * `{ error: { code, message, fields?, requestId } }` (packages/types/src/api.ts).
 * Messages are user-facing Egyptian Arabic and say what happened + whether money was affected + what to
 * do (design README §8). They never contain technical details.
 */
import type { ApiErrorCode } from '@sabeq/types';

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  PAYMENT_FAILED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SLOT_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'في بيانات مش مظبوطة. راجع الخانات المعلّمة وجرّب تاني.',
  UNAUTHENTICATED: 'لازم تسجل دخولك الأول.',
  PAYMENT_FAILED: 'الدفع ما تمش، وما اتخصمش أي مبلغ. جرّب وسيلة دفع تانية.',
  FORBIDDEN: 'مش مسموحلك تعمل ده.',
  NOT_FOUND: 'اللي بتدور عليه مش موجود.',
  CONFLICT: 'في تعارض مع بيانات موجودة. حدّث الصفحة وجرّب تاني.',
  SLOT_UNAVAILABLE: 'الموعد ده اتحجز لحد تاني. اختار موعد قريب منه.',
  RATE_LIMITED: 'طلبات كتير في وقت قصير. استنى دقيقة وجرّب تاني.',
  INTERNAL: 'حصلت مشكلة عندنا، وما اتخصمش أي مبلغ. جرّب تاني بعد شوية.',
};

export class AppError extends Error {
  override name = 'AppError';
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string = DEFAULT_MESSAGES[code],
    readonly fields?: Record<string, string>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.status = ERROR_STATUS[code];
  }
}

/** Shorthands so services read like the domain: `throw Errors.notFound()`. */
export const Errors = {
  validation: (fields?: Record<string, string>, message?: string) =>
    new AppError('VALIDATION_FAILED', message, fields),
  unauthenticated: () => new AppError('UNAUTHENTICATED'),
  forbidden: () => new AppError('FORBIDDEN'),
  notFound: (message?: string) => new AppError('NOT_FOUND', message),
  conflict: (message?: string) => new AppError('CONFLICT', message),
  slotUnavailable: () => new AppError('SLOT_UNAVAILABLE'),
  paymentFailed: (message?: string) => new AppError('PAYMENT_FAILED', message),
  rateLimited: () => new AppError('RATE_LIMITED'),
  internal: (cause?: unknown) => new AppError('INTERNAL', undefined, undefined, { cause }),
};
