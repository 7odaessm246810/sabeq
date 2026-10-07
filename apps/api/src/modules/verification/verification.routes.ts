/**
 * Admin app only (admin session cookie):
 *
 *   /api/v1/admin/applications              GET ?status=&page=        → queue + counts per status
 *   /api/v1/admin/applications/:id          GET                       → full application + history
 *   /api/v1/admin/applications/:id/start    POST                      → submitted → under_review
 *   /api/v1/admin/applications/:id/decision POST { decision, note? }  → approve | reject | request_changes
 *   /api/v1/admin/applications/:id/documents/:docId  GET             → decrypted file (audited)
 *   /api/v1/admin/audit                     GET ?entityType=&action=&page= (super_admin)
 *
 * Verifiers and super admins review; only super admins read the whole audit log.
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requestId } from '../../core/middleware/request-context.js';
import { requireAdmin } from '../auth/index.js';
import type { VerificationService } from './verification.service.js';

const STATUSES = [
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
] as const;

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
const idParam = z.object({ id: z.uuid() });
const docParam = z.object({ id: z.uuid(), docId: z.uuid() });
const decisionBody = z
  .object({
    decision: z.enum(['approve', 'reject', 'request_changes'], { error: 'اختار القرار.' }),
    note: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().max(1000, 'اكتب 1000 حرف بالكتير.'))
      .optional()
      .transform((s) => s || undefined),
  })
  .strict();
const auditQuery = z.object({
  entityType: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const FILE_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function verificationRouter(deps: {
  verification: VerificationService;
  authenticate: RequestHandler;
}): Router {
  const { verification, authenticate } = deps;
  const r = Router();
  r.use(authenticate);

  const actor = (req: Express.Request & { ip?: string | undefined }) => {
    if (!req.auth) throw Errors.unauthenticated();
    return { auth: req.auth, ip: req.ip ?? '', requestId: requestId(req as never) };
  };

  const reviewers = requireAdmin('verifier');

  r.get('/applications', reviewers, async (req, res) => {
    const q = parseInput(listQuery, req.query);
    const { items, meta, counts } = await verification.list(q);
    // Page numbers (not cursors): reviewers jump between pages of a small queue.
    sendData(res, { items, counts, page: meta });
  });

  r.get('/applications/:id', reviewers, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    sendData(res, { application: await verification.detail(id) });
  });

  r.post('/applications/:id/start', reviewers, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await verification.startReview(id, actor(req));
    sendData(res, { application: await verification.detail(id) });
  });

  r.post('/applications/:id/decision', reviewers, async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    const { decision, note } = parseInput(decisionBody, req.body);
    await verification.decide(id, decision, note, actor(req));
    sendData(res, { application: await verification.detail(id) });
  });

  r.get('/applications/:id/documents/:docId', reviewers, async (req, res) => {
    const { id, docId } = parseInput(docParam, req.params);
    const file = await verification.document(id, docId, actor(req));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.kind}.${FILE_EXT[file.mimeType] ?? 'bin'}"`,
    );
    // Identity documents: never cached anywhere, never framed, nothing else may load with them.
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; object-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
    res.end(file.body);
  });

  r.get('/audit', requireAdmin('super_admin'), async (req, res) => {
    const q = parseInput(auditQuery, req.query);
    const { items, meta } = await verification.auditLog(q);
    sendData(res, { items, page: meta });
  });

  return r;
}
