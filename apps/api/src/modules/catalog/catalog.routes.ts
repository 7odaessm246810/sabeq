/**
 * /api/v1/catalog — public reference data. Phase 09 needs universities and their faculties for the
 * mentor application; Phase 11 extends this module (faculty pages, departments, search).
 *
 *   GET universities → { universities: [{ slug, name, faculties: [{ id, kind, name }] }] }
 */
import { Router } from 'express';
import { sendData } from '../../core/http.js';
import type { Db } from '../../infra/db.js';

export function catalogRouter({ db }: { db: Db }): Router {
  const r = Router();

  r.get('/universities', async (_req, res) => {
    const rows = await db.university.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: {
        slug: true,
        nameAr: true,
        faculties: {
          where: { isActive: true, kind: { isActive: true } },
          orderBy: { kind: { sortOrder: 'asc' } },
          select: { id: true, nameAr: true, kind: { select: { slug: true, fullNameAr: true } } },
        },
      },
    });
    // Reference data changes rarely; let browsers and the CDN keep it for a few minutes.
    res.setHeader('Cache-Control', 'public, max-age=300');
    sendData(res, {
      universities: rows.map((u) => ({
        slug: u.slug,
        name: u.nameAr,
        faculties: u.faculties.map((f) => ({
          id: f.id,
          kind: f.kind.slug,
          name: f.nameAr ?? f.kind.fullNameAr,
        })),
      })),
    });
  });

  return r;
}
