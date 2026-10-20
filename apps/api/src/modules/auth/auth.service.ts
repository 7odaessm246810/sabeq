/**
 * Login rules (ADR-0017; ADR-0008: one account = one role).
 *
 * Web: an account is made with name + email + password (role picked on the form), or with Google.
 * Either way the email is the login. A password account must confirm its email before booking;
 * Google has already confirmed it. Signing in with Google links to an existing account with the same
 * address — and when that address was never confirmed, the old password is dropped and its sessions
 * ended, so whoever registered someone else's email cannot keep a way in.
 * Admin: only accounts made with `pnpm admin:create`; email + password, then a code from an
 * authenticator app (set up on the first sign-in). Admins never sign in on the website.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { AppError, Errors } from '../../core/errors.js';
import { inetOrNull } from '../../core/http.js';
import type { ClientApp } from '../../generated/prisma/enums.js';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import type { EmailSender } from '../notifications/email.js';
import {
  checkIdToken,
  codeChallenge,
  GoogleAuthError,
  newGoogleState,
  openState,
  sealState,
  type GoogleClient,
} from './google.js';
import { hitWindow } from './limits.js';
import {
  fingerprint,
  LINK_MINUTES,
  passwordEmail,
  passwordToken,
  readPasswordToken,
} from './links.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';
import type { SessionMeta, SessionService } from './session.service.js';
import { matchTotp, newTotpSecret, otpauthUri } from './totp.js';

export type SignupRole = 'student' | 'mentor';

export interface PublicUser {
  id: string;
  role: 'student' | 'mentor' | 'admin';
  adminRole: string | null;
  fullName: string | null;
  email: string | null;
  /** Booking and paying wait for this (password accounts confirm by email; Google ones already are). */
  emailVerified: boolean;
  phone: string | null;
  /** False for accounts that only ever signed in with Google. */
  hasPassword: boolean;
  /** True until the profile step is done — the web app asks for a name first. */
  needsProfile: boolean;
}

export interface LoginResult {
  user: PublicUser;
  isNew: boolean;
  token: string;
  expiresAt: Date;
}

type Meta = SessionMeta & { ip: string; requestId: string };

export type AdminStep =
  | { step: 'totp'; challenge: string }
  | { step: 'setup'; challenge: string; secret: string; uri: string };

export const AUTH_LIMITS = {
  loginPerIp: { limit: 30, windowSeconds: 900 },
  /**
   * Sign-in attempts per hour before a lock: per account from one address (so a stranger cannot
   * lock someone out from their own device), and per account from everywhere (spread guessing).
   */
  failuresPerEmail: { limit: 10, windowSeconds: 3600 },
  failuresPerAccount: { limit: 50, windowSeconds: 3600 },
  /** Wrong app codes per admin per hour, across every sign-in attempt. */
  totpFailuresPerAdmin: { limit: 10, windowSeconds: 3600 },
  registerPerIp: { limit: 10, windowSeconds: 3600 },
  forgotPerIp: { limit: 10, windowSeconds: 3600 },
  forgotPerEmail: { limit: 3, windowSeconds: 3600 },
  challengeSeconds: 600,
  challengeAttempts: 5,
} as const;

export const MESSAGES = {
  badLogin: 'الإيميل أو الباسورد غلط.',
  locked: 'محاولات غلط كتير على الحساب ده. استنى شوية وجرّب تاني، أو غيّر الباسورد.',
  tooMany: 'محاولات كتير من الجهاز ده. استنى شوية وجرّب تاني.',
  emailTaken: 'الإيميل ده عليه حساب بالفعل. سجّل دخولك، أو غيّر الباسورد لو نسيته.',
  suspended: 'حسابك موقوف. كلّم الدعم عشان نعرف نساعدك.',
  adminOnly: 'الحساب ده للوحة الإدارة. سجّل دخولك من هناك.',
  badCode: 'الكود غلط أو قديم. اكتب الكود اللي ظاهر دلوقتي في التطبيق.',
  challengeGone: 'الخطوة دي انتهت. سجّل دخولك من الأول.',
  badLink: 'الرابط ده مش صحيح أو اتستخدم أو قديم. اطلب رابط جديد.',
  wrongPassword: 'الباسورد الحالي غلط.',
  googleOff: 'الدخول بجوجل مش متاح دلوقتي.',
} as const;

const USER_SELECT = {
  id: true,
  role: true,
  status: true,
  fullName: true,
  email: true,
  emailVerifiedAt: true,
  phone: true,
  passwordHash: true,
  googleSub: true,
  admin: { select: { adminRole: true, totpSecretEnc: true, totpEnabledAt: true } },
} as const;

interface UserRow {
  id: string;
  role: PublicUser['role'];
  status: 'active' | 'suspended' | 'deleted';
  fullName: string | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  passwordHash: string | null;
  googleSub: string | null;
  admin: { adminRole: string; totpSecretEnc: string | null; totpEnabledAt: Date | null } | null;
}

export function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    role: u.role,
    adminRole: u.admin?.adminRole ?? null,
    fullName: u.fullName,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    phone: u.phone,
    hasPassword: u.passwordHash !== null,
    needsProfile: !u.fullName,
  };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === 'P2002';

export interface AuthServiceDeps {
  db: Db;
  redis: Redis;
  sessions: SessionService;
  crypto: DocumentCrypto;
  email: EmailSender;
  logger: Logger;
  /** Signs password links and the Google state. */
  secret: string;
  publicWebUrl: string;
  google: { client: GoogleClient; clientId: string } | null;
  /** Off while no email is really sent: sign-up sends no link and booking does not wait. */
  emailConfirmation: boolean;
  /**
   * APP_ENV=local only: hand the emailed link back in the response (no email leaves the machine).
   * Never on a hosted environment — anyone could ask for a reset link for someone else's account.
   */
  exposeLinks: boolean;
  /** Late-bound to the notifications module: sends the "confirm your email" link. */
  sendVerification: (userId: string, email: string) => Promise<{ devLink?: string }>;
  now?: () => Date;
}

export function createAuthService(deps: AuthServiceDeps) {
  const { db, redis, sessions, crypto, email, logger, secret, publicWebUrl } = deps;
  const now = deps.now ?? (() => new Date());
  const googleRedirect = `${publicWebUrl}/api/v1/auth/google/callback`;

  const findByEmail = (address: string) =>
    db.user.findUnique({
      where: { email: address },
      select: USER_SELECT,
    }) as Promise<UserRow | null>;

  async function limit(key: string, rule: { limit: number; windowSeconds: number }, msg: string) {
    const hit = await hitWindow(redis, key, rule.limit, rule.windowSeconds);
    if (!hit.allowed) throw Errors.rateLimited(msg, hit.retryAfter);
  }

  async function startSession(user: UserRow, app: ClientApp, meta: Meta, isNew: boolean) {
    if (user.status !== 'active') throw new AppError('FORBIDDEN', MESSAGES.suspended);
    const { token, expiresAt } = await sessions.create(user.id, app, meta);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now() } });
    if (app === 'admin') {
      await db.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: 'admin',
          action: 'auth.login',
          entityType: 'user',
          entityId: user.id,
          ip: inetOrNull(meta.ip),
          requestId: meta.requestId,
        },
      });
    }
    return { user: toPublic(user), isNew, token, expiresAt };
  }

  /** Email + password, with the per-IP budget and the per-account lockout. */
  async function checkPassword(address: string, password: string, ip: string): Promise<UserRow> {
    await limit(`auth:login:ip:${ip}`, AUTH_LIMITS.loginPerIp, MESSAGES.tooMany);
    // Counted before checking (atomic INCR), so parallel guesses cannot slip past the cap.
    const accountKey = `auth:login:fail:${sha(address)}`;
    const deviceKey = `${accountKey}:${sha(ip).slice(0, 16)}`;
    const fromHere = await hitWindow(
      redis,
      deviceKey,
      AUTH_LIMITS.failuresPerEmail.limit,
      AUTH_LIMITS.failuresPerEmail.windowSeconds,
    );
    const overall = await hitWindow(
      redis,
      accountKey,
      AUTH_LIMITS.failuresPerAccount.limit,
      AUTH_LIMITS.failuresPerAccount.windowSeconds,
    );
    if (!fromHere.allowed || !overall.allowed)
      throw Errors.rateLimited(
        MESSAGES.locked,
        Math.max(
          fromHere.allowed ? 0 : fromHere.retryAfter,
          overall.allowed ? 0 : overall.retryAfter,
        ),
      );
    const user = await findByEmail(address);
    const ok = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !ok) throw new AppError('UNAUTHENTICATED', MESSAGES.badLogin);
    // The right password: this attempt was not a failure after all.
    await redis.del(deviceKey);
    await redis.decr(accountKey);
    if (user.passwordHash && needsRehash(user.passwordHash)) {
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }
    return user;
  }

  const sealTotp = (userId: string, totpSecret: string) => {
    const { keyId, blob } = crypto.seal(Buffer.from(totpSecret), `totp:${userId}`);
    return `${keyId}.${blob.toString('base64')}`;
  };
  const openTotp = (userId: string, sealed: string) => {
    const dot = sealed.indexOf('.');
    return crypto
      .open(Buffer.from(sealed.slice(dot + 1), 'base64'), sealed.slice(0, dot), `totp:${userId}`)
      .toString();
  };

  async function sendResetEmail(user: UserRow) {
    if (!user.email) return {};
    const token = passwordToken(secret, user, now().getTime() + LINK_MINUTES.reset * 60_000);
    const link = `${publicWebUrl}/reset-password?token=${token}`;
    await email.send({ to: user.email, ...passwordEmail('reset', link) });
    return deps.exposeLinks ? { devLink: link } : {};
  }

  return {
    googleEnabled: () => deps.google !== null,

    async register(input: {
      fullName: string;
      email: string;
      password: string;
      role: SignupRole;
      meta: Meta;
    }): Promise<LoginResult & { devLink?: string }> {
      await limit(`auth:register:ip:${input.meta.ip}`, AUTH_LIMITS.registerPerIp, MESSAGES.tooMany);
      if (await findByEmail(input.email))
        throw Errors.validation({ email: MESSAGES.emailTaken }, MESSAGES.emailTaken);
      let user: UserRow;
      try {
        user = (await db.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            passwordHash: await hashPassword(input.password),
            role: input.role,
            ...(input.role === 'student' ? { student: { create: {} } } : {}),
          },
          select: USER_SELECT,
        })) as UserRow;
      } catch (err) {
        if (isUniqueViolation(err))
          throw Errors.validation({ email: MESSAGES.emailTaken }, MESSAGES.emailTaken);
        throw err;
      }
      // The account exists either way; a failed send is retried from «حسابي».
      const sent = deps.emailConfirmation
        ? await deps.sendVerification(user.id, input.email).catch((err: unknown) => {
            logger.warn({ err, userId: user.id }, 'confirmation email failed at sign-up');
            return {};
          })
        : {};
      return { ...(await startSession(user, 'web', input.meta, true)), ...sent };
    },

    async login(input: { email: string; password: string; meta: Meta }): Promise<LoginResult> {
      const user = await checkPassword(input.email, input.password, input.meta.ip);
      if (user.role === 'admin') throw new AppError('FORBIDDEN', MESSAGES.adminOnly);
      return startSession(user, 'web', input.meta, false);
    },

    /** Admin step 1: the password; step 2 is the app code (or, the first time, its setup). */
    async adminLogin(input: { email: string; password: string; meta: Meta }): Promise<AdminStep> {
      const user = await checkPassword(input.email, input.password, input.meta.ip);
      // A website account gets the same answer as a wrong password: the admin app reveals nothing.
      if (user.role !== 'admin' || !user.admin)
        throw new AppError('UNAUTHENTICATED', MESSAGES.badLogin);
      if (user.status !== 'active') throw new AppError('FORBIDDEN', MESSAGES.suspended);
      const challenge = randomBytes(32).toString('base64url');
      const enabled = Boolean(user.admin.totpSecretEnc && user.admin.totpEnabledAt);
      const setupSecret = enabled ? null : newTotpSecret();
      await redis.set(
        `auth:challenge:${sha(challenge)}`,
        JSON.stringify({ u: user.id, ...(setupSecret ? { s: setupSecret } : {}) }),
        'EX',
        AUTH_LIMITS.challengeSeconds,
      );
      if (!setupSecret) return { step: 'totp', challenge };
      return {
        step: 'setup',
        challenge,
        secret: setupSecret,
        uri: otpauthUri(setupSecret, user.email ?? user.id),
      };
    },

    async adminVerify(input: {
      challenge: string;
      code: string;
      meta: Meta;
    }): Promise<LoginResult> {
      await limit(`auth:login:ip:${input.meta.ip}`, AUTH_LIMITS.loginPerIp, MESSAGES.tooMany);
      const key = `auth:challenge:${sha(input.challenge)}`;
      const raw = await redis.get(key);
      if (!raw) throw new AppError('UNAUTHENTICATED', MESSAGES.challengeGone);
      const attempts = await redis.incr(`${key}:a`);
      if (attempts === 1) await redis.expire(`${key}:a`, AUTH_LIMITS.challengeSeconds);
      if (attempts > AUTH_LIMITS.challengeAttempts) {
        await redis.del(key, `${key}:a`);
        throw new AppError('UNAUTHENTICATED', MESSAGES.challengeGone);
      }
      const { u: userId, s: setupSecret } = JSON.parse(raw) as { u: string; s?: string };
      const user = (await db.user.findUnique({
        where: { id: userId },
        select: USER_SELECT,
      })) as UserRow | null;
      if (!user?.admin) throw new AppError('UNAUTHENTICATED', MESSAGES.challengeGone);

      const totpSecret =
        setupSecret ??
        (user.admin.totpSecretEnc ? openTotp(user.id, user.admin.totpSecretEnc) : null);
      if (!totpSecret) throw new AppError('UNAUTHENTICATED', MESSAGES.challengeGone);
      // Per admin across every challenge: a new password sign-in does not buy fresh guesses.
      const totpFailKey = `auth:totp:fail:${user.id}`;
      if (Number((await redis.get(totpFailKey)) ?? 0) >= AUTH_LIMITS.totpFailuresPerAdmin.limit) {
        const ttl = await redis.ttl(totpFailKey);
        throw Errors.rateLimited(MESSAGES.locked, ttl > 0 ? ttl : 60);
      }
      const lastKey = `auth:totp:last:${user.id}`;
      const last = await redis.get(lastKey);
      const step = matchTotp(totpSecret, input.code, now().getTime(), last ? Number(last) : null);
      if (step === null) {
        await hitWindow(
          redis,
          totpFailKey,
          AUTH_LIMITS.totpFailuresPerAdmin.limit,
          AUTH_LIMITS.totpFailuresPerAdmin.windowSeconds,
        );
        throw Errors.validation({ code: MESSAGES.badCode }, MESSAGES.badCode);
      }
      await redis.del(totpFailKey);
      // Single use: of two parallel correct answers only the one that deletes the challenge goes on.
      if ((await redis.del(key)) !== 1)
        throw new AppError('UNAUTHENTICATED', MESSAGES.challengeGone);
      await redis.set(lastKey, String(step), 'EX', 120);

      if (setupSecret) {
        await db.admin.update({
          where: { userId: user.id },
          data: { totpSecretEnc: sealTotp(user.id, setupSecret), totpEnabledAt: now() },
        });
        await db.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: 'admin',
            action: 'auth.totp_enabled',
            entityType: 'user',
            entityId: user.id,
            ip: inetOrNull(input.meta.ip),
            requestId: input.meta.requestId,
          },
        });
      }
      return startSession(user, 'admin', input.meta, false);
    },

    /** Where to send the browser, and the state cookie to set first. */
    googleStart(role: SignupRole): { url: string; cookie: string } {
      if (!deps.google) throw new AppError('NOT_FOUND', MESSAGES.googleOff);
      const state = newGoogleState(role, now().getTime());
      return {
        url: deps.google.client.authorizeUrl({
          state: state.state,
          nonce: state.nonce,
          codeChallenge: codeChallenge(state.verifier),
          redirectUri: googleRedirect,
        }),
        cookie: sealState(secret, state),
      };
    },

    /**
     * Back from Google. Throws GoogleAuthError for anything the person should simply retry; the
     * route turns every failure into a redirect to /login with a reason.
     */
    async googleCallback(input: {
      code: string;
      state: string;
      cookie: string | undefined;
      meta: Meta;
    }): Promise<LoginResult> {
      if (!deps.google) throw new GoogleAuthError('disabled');
      const saved = openState(secret, input.cookie, now().getTime());
      if (!saved || saved.state !== input.state) throw new GoogleAuthError('state');
      const claims = await deps.google.client.exchange({
        code: input.code,
        codeVerifier: saved.verifier,
        redirectUri: googleRedirect,
      });
      const id = checkIdToken(claims, {
        clientId: deps.google.clientId,
        nonce: saved.nonce,
        nowMs: now().getTime(),
      });

      let user = (await db.user.findUnique({
        where: { googleSub: id.sub },
        select: USER_SELECT,
      })) as UserRow | null;
      let isNew = false;
      if (!user) {
        const existing = await findByEmail(id.email);
        if (existing) {
          if (existing.role === 'admin') throw new AppError('FORBIDDEN', MESSAGES.adminOnly);
          // Already tied to another Google account: never re-point it silently.
          if (existing.googleSub) throw new GoogleAuthError('linked to another Google account');
          const unconfirmed = existing.emailVerifiedAt === null;
          user = (await db.user.update({
            where: { id: existing.id },
            data: {
              googleSub: id.sub,
              ...(unconfirmed ? { emailVerifiedAt: now(), passwordHash: null } : {}),
              ...(existing.fullName ? {} : { fullName: id.name }),
            },
            select: USER_SELECT,
          })) as UserRow;
          if (unconfirmed) await sessions.revokeAll(existing.id);
        } else {
          try {
            user = (await db.user.create({
              data: {
                email: id.email,
                emailVerifiedAt: now(),
                googleSub: id.sub,
                fullName: id.name,
                role: saved.role,
                ...(saved.role === 'student' ? { student: { create: {} } } : {}),
              },
              select: USER_SELECT,
            })) as UserRow;
            isNew = true;
          } catch (err) {
            // Two callbacks for the same new person at once: the other one made the account.
            if (isUniqueViolation(err)) throw new GoogleAuthError('race');
            throw err;
          }
        }
      }
      if (user.role === 'admin') throw new AppError('FORBIDDEN', MESSAGES.adminOnly);
      return startSession(user, 'web', input.meta, isNew);
    },

    /** Always the same answer, registered or not; the email goes out only to real accounts. */
    async forgotPassword(address: string, ip: string): Promise<{ devLink?: string }> {
      await limit(`auth:forgot:ip:${ip}`, AUTH_LIMITS.forgotPerIp, MESSAGES.tooMany);
      const perEmail = await hitWindow(
        redis,
        `auth:forgot:email:${sha(address)}`,
        AUTH_LIMITS.forgotPerEmail.limit,
        AUTH_LIMITS.forgotPerEmail.windowSeconds,
      );
      if (!perEmail.allowed) return {};
      // No real email sender: there is nowhere safe to send a link, so nothing is made at all.
      if (!deps.emailConfirmation && !deps.exposeLinks) return {};
      const user = await findByEmail(address);
      if (!user || user.status !== 'active') return {};
      return sendResetEmail(user);
    },

    /** Sets the password from an emailed link: confirms the email and signs out every device. */
    async resetPassword(token: string, password: string): Promise<{ role: PublicUser['role'] }> {
      const claim = readPasswordToken(secret, token, now().getTime());
      const user = claim
        ? ((await db.user.findUnique({
            where: { id: claim.userId },
            select: USER_SELECT,
          })) as UserRow | null)
        : null;
      if (!claim || !user || user.status !== 'active' || fingerprint(user) !== claim.fingerprint)
        throw new AppError('CONFLICT', MESSAGES.badLink);
      await db.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(password),
          ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: now() }),
        },
      });
      // A new password unlocks the account everywhere.
      const failKeys = await redis.keys(`auth:login:fail:${sha(user.email ?? '')}*`);
      if (failKeys.length) await redis.del(...failKeys);
      await sessions.revokeAll(user.id);
      return { role: user.role };
    },

    /** Signed in: change (or, for Google-only accounts, add) the password; other devices sign out. */
    async changePassword(input: {
      userId: string;
      sessionId: string;
      current: string | undefined;
      password: string;
    }): Promise<void> {
      const user = (await db.user.findUnique({
        where: { id: input.userId },
        select: USER_SELECT,
      })) as UserRow | null;
      if (!user) throw Errors.unauthenticated();
      if (user.passwordHash && !(await verifyPassword(input.current ?? '', user.passwordHash)))
        throw Errors.validation({ current: MESSAGES.wrongPassword }, MESSAGES.wrongPassword);
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
      await sessions.revokeOthers(user.id, input.sessionId);
    },

    async me(userId: string): Promise<PublicUser> {
      const user = (await db.user.findUnique({
        where: { id: userId },
        select: USER_SELECT,
      })) as UserRow | null;
      if (!user || user.status !== 'active') throw Errors.unauthenticated();
      return toPublic(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
