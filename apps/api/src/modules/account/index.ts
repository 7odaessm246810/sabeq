import type { Router } from 'express';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { accountRouter } from './account.routes.js';
import { createAccountService } from './account.service.js';

/** Account module (Phase 08): the website user's profile and signed-in devices under /api/v1/me. */
export function createAccountModule({
  db,
  auth,
}: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
}) {
  const account = createAccountService({ db, sessions: auth.sessions });
  return {
    mount(v1: Router) {
      v1.use('/me', accountRouter({ account, authenticate: auth.authenticate('web') }));
    },
  };
}
