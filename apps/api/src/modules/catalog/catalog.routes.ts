/**
 * Public  /api/v1/catalog
 *   GET universities             → { universities: [{ slug, name, faculties: [{ id, kind, name }] }] }
 *   GET faculty-kinds            → { kinds: [...] }   (explore page)
 *   GET faculty-kinds/:slug      → { kind }           (faculty page) · 404 when unknown
 *   GET faculties?q&governorate&university&category&kind&type&page
 *                                → { total, page, pageSize, results, facets }   (explore search)
 *   GET faculties/:id            → { faculty }        (one faculty at one university) · 404
 *
 * Admin   /api/v1/admin/catalog  (super_admin, support — every write audited)
 *   GET   kinds · GET kinds/:id · PATCH kinds/:id
 *   POST  kinds/:id/insights · PATCH insights/:id · DELETE insights/:id
 *   POST  faculties/:id/departments · PATCH departments/:id
 *   GET   universities · POST universities · GET/PATCH/DELETE universities/:id
 *   PUT   universities/:id/logo (raw PNG / JPEG / WebP ≤ 512 KB) · DELETE universities/:id/logo
 *   POST  faculties · GET/PATCH/DELETE faculties/:id · PUT/DELETE faculties/:id/logo
 *   POST  faculties/:id/cutoffs · DELETE cutoffs/:id
 *   DELETE refuses (409) what mentors or applications depend on — hide it instead.
 */
import {
  ACCREDITATION_STATUSES,
  FACULTY_CATEGORIES,
  GOVERNORATES,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  UNIVERSITY_TYPES,
} from '@sabeq/types';
import express, { Router, type RequestHandler } from 'express';
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
/** Optional text: empty means "clear it". */
const optionalText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, `اكتب ${max} حرف بالكتير.`))
    .transform((s) => s || null)
    .nullable()
    .optional();
const website = z
  .string()
  .trim()
  .transform((s) => s || null)
  .pipe(
    z
      .url({ protocol: /^https?$/, error: 'اكتب رابط كامل يبدأ بـ https://' })
      .max(200, 'الرابط طويل أوي.')
      .nullable(),
  )
  .nullable()
  .optional();
const governorate = z
  .enum(GOVERNORATES, { error: 'اختار المحافظة من القائمة.' })
  .nullable()
  .optional();
const day = z.iso.date({ error: 'التاريخ مش صحيح.' }).nullable().optional();

const universityFields = {
  nameAr: text(120, 2),
  nameEn: optionalText(120),
  type: z.enum(UNIVERSITY_TYPES, { error: 'اختار نوع الجامعة.' }),
  governorate,
  website,
  isActive: z.boolean().optional(),
};
const universityBody = z
  .object({
    ...universityFields,
    slug: z
      .string()
      .regex(/^[a-z0-9-]{2,60}$/, 'الرابط حروف إنجليزي صغيرة وأرقام وشرطة بس.')
      .optional(),
  })
  .strict();
const universityPatch = z.object(universityFields).partial().strict();

const facultyFields = {
  kindId: z.uuid({ error: 'اختار نوع الكلية.' }),
  nameAr: text(160, 4),
  city: optionalText(80),
  governorate,
  website,
  about: z
    .string()
    .trim()
    .max(4000, 'اكتب 4000 حرف بالكتير.')
    .transform((s) => s || null)
    .nullable()
    .optional(),
  accreditationStatus: z.enum(ACCREDITATION_STATUSES).optional(),
  accreditedAt: day,
  accreditationExpiresAt: day,
  isActive: z.boolean().optional(),
};
const facultyBody = z
  .object({ universityId: z.uuid({ error: 'اختار الجامعة.' }), ...facultyFields })
  .strict();
const facultyPatch = z.object(facultyFields).partial().strict();

const cutoffBody = z
  .object({
    year: z.number().int().min(2000).max(2100),
    phase: z.number().int().min(1).max(4),
    track: z.enum(['science_bio', 'science_math', 'literary'], { error: 'اختار الشعبة.' }),
    minScore: z.number().min(0, 'الدرجة مش صحيحة.'),
    maxScore: z.number().int().min(1).max(1000),
    sourceUrl: z.url({ protocol: /^https?$/, error: 'حط رابط المصدر اللي اتعلن فيه الرقم.' }),
  })
  .strict()
  .refine((c) => c.minScore <= c.maxScore, {
    path: ['minScore'],
    message: 'الحد الأدنى لازم يكون أقل من الدرجة النهائية.',
  });

const searchQuery = z.object({
  q: z.string().max(100).optional(),
  governorate: z.string().max(60).optional(),
  university: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  category: z.enum(FACULTY_CATEGORIES).optional(),
  kind: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  type: z.enum(UNIVERSITY_TYPES).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

/** Logo uploads: the body is the file. The declared type only gates the parser; the bytes decide. */
const logoBody = express.raw({ type: [...LOGO_TYPES], limit: LOGO_MAX_BYTES });

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

  r.get('/faculties', async (req, res) => {
    const params = parseInput(searchQuery, req.query);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    sendData(res, await catalog.search(params));
  });

  r.get('/faculties/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    const faculty = await catalog.faculty(id);
    if (!faculty) throw Errors.notFound('الكلية دي مش موجودة.');
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    sendData(res, { faculty });
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

  r.post('/universities', async (req, res) => {
    const id = await catalog.createUniversity(parseInput(universityBody, req.body), actor(req));
    sendData(res, { university: await catalog.adminUniversity(id) }, undefined, 201);
  });

  r.get('/universities/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    sendData(res, { university: await catalog.adminUniversity(id) });
  });

  r.patch('/universities/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.updateUniversity(id, parseInput(universityPatch, req.body), actor(req));
    sendData(res, { university: await catalog.adminUniversity(id) });
  });

  r.delete('/universities/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.deleteUniversity(id, actor(req));
    sendData(res, { deleted: true });
  });

  r.put('/universities/:id/logo', logoBody, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    sendData(res, { logo: await catalog.setUniversityLogo(id, req.body, actor(req)) });
  });

  r.delete('/universities/:id/logo', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.removeUniversityLogo(id, actor(req));
    sendData(res, { logo: null });
  });

  r.post('/faculties', async (req, res) => {
    const id = await catalog.createFaculty(parseInput(facultyBody, req.body), actor(req));
    sendData(res, { faculty: await catalog.adminFaculty(id) }, undefined, 201);
  });

  r.get('/faculties/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    sendData(res, { faculty: await catalog.adminFaculty(id) });
  });

  r.patch('/faculties/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.updateFaculty(id, parseInput(facultyPatch, req.body), actor(req));
    sendData(res, { faculty: await catalog.adminFaculty(id) });
  });

  r.delete('/faculties/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.deleteFaculty(id, actor(req));
    sendData(res, { deleted: true });
  });

  r.put('/faculties/:id/logo', logoBody, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    sendData(res, { logo: await catalog.setFacultyLogo(id, req.body, actor(req)) });
  });

  r.delete('/faculties/:id/logo', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.removeFacultyLogo(id, actor(req));
    sendData(res, { logo: null });
  });

  r.post('/faculties/:id/cutoffs', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.saveCutoff(id, parseInput(cutoffBody, req.body), actor(req));
    sendData(res, { faculty: await catalog.adminFaculty(id) }, undefined, 201);
  });

  r.delete('/cutoffs/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await catalog.deleteCutoff(id, actor(req));
    sendData(res, { deleted: true });
  });

  return r;
}
