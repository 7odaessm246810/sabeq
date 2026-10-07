/**
 * Login rules (ADR-0008: one account = one role).
 *
 * Web: a verified phone signs in; an unknown phone becomes a new account with the role picked on
 * the login screen (student → also a student profile; mentor → an applicant until an approved
 * application lists them, Phase 09). An existing account keeps its role whatever was picked.
 * Admin: only existing admin accounts, created with `pnpm admin:create` — never by signing up.
 */
import { Errors, AppError } from '../../core/errors.js';
import type { ClientApp } from '../../generated/prisma/enums.js';
import type { Db } from '../../infra/db.js';
import type { OtpService } from './otp.service.js';
import type { SessionMeta, SessionService } from './session.service.js';

export type SignupRole = 'student' | 'mentor';

export interface PublicUser {
  id: string;
  role: 'student' | 'mentor' | 'admin';
  adminRole: string | null;
  fullName: string | null;
  phone: string;
  /** True until the profile step is done (Phase 08) — the web app asks for a name first. */
  needsProfile: boolean;
}

export interface LoginResult {
  user: PublicUser;
  isNew: boolean;
  token: string;
  expiresAt: Date;
}

export interface AuthService {
  requestCode(app: ClientApp, phone: string, ip: string): ReturnType<OtpService['request']>;
  verifyCode(input: {
    app: ClientApp;
    phone: string;
    code: string;
    role: SignupRole;
    meta: SessionMeta & { ip: string; requestId: string };
  }): Promise<LoginResult>;
  me(userId: string): Promise<PublicUser>;
}

const USER_SELECT = {
  id: true,
  role: true,
  status: true,
  fullName: true,
  phone: true,
  admin: { select: { adminRole: true } },
} as const;

interface UserRow {
  id: string;
  role: PublicUser['role'];
  status: 'active' | 'suspended' | 'deleted';
  fullName: string | null;
  phone: string;
  admin: { adminRole: string } | null;
}

function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    role: u.role,
    adminRole: u.admin?.adminRole ?? null,
    fullName: u.fullName,
    phone: u.phone,
    needsProfile: !u.fullName,
  };
}

const MESSAGES = {
  suspended: 'حسابك موقوف. كلّم الدعم عشان نعرف نساعدك.',
  adminOnly: 'الحساب ده للوحة الإدارة. سجّل دخولك من هناك.',
  notAdmin: 'الرقم ده مش مسجّل كأدمن.',
};

export function createAuthService(deps: {
  db: Db;
  otp: OtpService;
  sessions: SessionService;
}): AuthService {
  const { db, otp, sessions } = deps;

  return {
    async requestCode(app, phone, ip) {
      if (app === 'admin') {
        // Same answer either way; the SMS goes out only to real admins.
        const admin = await db.user.findFirst({
          where: { phone, role: 'admin', status: 'active' },
          select: { id: true },
        });
        return otp.request(phone, ip, { deliver: Boolean(admin) });
      }
      return otp.request(phone, ip);
    },

    async verifyCode({ app, phone, code, role, meta }) {
      await otp.verify(phone, code, meta.ip);

      let user = (await db.user.findUnique({
        where: { phone },
        select: USER_SELECT,
      })) as UserRow | null;
      let isNew = false;

      if (app === 'admin') {
        if (!user || user.role !== 'admin') throw new AppError('FORBIDDEN', MESSAGES.notAdmin);
      } else if (!user) {
        user = (await db.user.create({
          data: {
            phone,
            role,
            ...(role === 'student' ? { student: { create: {} } } : {}),
          },
          select: USER_SELECT,
        })) as UserRow;
        isNew = true;
      } else if (user.role === 'admin') {
        throw new AppError('FORBIDDEN', MESSAGES.adminOnly);
      }

      if (user.status !== 'active') throw new AppError('FORBIDDEN', MESSAGES.suspended);

      const { token, expiresAt } = await sessions.create(user.id, app, meta);
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      if (app === 'admin') {
        await db.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: 'admin',
            action: 'auth.login',
            entityType: 'user',
            entityId: user.id,
            ip: meta.ip,
            requestId: meta.requestId,
          },
        });
      }
      return { user: toPublic(user), isNew, token, expiresAt };
    },

    async me(userId) {
      const user = (await db.user.findUnique({
        where: { id: userId },
        select: USER_SELECT,
      })) as UserRow | null;
      if (!user || user.status !== 'active') throw Errors.unauthenticated();
      return toPublic(user);
    },
  };
}
