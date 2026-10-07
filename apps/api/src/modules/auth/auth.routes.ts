/**
 * /api/v1/auth/*        — website (students, mentors)
 * /api/v1/admin/auth/*  — admin app
 *
 *   POST otp/request  { phone }                       → 202 { expiresInSeconds, resendAfterSeconds }
 *   POST otp/verify   { phone, code, role? }          → 200 { user, isNew } + session cookie
 *   GET  me                                           → 200 { user, session }
 *   POST logout                                       → 200, cookie cleared
 *   POST logout-all                                   → 200, every session of this user revoked
 */
import { normalizeEgyptianMobile } from '@sabeq/utils';
import { Router } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requestId } from '../../core/middleware/request-context.js';
import type { ClientApp } from '../../generated/prisma/enums.js';
import type { AuthService } from './auth.service.js';
import {
  authenticate,
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from './auth.middleware.js';
import type { SessionService } from './session.service.js';

const phone = z
  .string({ error: 'اكتب رقم الموبايل.' })
  .max(20, 'الرقم ده مش مظبوط.')
  .transform((v, ctx) => {
    const e164 = normalizeEgyptianMobile(v);
    if (!e164) {
      ctx.addIssue({
        code: 'custom',
        message: 'اكتب رقم موبايل مصري صحيح (010، 011، 012 أو 015).',
      });
      return z.NEVER;
    }
    return e164;
  });

const requestSchema = z.object({ phone });
const verifySchema = z.object({
  phone,
  code: z.string({ error: 'اكتب الكود.' }).regex(/^\d{6}$/, 'الكود 6 أرقام.'),
  role: z.enum(['student', 'mentor']).default('student'),
});

export function authRouter(deps: {
  app: ClientApp;
  auth: AuthService;
  sessions: SessionService;
  secureCookies: boolean;
}): Router {
  const { app, auth, sessions, secureCookies } = deps;
  const r = Router();
  r.use(authenticate(sessions, app, secureCookies));

  r.post('/otp/request', async (req, res) => {
    const { phone } = parseInput(requestSchema, req.body);
    const result = await auth.requestCode(app, phone, req.ip ?? 'unknown');
    sendData(res, result, undefined, 202);
  });

  r.post('/otp/verify', async (req, res) => {
    const input = parseInput(verifySchema, req.body);
    const result = await auth.verifyCode({
      app,
      ...input,
      meta: {
        ip: req.ip ?? 'unknown',
        userAgent: req.get('user-agent'),
        requestId: requestId(req),
      },
    });
    // Logging in again replaces the previous session on this browser.
    if (req.auth) await sessions.revoke(req.auth.sessionId);
    setSessionCookie(res, app, secureCookies, result.token, result.expiresAt);
    sendData(res, { user: result.user, isNew: result.isNew });
  });

  r.get('/me', requireAuth(), async (req, res) => {
    const ctx = req.auth;
    if (!ctx) throw Errors.unauthenticated();
    const user = await auth.me(ctx.userId);
    sendData(res, { user, session: { app: ctx.app } });
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

  return r;
}
