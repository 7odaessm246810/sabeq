import type { ApiFailure } from '@sabeq/types';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, Errors } from '../errors.js';
import { zodFields } from '../http.js';
import { requestId } from './request-context.js';

/** Errors raised by express.json() — malformed or oversized bodies. */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return Errors.validation(zodFields(err));
  const bp = err as BodyParserError;
  if (bp?.type === 'entity.parse.failed') {
    return Errors.validation(undefined, 'البيانات المبعوتة مش مظبوطة. حدّث الصفحة وجرّب تاني.');
  }
  if (bp?.type === 'entity.too.large') {
    return Errors.validation(undefined, 'البيانات المبعوتة أكبر من المسموح.');
  }
  return Errors.internal(err);
}

/** Unknown routes get the same envelope as every other error. */
export const notFound: RequestHandler = () => {
  throw Errors.notFound();
};

/**
 * The single place errors become responses. Express 5 forwards rejected promises here, so route
 * handlers can simply `throw`. Unexpected errors are logged in full but answered with a generic
 * message — stack traces, SQL and provider errors never reach clients (Phase 21: error sanitization).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const appErr = toAppError(err);
  if (appErr.status >= 500) {
    req.log.error({ err: appErr.cause ?? err }, 'unhandled error');
  }
  const body: ApiFailure = {
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.fields ? { fields: appErr.fields } : {}),
      requestId: requestId(req),
    },
  };
  // 413 keeps the HTTP semantics for proxies; the code stays VALIDATION_FAILED for clients.
  const status = (err as BodyParserError)?.type === 'entity.too.large' ? 413 : appErr.status;
  if (appErr.code === 'RATE_LIMITED' && !res.getHeader('Retry-After'))
    res.setHeader('Retry-After', String(appErr.retryAfterSeconds ?? 60));
  res.status(status).json(body);
};
