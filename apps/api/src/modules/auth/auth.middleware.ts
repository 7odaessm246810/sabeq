/**
 * Authentication (who is calling) and authorization (may they do this) for every router.
 *
 *   router.use(auth.authenticate('web'))          → sets req.auth when the cookie is valid
 *   router.get('/x', requireRole('student'), …)   → 401 without a session, 403 for other roles
 *   router.post('/y', requireAdmin('finance'), …) → admins with one of these admin roles
 *
 * Web and admin use different cookies, so a browser signed into both (same host in development)
 * never mixes the two sessions.
 */
import type { Request, RequestHandler, Response } from 'express';
import { Errors } from '../../core/errors.js';
import type { AdminRole, ClientApp, UserRole } from '../../generated/prisma/enums.js';
import type { AuthContext, SessionService } from './session.service.js';

declare global {
  // Express exposes its Request type for augmentation only through this global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `authenticate` when the request carries a valid session for this app. */
      auth?: AuthContext;
    }
  }
}

/** `__Host-` cookies are only accepted over https, host-only, path / — the browser enforces it. */
export function cookieName(app: ClientApp, secure: boolean): string {
  const base = app === 'admin' ? 'sb_admin' : 'sb_session';
  return secure ? `__Host-${base}` : base;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function setSessionCookie(
  res: Response,
  app: ClientApp,
  secure: boolean,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(cookieName(app, secure), token, {
    httpOnly: true,
    secure,
    // Lax: sent on top-level navigation to the site, never on cross-site POSTs (CSRF).
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, app: ClientApp, secure: boolean): void {
  res.clearCookie(cookieName(app, secure), { httpOnly: true, secure, sameSite: 'lax', path: '/' });
}

export function authenticate(
  sessions: SessionService,
  app: ClientApp,
  secure: boolean,
): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req, cookieName(app, secure));
    if (token) {
      const ctx = await sessions.resolve(token, app);
      if (ctx) req.auth = ctx;
    }
    next();
  };
}

export function requireAuth(): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw Errors.unauthenticated();
    next();
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw Errors.unauthenticated();
    if (!roles.includes(req.auth.role)) throw Errors.forbidden();
    next();
  };
}

/** Admin routes: an admin-app session, and — when given — one of these admin roles. */
export function requireAdmin(...adminRoles: AdminRole[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthenticated();
    if (auth.role !== 'admin' || auth.app !== 'admin' || !auth.adminRole) throw Errors.forbidden();
    if (
      adminRoles.length &&
      auth.adminRole !== 'super_admin' &&
      !adminRoles.includes(auth.adminRole)
    )
      throw Errors.forbidden();
    next();
  };
}
