/** Types and helpers shared by the catalog service files. */
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';
import type { AuthContext } from '../auth/session.service.js';

export interface Actor {
  auth: AuthContext;
  ip: string;
  requestId: string;
}

/** PATCH bodies: omitted fields arrive as undefined and must not reach the update. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };
export const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };

export type Audit = (
  tx: Prisma.TransactionClient | Db,
  actor: Actor,
  action: string,
  entity: { type: string; id: string },
  change: { before?: object; after?: object },
) => Promise<unknown>;
