import type { Router } from 'express';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import { catalogAdminRouter, catalogRouter } from './catalog.routes.js';
import { createCatalogService } from './catalog.service.js';

/** Catalog (Phase 11): public reads under /api/v1/catalog, curation under /api/v1/admin/catalog. */
export function createCatalogModule(deps: { db: Db; auth: ReturnType<typeof createAuthModule> }) {
  const catalog = createCatalogService(deps);
  return {
    catalog,
    mount(v1: Router) {
      v1.use('/catalog', catalogRouter({ catalog }));
      v1.use(
        '/admin/catalog',
        catalogAdminRouter({ catalog, authenticate: deps.auth.authenticate('admin') }),
      );
    },
  };
}
