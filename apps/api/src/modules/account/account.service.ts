/**
 * The signed-in person's own account on the website: profile (name for everyone; track, school
 * year, governorate and faculty interests for students) and the devices they are signed in on.
 */
import { MAX_STUDENT_INTERESTS, type StudentTrack } from '@sabeq/types';
import { Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import type { SessionService } from '../auth/session.service.js';

export interface StudentProfile {
  track: StudentTrack | null;
  schoolYear: number | null;
  governorate: string | null;
  /** Faculty-kind slugs (`eng`, `med` …). */
  interests: string[];
}

export interface Profile {
  fullName: string | null;
  phone: string;
  role: 'student' | 'mentor' | 'admin';
  student: StudentProfile | null;
}

export interface ProfileUpdate {
  fullName?: string | undefined;
  track?: StudentTrack | null | undefined;
  schoolYear?: number | null | undefined;
  governorate?: string | null | undefined;
  interests?: string[] | undefined;
}

export interface Device {
  id: string;
  label: string;
  current: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

const STUDENT_FIELDS = ['track', 'schoolYear', 'governorate', 'interests'] as const;

/** "Mozilla/5.0 (Windows NT 10.0…) Chrome/…" → "Chrome · Windows". Good enough to recognise a device. */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'جهاز غير معروف';
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'متصفح';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iPhone'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

export function createAccountService({ db, sessions }: { db: Db; sessions: SessionService }) {
  async function getProfile(userId: string): Promise<Profile> {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        phone: true,
        role: true,
        student: {
          select: {
            track: true,
            schoolYear: true,
            governorate: true,
            interests: { select: { kind: { select: { slug: true } } } },
          },
        },
      },
    });
    if (!u) throw Errors.unauthenticated();
    return {
      fullName: u.fullName,
      phone: u.phone,
      role: u.role,
      student: u.student
        ? {
            track: u.student.track,
            schoolYear: u.student.schoolYear,
            governorate: u.student.governorate,
            interests: u.student.interests.map((i) => i.kind.slug).sort(),
          }
        : null,
    };
  }

  return {
    getProfile,

    async updateProfile(userId: string, role: string, input: ProfileUpdate): Promise<Profile> {
      if (role !== 'student') {
        const fields: Record<string, string> = {};
        for (const f of STUDENT_FIELDS) {
          if (input[f] !== undefined) fields[f] = 'البيانات دي للطلاب بس.';
        }
        if (Object.keys(fields).length) throw Errors.validation(fields);
      }

      let kindIds: string[] | undefined;
      if (input.interests !== undefined) {
        const slugs = [...new Set(input.interests)];
        if (slugs.length > MAX_STUDENT_INTERESTS) {
          throw Errors.validation({ interests: `اختار ${MAX_STUDENT_INTERESTS} كليات بالكتير.` });
        }
        const kinds = await db.facultyKind.findMany({
          where: { slug: { in: slugs } },
          select: { id: true },
        });
        if (kinds.length !== slugs.length) {
          throw Errors.validation({ interests: 'في كلية مش موجودة. حدّث الصفحة وجرّب تاني.' });
        }
        kindIds = kinds.map((k) => k.id);
      }

      await db.$transaction(async (tx) => {
        if (input.fullName !== undefined) {
          await tx.user.update({ where: { id: userId }, data: { fullName: input.fullName } });
        }
        if (role !== 'student') return;
        const data = {
          ...(input.track !== undefined ? { track: input.track } : {}),
          ...(input.schoolYear !== undefined ? { schoolYear: input.schoolYear } : {}),
          ...(input.governorate !== undefined ? { governorate: input.governorate } : {}),
        };
        // Accounts created before the student row existed get one now.
        await tx.student.upsert({ where: { userId }, create: { userId, ...data }, update: data });
        if (kindIds) {
          await tx.studentInterest.deleteMany({ where: { studentId: userId } });
          if (kindIds.length) {
            await tx.studentInterest.createMany({
              data: kindIds.map((kindId) => ({ studentId: userId, kindId })),
            });
          }
        }
      });
      return getProfile(userId);
    },

    async listDevices(userId: string, currentSessionId: string): Promise<Device[]> {
      const rows = await db.authSession.findMany({
        where: { userId, app: 'web', revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true },
        take: 20,
      });
      return rows.map((r) => ({
        id: r.id,
        label: deviceLabel(r.userAgent),
        current: r.id === currentSessionId,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
      }));
    },

    async revokeDevice(userId: string, sessionId: string): Promise<void> {
      // Only the owner's own live sessions; anything else looks like "not found".
      const row = await db.authSession.findFirst({
        where: { id: sessionId, userId, revokedAt: null },
        select: { id: true },
      });
      if (!row) throw Errors.notFound('الجهاز ده مش موجود أو خرج بالفعل.');
      await sessions.revoke(row.id);
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
