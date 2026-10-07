import type { Router } from 'express';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import type { ObjectStore } from '../../infra/storage.js';
import type { createAuthModule } from '../auth/index.js';
import { verificationRouter } from './verification.routes.js';
import { createVerificationService } from './verification.service.js';

/** Admin verification of mentor applications + audit log (Phase 10), under /api/v1/admin. */
export function createVerificationModule(deps: {
  db: Db;
  store: ObjectStore;
  crypto: DocumentCrypto;
  auth: ReturnType<typeof createAuthModule>;
}) {
  const verification = createVerificationService(deps);
  return {
    verification,
    mount(v1: Router) {
      v1.use(
        '/admin',
        verificationRouter({ verification, authenticate: deps.auth.authenticate('admin') }),
      );
    },
  };
}
