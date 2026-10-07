/**
 * /api/v1/me/* — the signed-in website user's own account.
 *
 *   GET    profile         → { profile }
 *   PATCH  profile         { fullName?, track?, schoolYear?, governorate?, interests? } → { profile }
 *   GET    devices         → { devices }   (live website sessions, current one flagged)
 *   DELETE devices/:id     → sign that device out
 */
import { GOVERNORATES, SCHOOL_YEARS, STUDENT_TRACKS } from '@sabeq/types';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requireAuth } from '../auth/index.js';
import type { AccountService } from './account.service.js';

const fullName = z
  .string({ error: 'اكتب اسمك.' })
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(2, 'الاسم قصير.')
      .max(60, 'الاسم طويل. اكتب 60 حرف بالكتير.')
      .regex(/^[\p{L}\p{M}' .-]+$/u, 'الاسم يكون حروف بس.'),
  );

const profileSchema = z
  .object({
    fullName: fullName.optional(),
    track: z.enum(STUDENT_TRACKS, { error: 'اختار الشعبة.' }).nullable().optional(),
    schoolYear: z
      .number({ error: 'اختار الصف.' })
      .int()
      .refine((n) => (SCHOOL_YEARS as readonly number[]).includes(n), 'اختار الصف.')
      .nullable()
      .optional(),
    governorate: z.enum(GOVERNORATES, { error: 'اختار المحافظة.' }).nullable().optional(),
    interests: z.array(z.string().max(40)).max(20).optional(),
  })
  .strict();

const idParam = z.object({ id: z.uuid() });

export function accountRouter(deps: {
  account: AccountService;
  authenticate: RequestHandler;
}): Router {
  const { account, authenticate } = deps;
  const r = Router();
  r.use(authenticate, requireAuth());

  const ctx = (req: Express.Request) => {
    if (!req.auth) throw Errors.unauthenticated();
    return req.auth;
  };

  r.get('/profile', async (req, res) => {
    sendData(res, { profile: await account.getProfile(ctx(req).userId) });
  });

  r.patch('/profile', async (req, res) => {
    const { userId, role } = ctx(req);
    const input = parseInput(profileSchema, req.body);
    sendData(res, { profile: await account.updateProfile(userId, role, input) });
  });

  r.get('/devices', async (req, res) => {
    const { userId, sessionId } = ctx(req);
    sendData(res, { devices: await account.listDevices(userId, sessionId) });
  });

  r.delete('/devices/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await account.revokeDevice(ctx(req).userId, id);
    sendData(res, { signedOut: true });
  });

  return r;
}
