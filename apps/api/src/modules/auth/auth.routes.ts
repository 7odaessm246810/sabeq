/**
 * /api/v1/auth/*  — website (students, mentors)
 *
 *   GET  providers                                       → { google, emailLinks }
 *   POST register   { fullName, email, password, role }  → 201 { user, isNew, devLink? } + cookie
 *   POST login      { email, password }                  → 200 { user } + cookie
 *   GET  google     ?role=student|mentor                 → 302 to Google
 *   GET  google/callback                                 → 302 to /login?google=ok|new|<problem>
 *   POST password/forgot  { email }                      → 202 (same answer for unknown emails)
 *   POST password/reset   { token, password }            → 200 { role } — every device signed out
 *   POST password/change  { current?, password }         → 200 — other devices signed out
 *
 * /api/v1/admin/auth/*  — admin app
 *
 *   POST login  { email, password }   → 200 { step: 'totp' | 'setup', challenge, secret?, uri? }
 *   POST totp   { challenge, code }   → 200 { user } + cookie
 *
 * Both: GET me → { user, session }; POST logout; POST logout-all.
 */
import { Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError, Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requestId } from '../../core/middleware/request-context.js';
import type { ClientApp } from '../../generated/prisma/enums.js';
import { MESSAGES, type AuthService } from './auth.service.js';
import {
  authenticate,
  clearSessionCookie,
  readCookie,
  requireAuth,
  setSessionCookie,
} from './auth.middleware.js';
import { GOOGLE_STATE_SECONDS } from './google.js';
import { PASSWORD_RULES } from './password.js';
import type { SessionService } from './session.service.js';

const email = z
  .string({ error: 'اكتب الإيميل.' })
  .trim()
  .toLowerCase()
  .max(254, 'الإيميل طويل.')
  .pipe(z.email({ error: 'الإيميل ده مش مكتوب صح.' }));
const newPassword = z
  .string({ error: 'اكتب الباسورد.' })
  .min(PASSWORD_RULES.min, `الباسورد لازم ${PASSWORD_RULES.min} حروف أو أرقام على الأقل.`)
  .max(PASSWORD_RULES.max, 'الباسورد طويل أوي.');
// Signing in never tells which rule an old password breaks — only "wrong".
const anyPassword = z
  .string({ error: 'اكتب الباسورد.' })
  .min(1, 'اكتب الباسورد.')
  .max(PASSWORD_RULES.max);
const role = z.enum(['student', 'mentor']).default('student');

const registerSchema = z.object({
  // Same rules as the profile (account.routes).
  fullName: z
    .string({ error: 'اكتب اسمك.' })
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(2, 'الاسم قصير.')
        .max(60, 'الاسم طويل. اكتب 60 حرف بالكتير.')
        .regex(/^[\p{L}\p{M}' .-]+$/u, 'الاسم يكون حروف بس.'),
    ),
  email,
  password: newPassword,
  role,
});
const loginSchema = z.object({ email, password: anyPassword });
const forgotSchema = z.object({ email });
const resetSchema = z.object({ token: z.string().min(10).max(1000), password: newPassword });
const changeSchema = z.object({
  current: z.string().max(PASSWORD_RULES.max).optional(),
  password: newPassword,
});
const googleQuery = z.object({ role });
const totpSchema = z.object({
  challenge: z.string().min(20).max(100),
  code: z
    .string({ error: 'اكتب الكود.' })
    .trim()
    .regex(/^\d{6}$/, 'الكود 6 أرقام.'),
});

const meta = (req: Request) => ({
  ip: req.ip ?? 'unknown',
  userAgent: req.get('user-agent'),
  requestId: requestId(req),
});

interface Deps {
  auth: AuthService;
  sessions: SessionService;
  secureCookies: boolean;
  logger: Logger;
  emailLinks: boolean;
}

/** me / logout / logout-all — the same for both apps. */
function sessionRoutes(r: Router, app: ClientApp, { auth, sessions, secureCookies }: Deps) {
  r.get('/me', requireAuth(), async (req, res) => {
    const ctx = req.auth;
    if (!ctx) throw Errors.unauthenticated();
    sendData(res, { user: await auth.me(ctx.userId), session: { app: ctx.app } });
  });

  r.post('/logout', async (req, res) => {
    if (req.auth) await sessions.revoke(req.auth.sessionId);
    clearSessionCookie(res, app, secureCookies);
    sendData(res, { signedOut: true });
  });

  r.post('/logout-all', requireAuth(), async (req, res) => {
    const ctx = req.auth;
    if (!ctx) throw Errors.unauthenticated();
    await sessions.revokeAll(ctx.userId);
    clearSessionCookie(res, app, secureCookies);
    sendData(res, { signedOut: true });
  });
}

/** Logging in again replaces the previous session on this browser. */
async function signIn(
  req: Request,
  res: Response,
  app: ClientApp,
  deps: Deps,
  result: { token: string; expiresAt: Date },
) {
  if (req.auth) await deps.sessions.revoke(req.auth.sessionId);
  setSessionCookie(res, app, deps.secureCookies, result.token, result.expiresAt);
}

const googleCookie = (secure: boolean) => (secure ? '__Host-sb_google' : 'sb_google');

export function webAuthRouter(deps: Deps): Router {
  const { auth, secureCookies, logger, emailLinks } = deps;
  const r = Router();
  r.use(authenticate(deps.sessions, 'web', secureCookies));

  r.get('/providers', (_req, res) => {
    // `emailLinks`: whether confirmation / forgot-password emails really go out.
    sendData(res, { google: auth.googleEnabled(), emailLinks });
  });

  r.post('/register', async (req, res) => {
    const input = parseInput(registerSchema, req.body);
    const result = await auth.register({ ...input, meta: meta(req) });
    await signIn(req, res, 'web', deps, result);
    sendData(
      res,
      { user: result.user, isNew: true, ...(result.devLink ? { devLink: result.devLink } : {}) },
      undefined,
      201,
    );
  });

  r.post('/login', async (req, res) => {
    const input = parseInput(loginSchema, req.body);
    const result = await auth.login({ ...input, meta: meta(req) });
    await signIn(req, res, 'web', deps, result);
    sendData(res, { user: result.user });
  });

  r.get('/google', (req, res) => {
    if (!auth.googleEnabled()) {
      res.redirect(303, '/login?google=off');
      return;
    }
    const { role: picked } = parseInput(googleQuery, req.query);
    const { url, cookie } = auth.googleStart(picked);
    res.cookie(googleCookie(secureCookies), cookie, {
      httpOnly: true,
      secure: secureCookies,
      // Lax: the cookie comes back on Google's top-level redirect to the callback.
      sameSite: 'lax',
      path: '/',
      maxAge: GOOGLE_STATE_SECONDS * 1000,
    });
    res.redirect(303, url);
  });

  r.get('/google/callback', async (req, res) => {
    const cookie = readCookie(req, googleCookie(secureCookies));
    res.clearCookie(googleCookie(secureCookies), {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      path: '/',
    });
    const q = req.query as Record<string, unknown>;
    if (typeof q.error === 'string' || typeof q.code !== 'string' || typeof q.state !== 'string') {
      res.redirect(303, '/login?google=cancelled');
      return;
    }
    try {
      const result = await auth.googleCallback({
        code: q.code,
        state: q.state,
        cookie,
        meta: meta(req),
      });
      await signIn(req, res, 'web', deps, result);
      res.redirect(303, `/login?google=${result.isNew ? 'new' : 'ok'}`);
    } catch (err) {
      const reason =
        err instanceof AppError && err.message === MESSAGES.adminOnly
          ? 'admin'
          : err instanceof AppError && err.message === MESSAGES.suspended
            ? 'suspended'
            : 'failed';
      logger.warn({ err, requestId: requestId(req) }, 'google sign-in failed');
      res.redirect(303, `/login?google=${reason}`);
    }
  });

  r.post('/password/forgot', async (req, res) => {
    const { email: address } = parseInput(forgotSchema, req.body);
    sendData(
      res,
      { sent: true, ...(await auth.forgotPassword(address, req.ip ?? 'unknown')) },
      undefined,
      202,
    );
  });

  r.post('/password/reset', async (req, res) => {
    const { token, password } = parseInput(resetSchema, req.body);
    const done = await auth.resetPassword(token, password);
    // This browser's session (if any) ended with all the others.
    clearSessionCookie(res, 'web', secureCookies);
    sendData(res, done);
  });

  r.post('/password/change', requireAuth(), async (req, res) => {
    const ctx = req.auth;
    if (!ctx) throw Errors.unauthenticated();
    const { current, password } = parseInput(changeSchema, req.body);
    await auth.changePassword({ userId: ctx.userId, sessionId: ctx.sessionId, current, password });
    sendData(res, { changed: true });
  });

  sessionRoutes(r, 'web', deps);
  return r;
}

export function adminAuthRouter(deps: Deps): Router {
  const { auth, secureCookies } = deps;
  const r = Router();
  r.use(authenticate(deps.sessions, 'admin', secureCookies));

  r.post('/login', async (req, res) => {
    const input = parseInput(loginSchema, req.body);
    sendData(res, await auth.adminLogin({ ...input, meta: meta(req) }));
  });

  r.post('/totp', async (req, res) => {
    const input = parseInput(totpSchema, req.body);
    const result = await auth.adminVerify({ ...input, meta: meta(req) });
    await signIn(req, res, 'admin', deps, result);
    sendData(res, { user: result.user });
  });

  sessionRoutes(r, 'admin', deps);
  return r;
}
