/**
 * Runs before every page and every /api/v1 request (Phase 21).
 *
 * - Pages: a fresh nonce per request and a strict Content-Security-Policy — only Next.js's own
 *   scripts (which carry the nonce) run; nothing loads from other sites except the Daily call frame.
 * - /api/v1 (rewritten to the API): tells the API who the visitor really is. The client IP comes
 *   from the header the hosting platform sets (`PROXY_CLIENT_IP_HEADER`, e.g. `x-real-ip`), never
 *   from what the browser sent, and travels with `API_PROXY_SECRET` so the API can trust it.
 */
import { NextResponse, type NextRequest } from 'next/server';

const CLIENT_IP = 'x-sabeq-client-ip';
const PROXY_SECRET = 'x-sabeq-proxy-secret';

function csp(nonce: string) {
  const dev = process.env.NODE_ENV === 'development';
  const local = (process.env.APP_ENV ?? 'local') === 'local';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // React style attributes (`style={{…}}`) are inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    // The session room embeds the Daily call (Phase 17).
    'frame-src https://*.daily.co',
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(local ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);

  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Whatever the browser claimed is dropped; only the platform's header counts.
    headers.delete(CLIENT_IP);
    headers.delete(PROXY_SECRET);
    const secret = process.env.API_PROXY_SECRET;
    const source = process.env.PROXY_CLIENT_IP_HEADER;
    const ip = source ? request.headers.get(source)?.split(',')[0]?.trim() : undefined;
    if (secret && ip) {
      headers.set(CLIENT_IP, ip);
      headers.set(PROXY_SECRET, secret);
    }
    return NextResponse.next({ request: { headers } });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = csp(nonce);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  if ((process.env.APP_ENV ?? 'local') !== 'local')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|icon.svg|logos/|.*\\.(?:png|jpg|svg|webp|woff2)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
