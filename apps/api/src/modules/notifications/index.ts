/**
 *   GET    /api/v1/me/notifications          ?before&limit  → { items, unread, nextBefore }
 *   GET    /api/v1/me/notifications/unread                  → { unread }
 *   POST   /api/v1/me/notifications/read     { ids? }       → { marked }   (no ids: all)
 *   GET    /api/v1/me/email                                 → { email, verified }
 *   PUT    /api/v1/me/email                  { email }      → { email, verified } + confirmation link
 *   POST   /api/v1/me/email/resend                          → { email, verified }
 *   DELETE /api/v1/me/email                                 → { email: null, verified: false }
 *   POST   /api/v1/email/verify              { token }      → { email, verified }   (signed out ok)
 */
import { Router, type RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { requireAuth } from '../auth/index.js';
import { createConsoleSender, createResendSender, type EmailSender } from './email.js';
import { createNotificationsService } from './notifications.service.js';

const listQuery = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const readBody = z.object({ ids: z.array(z.uuid()).min(1).max(100).optional() }).strict();
const emailBody = z
  .object({
    email: z
      .string({ error: 'اكتب الإيميل.' })
      .trim()
      .max(254, 'الإيميل طويل.')
      .pipe(z.email({ error: 'الإيميل ده مش مكتوب صح.' })),
  })
  .strict();
const verifyBody = z.object({ token: z.string().min(10).max(1000) }).strict();

export function createNotificationsModule(deps: {
  db: Db;
  redis: Redis;
  auth: ReturnType<typeof createAuthModule>;
  config: Pick<Config, 'email' | 'publicWebUrl' | 'auth'>;
  logger: Logger;
  /** Tests inject a sender to read what was "sent". */
  email?: EmailSender;
}) {
  const email =
    deps.email ??
    (deps.config.email.provider === 'resend'
      ? createResendSender(deps.config.email)
      : createConsoleSender(deps.logger));
  const notifications = createNotificationsService({
    db: deps.db,
    redis: deps.redis,
    email,
    publicWebUrl: deps.config.publicWebUrl,
    secret: deps.config.auth.otpSecret,
    logger: deps.logger,
  });
  const authenticate: RequestHandler = deps.auth.authenticate('web');

  return {
    notifications,
    mount(v1: Router) {
      const me = Router();
      me.use(authenticate, requireAuth());
      const userId = (req: Express.Request) => {
        if (!req.auth) throw Errors.unauthenticated();
        return req.auth.userId;
      };

      me.get('/notifications', async (req, res) => {
        const q = parseInput(listQuery, req.query);
        sendData(res, await notifications.list(userId(req), q));
      });
      me.get('/notifications/unread', async (req, res) => {
        sendData(res, { unread: await notifications.unreadCount(userId(req)) });
      });
      me.post('/notifications/read', async (req, res) => {
        const { ids } = parseInput(readBody, req.body ?? {});
        sendData(res, { marked: await notifications.markRead(userId(req), ids) });
      });

      me.get('/email', async (req, res) => {
        sendData(res, await notifications.getEmail(userId(req)));
      });
      me.put('/email', async (req, res) => {
        const { email: address } = parseInput(emailBody, req.body);
        sendData(res, await notifications.setEmail(userId(req), address));
      });
      me.post('/email/resend', async (req, res) => {
        sendData(res, await notifications.resendVerification(userId(req)));
      });
      me.delete('/email', async (req, res) => {
        sendData(res, await notifications.removeEmail(userId(req)));
      });
      v1.use('/me', me);

      v1.post('/email/verify', async (req, res) => {
        const { token } = parseInput(verifyBody, req.body);
        sendData(res, await notifications.verifyEmail(token));
      });
    },
  };
}
