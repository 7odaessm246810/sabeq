/**
 * Auth module: wires passwords, Google, admin app codes and sessions, mounts the routes, and hands
 * other modules the middleware they need (`authenticate` per app; `requireRole` / `requireAdmin` are
 * exported directly).
 */
import type { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Config } from '../../config/env.js';
import type { ClientApp } from '../../generated/prisma/enums.js';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import type { EmailSender } from '../notifications/email.js';
import { authenticate } from './auth.middleware.js';
import { adminAuthRouter, webAuthRouter } from './auth.routes.js';
import { createAuthService } from './auth.service.js';
import { createGoogleClient, type GoogleClient } from './google.js';
import { createSessionService } from './session.service.js';

export { requireAdmin, requireAuth, requireRole } from './auth.middleware.js';
export type { AuthContext } from './session.service.js';

export interface AuthModuleDeps {
  config: Pick<Config, 'auth' | 'publicWebUrl'>;
  db: Db;
  redis: Redis;
  logger: Logger;
  crypto: DocumentCrypto;
  email: EmailSender;
  /** Late-bound to notifications (created later): sends the "confirm your email" link. */
  sendVerification: (userId: string, email: string) => Promise<{ devLink?: string }>;
  /** Tests inject a fake Google; otherwise it is on when GOOGLE_CLIENT_ID / _SECRET are set. */
  google?: { client: GoogleClient; clientId: string };
}

export function createAuthModule(deps: AuthModuleDeps) {
  const { config, db, redis, logger } = deps;
  const googleCfg = config.auth.google;
  const google =
    deps.google ??
    (googleCfg ? { client: createGoogleClient(googleCfg), clientId: googleCfg.clientId } : null);
  const sessions = createSessionService({ db, redis });
  const auth = createAuthService({
    db,
    redis,
    sessions,
    crypto: deps.crypto,
    email: deps.email,
    logger,
    secret: config.auth.secret,
    publicWebUrl: config.publicWebUrl,
    google,
    emailConfirmation: config.auth.emailConfirmation,
    sendVerification: deps.sendVerification,
  });
  const secureCookies = config.auth.secureCookies;
  const routerDeps = {
    auth,
    sessions,
    secureCookies,
    logger,
    emailLinks: config.auth.emailConfirmation,
  };

  return {
    sessions,
    service: auth,
    /** Booking and paying wait for a confirmed email (bookings, payments). */
    requireConfirmedEmail: config.auth.emailConfirmation,
    authenticate: (app: ClientApp) => authenticate(sessions, app, secureCookies),
    mount(v1: Router) {
      v1.use('/auth', webAuthRouter(routerDeps));
      v1.use('/admin/auth', adminAuthRouter(routerDeps));
    },
  };
}
