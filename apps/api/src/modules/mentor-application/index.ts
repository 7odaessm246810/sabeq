import type { Router } from 'express';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import type { ObjectStore } from '../../infra/storage.js';
import type { createAuthModule } from '../auth/index.js';
import { applicationRouter } from './application.routes.js';
import { createApplicationService } from './application.service.js';

/** Mentor onboarding, applicant side (Phase 09): /api/v1/mentor/application. */
export function createMentorApplicationModule(deps: {
  db: Db;
  store: ObjectStore;
  crypto: DocumentCrypto;
  auth: ReturnType<typeof createAuthModule>;
}) {
  const applications = createApplicationService(deps);
  return {
    applications,
    mount(v1: Router) {
      v1.use(
        '/mentor/application',
        applicationRouter({ applications, authenticate: deps.auth.authenticate('web') }),
      );
    },
  };
}
