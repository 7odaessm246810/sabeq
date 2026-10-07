import type { ApiSuccess, PageMeta } from '@sabeq/types';
import type { Response } from 'express';
import { type z } from 'zod';
import { Errors } from './errors.js';

/** Sends the success envelope `{ data, meta? }`. */
export function sendData<T>(res: Response, data: T, meta?: PageMeta, status = 200): void {
  const body: ApiSuccess<T> = meta ? { data, meta } : { data };
  res.status(status).json(body);
}

/** Turns zod issues into `{ "field.path": "message" }` for the error envelope. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Validates untrusted input (body, query, params, webhook payload) at the boundary
 * (docs/conventions.md → TypeScript). Throws VALIDATION_FAILED with per-field messages.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.validation(zodFields(result.error));
  return result.data;
}
