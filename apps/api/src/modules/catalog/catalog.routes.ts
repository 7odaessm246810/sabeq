/**
 * Public  /api/v1/catalog
 *   GET universities             → { universities: [{ slug, name, faculties: [{ id, kind, name }] }] }
 *   GET faculty-kinds            → { kinds: [...] }   (explore page)
 *   GET faculty-kinds/:slug      → { kind }           (faculty page) · 404 when unknown
 *
 * Admin   /api/v1/admin/catalog  (super_admin, support — every write audited)
 *   GET   kinds · GET kinds/:id · PATCH kinds/:id
 *   POST  kinds/:id/insights · PATCH insights/:id · DELETE insights/:id
 *   POST  faculties/:id/departments · PATCH departments/:id
 *   GET   universities · PATCH universities/:id
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requestId } from '../../core/middleware/request-context.js';
import { requireAdmin } from '../auth/index.js';
import type { Actor, CatalogService } from './catalog.service.js';

/** Reference data changes rarely; browsers and CDNs may keep it for a few minutes. */
const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=600';

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) });
const idParam = z.object({ id: z.uuid() });

const text = (max: number, min = 1) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, 'الخانة دي مطلوبة.').max(max, `اكتب ${max} حرف بالكتير.`));
/** Long texts keep their line breaks. */
const longText = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, 'الخانة دي مطلوبة.').max(max, `اكتب ${max} حرف بالكتير.`));

const kindPatch = z
  .object({
    nameAr: text(80, 2).optional(),
    fullNameAr: text(120, 2).optional(),
    summary: text(200).optional(),
    about: longText(4000).optional(),
    genericInfo: longText(4000).optional(),
    studyYears: z.number().int().min(2).max(7).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
const insightBody = z.object({ quote: text(400, 5) }).strict();
const insightPatch = z
  .object({ quote: text(400, 5).optional(), isPublished: z.boolean().optional() })
  .strict();
const departmentBody = z.object({ nameAr: text(120, 2) }).strict();
const departmentPatch = z
  .object({ nameAr: text(120, 2).optional(), isActive: z.boolean().optional() })
  .strict();
const universityPatch = z
  .object({ nameAr: text(120, 2).optional(), isActive: z.boolean().optional() })
  .strict();

export function catalogRouter({ catalog }: { catalog: CatalogService }): Router {
  const r = Router();

  r.get('/universities', async (_req, res) => {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    sendData(res, { universities: await catalog.universities() });
  });

  r.get('/faculty-kinds', async (_req, res) => {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    sendData(res, { kinds: await catalog.kinds() });
  });

  r.get('/faculty-kinds/:slug', async (req, res) => {
    const { slug } = parseInput(slugParam, req.params);
    const kind = await catalog.kind(slug);
    if (!kind) throw Errors.notFound('الكلية دي مش موجودة.');
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    sendData(res, { kind });
  });

  return r;
}

export function catalogAdminRouter(deps: {
  catalog: CatalogService;
  authenticate: RequestHandler;
}): Router {
  const { catalog, authenticate } = deps;
  const r = Router();
  r.use(authenticate, requireAdmin('support'));

  const actor = (req: Express.Request & { ip?: string | undefined }): Actor => {
    if (!req.auth) throw Errors.unauthenticated();
    return { auth: req.auth, ip: req.ip ?? '', requestId: requestId(req as never) };
  };

  r.get('/kinds', async (_req, res) => {
    sendData(res, { kinds: await catalog.adminKinds() });
  });

  r.get('/kinds/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    sendData(res, { kind: await catalog.adminKind(id) });
  });

  r.patch('/kinds/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.updateKind(id, parseInput(kindPatch, req.body), actor(req));
    sendData(res, { kind: await catalog.adminKind(id) });
  });

  r.post('/kinds/:id/insights', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.addInsight(id, parseInput(insightBody, req.body).quote, actor(req));
    sendData(res, { kind: await catalog.adminKind(id) }, undefined, 201);
  });

  r.patch('/insights/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.updateInsight(id, parseInput(insightPatch, req.body), actor(req));
    sendData(res, { updated: true });
  });

  r.delete('/insights/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.deleteInsight(id, actor(req));
    sendData(res, { deleted: true });
  });

  r.post('/faculties/:id/departments', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.addDepartment(id, parseInput(departmentBody, req.body).nameAr, actor(req));
    sendData(res, { created: true }, undefined, 201);
  });

  r.patch('/departments/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.updateDepartment(id, parseInput(departmentPatch, req.body), actor(req));
    sendData(res, { updated: true });
  });

  r.get('/universities', async (_req, res) => {
    sendData(res, { universities: await catalog.adminUniversities() });
  });

  r.patch('/universities/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.updateUniversity(id, parseInput(universityPatch, req.body), actor(req));
    sendData(res, { universities: await catalog.adminUniversities() });
  });

  return r;
}
