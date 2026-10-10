/**
 * Admin actions (Phase 20) go to the append-only audit log, in the same transaction as the change
 * when there is one.
 */
import type { Request } from 'express';
import { Errors } from '../../core/errors.js';
import { inetOrNull } from '../../core/http.js';
import { requestId } from '../../core/middleware/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';
import type { AuthContext } from '../auth/session.service.js';

export interface AdminActor {
  auth: AuthContext;
  ip: string;
  requestId: string;
}

export function actorOf(req: Request): AdminActor {
  if (!req.auth) throw Errors.unauthenticated();
  return { auth: req.auth, ip: req.ip ?? '', requestId: requestId(req as never) };
}

export function writeAudit(
  tx: Prisma.TransactionClient | Db,
  actor: AdminActor,
  action: string,
  entity: { type: string; id: string },
  change: { before?: object; after?: object } = {},
) {
  return tx.auditLog.create({
    data: {
      actorUserId: actor.auth.userId,
      actorRole: actor.auth.adminRole ?? 'admin',
      action,
      entityType: entity.type,
      entityId: entity.id,
      ...(change.before ? { before: change.before } : {}),
      ...(change.after ? { after: change.after } : {}),
      ip: inetOrNull(actor.ip),
      requestId: actor.requestId,
    },
  });
}
