/**
 * Auth module: wires OTP, sessions and login rules, mounts the routes, and hands other modules the
 * middleware they need (`authenticate` per app; `requireRole` / `requireAdmin` are exported directly).
 */
import type { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Config } from '../../config/env.js';
import type { ClientApp } from '../../generated/prisma/enums.js';
import type { Db } from '../../infra/db.js';
import { authenticate } from './auth.middleware.js';
import { authRouter } from './auth.routes.js';
import { createAuthService } from './auth.service.js';
import { createOtpService } from './otp.service.js';
import { createSessionService } from './session.service.js';
import { consoleSms, type SmsSender } from './sms.js';

export { requireAdmin, requireAuth, requireRole } from './auth.middleware.js';
export type { AuthContext } from './session.service.js';

export interface AuthModuleDeps {
  config: Config;
  db: Db;
  redis: Redis;
  logger: Logger;
  /** Tests inject a fake to read codes; production picks the provider from config. */
  sms?: SmsSender;
}

export function createAuthModule({ config, db, redis, logger, sms }: AuthModuleDeps) {
  const sender = sms ?? consoleSms(logger);
  const otp = createOtpService({
    redis,
    sms: sender,
    secret: config.auth.otpSecret,
    exposeCode: config.appEnv === 'local' && sender.insecure,
  });
  const sessions = createSessionService({ db, redis });
  const auth = createAuthService({ db, otp, sessions });
  const secureCookies = config.auth.secureCookies;

  return {
    sessions,
    authenticate: (app: ClientApp) => authenticate(sessions, app, secureCookies),
    mount(v1: Router) {
      v1.use('/auth', authRouter({ app: 'web', auth, sessions, secureCookies }));
      v1.use('/admin/auth', authRouter({ app: 'admin', auth, sessions, secureCookies }));
    },
  };
}
