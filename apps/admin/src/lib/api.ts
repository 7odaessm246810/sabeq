/**
 * Browser → API calls (same client as apps/web). Same origin (`/api/v1`, proxied by Next.js —
 * ADR-0004), so the admin session cookie travels automatically and CORS never applies. Every failure
 * becomes an `ApiError` with the API's Arabic message and per-field errors.
 */
import type { ApiErrorCode, ApiFailure, ApiSuccess } from '@sabeq/types';

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly code: ApiErrorCode | 'NETWORK',
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = 'مفيش اتصال بالإنترنت أو السيرفر مش بيرد. جرّب تاني بعد شوية.';

export async function api<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    /** Sent as the raw request body with its own type (document uploads). */
    file?: Blob;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | null = null;
  if (init.file) {
    headers['Content-Type'] = init.file.type || 'application/octet-stream';
    body = init.file;
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers,
      body,
      signal: init.signal ?? null,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('NETWORK', NETWORK_MESSAGE, 0);
  }

  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (res.ok && json && 'data' in json) return json.data;

  const failure = json && 'error' in json ? json.error : null;
  const retry = Number(res.headers.get('Retry-After'));
  throw new ApiError(
    failure?.code ?? 'INTERNAL',
    failure?.message ?? NETWORK_MESSAGE,
    res.status,
    failure?.fields ?? {},
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}
