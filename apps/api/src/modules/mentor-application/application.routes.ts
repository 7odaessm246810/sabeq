/**
 * /api/v1/mentor/application — the signed-in mentor applicant's own application.
 *
 *   GET                         → { application | null }
 *   PUT                         { fullName?, kind?, universitySlug?, facultyId?, major?,
 *                                 graduationYear?, basePriceEgp?, days?, topics? } → { application }
 *   POST   documents/:slot      raw file body (PDF / JPEG / PNG / WebP ≤ 10 MB),
 *                               slot = credential | national_id_front → { document }
 *   DELETE documents/:id        → { deleted: true }
 *   POST   submit               → { application } (status `submitted`)
 */
import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../core/errors.js';
import { parseInput, sendData } from '../../core/http.js';
import { requestId } from '../../core/middleware/request-context.js';
import { requireRole } from '../auth/index.js';
import { draftSchema, UPLOAD_KINDS } from './application.schemas.js';
import type { ApplicationService } from './application.service.js';
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from './file-type.js';

const slotParam = z.object({ slot: z.enum(UPLOAD_KINDS) });
const idParam = z.object({ id: z.uuid() });

export function applicationRouter(deps: {
  applications: ApplicationService;
  authenticate: RequestHandler;
}): Router {
  const { applications, authenticate } = deps;
  const r = Router();
  r.use(authenticate, requireRole('mentor'));

  const userId = (req: Express.Request) => {
    if (!req.auth) throw Errors.unauthenticated();
    return req.auth.userId;
  };

  r.get('/', async (req, res) => {
    sendData(res, { application: await applications.current(userId(req)) });
  });

  r.put('/', async (req, res) => {
    const input = parseInput(draftSchema, req.body);
    sendData(res, { application: await applications.saveDraft(userId(req), input) });
  });

  // The file is the request body. The declared type only gates the parser; the stored type is
  // sniffed from the bytes in the service.
  r.post(
    '/documents/:slot',
    express.raw({ type: [...DOCUMENT_TYPES], limit: DOCUMENT_MAX_BYTES }),
    async (req, res) => {
      const { slot } = parseInput(slotParam, req.params);
      const document = await applications.uploadDocument(userId(req), slot, req.body);
      sendData(res, { document }, undefined, 201);
    },
  );

  r.delete('/documents/:id', async (req, res) => {
    const { id } = parseInput(idParam, req.params);
    await applications.deleteDocument(userId(req), id);
    sendData(res, { deleted: true });
  });

  r.post('/submit', async (req, res) => {
    const application = await applications.submit(userId(req), {
      ip: req.ip ?? '',
      requestId: requestId(req),
    });
    sendData(res, { application });
  });

  return r;
}
