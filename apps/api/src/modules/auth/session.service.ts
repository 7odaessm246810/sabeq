/**
 * Server-side sessions behind an opaque cookie token.
 *
 * Why not JWTs: a session must die the moment an account is suspended or the person logs out on
 * every device — with money involved that cannot wait for a token to expire. The token is 32 random
 * bytes; the database keeps only its SHA-256, so a database leak does not leak live sessions.
 * Lookups are cached in Redis for a few minutes; revoking deletes the cache entry immediately.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ClientApp, UserRole, AdminRole } from '../../generated/prisma/enums.js';
import { inetOrNull } from '../../core/http.js';
import type { Db } from '../../infra/db.js';

/** What every authenticated request knows about its caller. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  role: UserRole;
  adminRole: AdminRole | null;
  app: ClientApp;
}

export const SESSION_TTL_SECONDS: Record<ClientApp, number> = {
  web: 30 * 86_400,
  // Admin sessions are short: the admin app moves money and sees national IDs.
  admin: 12 * 3600,
};

const CACHE_SECONDS = 300;
const cacheKey = (hash: string) => `session:${hash}`;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface SessionMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface SessionService {
  create(
    userId: string,
    app: ClientApp,
    meta: SessionMeta,
  ): Promise<{ token: string; expiresAt: Date }>;
  /** The caller for a cookie token, or null when it is unknown, expired, revoked or for another app. */
  resolve(token: string, app: ClientApp): Promise<AuthContext | null>;
  revoke(sessionId: string): Promise<void>;
  /** Logs a user out everywhere — on suspension, role change or "log out of all devices". */
  revokeAll(userId: string): Promise<void>;
}

interface CachedSession extends AuthContext {
  expiresAt: number;
}

export function createSessionService({ db, redis }: { db: Db; redis: Redis }): SessionService {
  async function purge(hashes: string[]) {
    if (hashes.length) await redis.del(...hashes.map(cacheKey));
  }

  return {
    async create(userId, app, meta) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS[app] * 1000);
      await db.authSession.create({
        data: {
          userId,
          app,
          tokenHash: hashToken(token),
          expiresAt,
          ip: inetOrNull(meta.ip),
          userAgent: meta.userAgent?.slice(0, 400) ?? null,
        },
      });
      return { token, expiresAt };
    },

    async resolve(token, app) {
      if (token.length < 40 || token.length > 64) return null;
      const hash = hashToken(token);

      const cached = await redis.get(cacheKey(hash));
      if (cached) {
        const s = JSON.parse(cached) as CachedSession;
        if (s.app !== app || s.expiresAt <= Date.now()) return null;
        const { expiresAt: _expiresAt, ...ctx } = s;
        return ctx;
      }

      const row = await db.authSession.findUnique({
        where: { tokenHash: hash },
        select: {
          id: true,
          app: true,
          expiresAt: true,
          revokedAt: true,
          user: {
            select: { id: true, role: true, status: true, admin: { select: { adminRole: true } } },
          },
        },
      });
      if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
      if (row.app !== app || row.user.status !== 'active') return null;

      const ctx: AuthContext = {
        sessionId: row.id,
        userId: row.user.id,
        role: row.user.role,
        adminRole: row.user.admin?.adminRole ?? null,
        app: row.app,
      };
      const ttl = Math.min(
        CACHE_SECONDS,
        Math.floor((row.expiresAt.getTime() - Date.now()) / 1000),
      );
      if (ttl > 0) {
        const value: CachedSession = { ...ctx, expiresAt: row.expiresAt.getTime() };
        await redis.set(cacheKey(hash), JSON.stringify(value), 'EX', ttl);
      }
      // Cache misses happen at most every few minutes per session — cheap enough to record activity.
      await db.authSession.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
      return ctx;
    },

    async revoke(sessionId) {
      const row = await db.authSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
        select: { tokenHash: true },
      });
      await purge([row.tokenHash]);
    },

    async revokeAll(userId) {
      const live = await db.authSession.findMany({
        where: { userId, revokedAt: null },
        select: { tokenHash: true },
      });
      await db.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await purge(live.map((s) => s.tokenHash));
    },
  };
}
