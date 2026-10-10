/**
 * Mentor profiles (Phase 12).
 *
 * - Public: one listed mentor's profile by slug, and listed mentors by field / faculty / university
 *   (cards on faculty pages, /mentors, the landing page). Only `isListed` mentors with an active
 *   account are ever shown — listing is set by an approved application (Phase 10).
 * - The mentor: reads and edits what they own (photo, bio, city, topics, base price, whether they take
 *   bookings, department within their faculty). Verified facts — faculty, major, graduation year,
 *   mentor kind — change only through support, because they were checked against documents.
 * - Students: save mentors to come back to them (the design's «احفظ»).
 */
import { createHash } from 'node:crypto';
import {
  MENTOR_KIND_LABELS,
  SESSION_KINDS,
  SESSION_TYPES,
  type MentorKind,
  type SessionKind,
} from '@sabeq/types';
import { sessionPricePiasters } from '@sabeq/utils';
import { Errors } from '../../core/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';
import { avatarUrl, logoUrl, type AvatarStore } from '../media/index.js';

const MESSAGES = {
  notFound: 'المرشد ده مش موجود أو مش متاح دلوقتي.',
  noProfile: 'لسه مالكش ملف مرشد. ملفك بيتعمل لما طلب انضمامك يتقبل.',
  departmentOutside: 'القسم ده مش في كليتك.',
};

/** Only these mentors exist for the public. */
const LISTED = {
  isListed: true,
  user: { status: 'active', deletedAt: null },
} satisfies Prisma.MentorWhereInput;

/** The design's avatar tones (1–3), stable per mentor. */
const toneOf = (slug: string) => ((createHash('sha256').update(slug).digest()[0] ?? 0) % 3) + 1;

const CARD_SELECT = {
  slug: true,
  kind: true,
  majorLabel: true,
  graduationYear: true,
  city: true,
  basePricePiasters: true,
  acceptsBookings: true,
  ratingAvg: true,
  ratingCount: true,
  sessionsCompleted: true,
  user: { select: { fullName: true, avatarKey: true } },
  faculty: {
    select: {
      id: true,
      nameAr: true,
      logoKey: true,
      kind: { select: { slug: true, nameAr: true } },
      university: { select: { slug: true, nameAr: true, logoKey: true } },
    },
  },
  topics: { orderBy: { sortOrder: 'asc' }, select: { label: true } },
} satisfies Prisma.MentorSelect;

type CardRow = Prisma.MentorGetPayload<{ select: typeof CARD_SELECT }>;

function card(m: CardRow) {
  return {
    slug: m.slug,
    name: m.user.fullName ?? 'مرشد سابق',
    photo: avatarUrl(m.user.avatarKey),
    tone: toneOf(m.slug),
    kind: m.kind,
    kindLabel: MENTOR_KIND_LABELS[m.kind as MentorKind],
    major: m.majorLabel,
    graduationYear: m.graduationYear,
    city: m.city,
    field: { slug: m.faculty.kind.slug, name: m.faculty.kind.nameAr },
    faculty: {
      id: m.faculty.id,
      name: m.faculty.nameAr,
      logo: logoUrl(m.faculty.logoKey ?? m.faculty.university.logoKey),
    },
    university: { slug: m.faculty.university.slug, name: m.faculty.university.nameAr },
    /** Null until the first review: no invented ratings. */
    rating: m.ratingCount ? Number(m.ratingAvg) : null,
    ratingCount: m.ratingCount,
    sessions: m.sessionsCompleted,
    priceEgp: m.basePricePiasters ? m.basePricePiasters / 100 : null,
    acceptsBookings: m.acceptsBookings,
    topics: m.topics.map((t) => t.label),
  };
}

export type MentorCard = ReturnType<typeof card>;

export interface ListParams {
  field?: string | undefined;
  faculty?: string | undefined;
  university?: string | undefined;
  sort: 'recommended' | 'rating' | 'price_asc' | 'price_desc';
  page: number;
  pageSize: number;
}

export interface MentorPatch {
  bio?: string | undefined;
  city?: string | null | undefined;
  topics?: string[] | undefined;
  basePriceEgp?: number | undefined;
  acceptsBookings?: boolean | undefined;
  departmentId?: string | null | undefined;
}

function offerings(basePiasters: number | null, active: { kind: SessionKind }[]) {
  if (!basePiasters) return [];
  return SESSION_KINDS.filter((k) => active.some((o) => o.kind === k)).map((kind) => {
    const t = SESSION_TYPES[kind];
    return {
      kind,
      label: t.label,
      durationMin: t.durationMin,
      medium: t.medium,
      priceEgp: sessionPricePiasters(basePiasters, t.multiplier) / 100,
    };
  });
}

export function createMentorsService({ db, avatars }: { db: Db; avatars: AvatarStore }) {
  async function own(userId: string) {
    const m = await db.mentor.findUnique({
      where: { userId },
      select: {
        slug: true,
        kind: true,
        majorLabel: true,
        graduationYear: true,
        bio: true,
        city: true,
        basePricePiasters: true,
        acceptsBookings: true,
        isListed: true,
        departmentId: true,
        user: { select: { fullName: true, avatarKey: true } },
        topics: { orderBy: { sortOrder: 'asc' }, select: { label: true } },
        faculty: {
          select: {
            nameAr: true,
            university: { select: { nameAr: true } },
            departments: {
              where: { isActive: true },
              orderBy: { id: 'asc' },
              select: { id: true, nameAr: true },
            },
          },
        },
      },
    });
    if (!m) throw Errors.notFound(MESSAGES.noProfile);
    return {
      slug: m.slug,
      name: m.user.fullName,
      photo: avatarUrl(m.user.avatarKey),
      tone: toneOf(m.slug),
      isListed: m.isListed,
      acceptsBookings: m.acceptsBookings,
      bio: m.bio,
      city: m.city,
      topics: m.topics.map((t) => t.label),
      basePriceEgp: m.basePricePiasters ? m.basePricePiasters / 100 : null,
      departmentId: m.departmentId,
      departments: m.faculty.departments.map((d) => ({ id: d.id, name: d.nameAr })),
      /** Checked against documents at approval; only support can change them. */
      verified: {
        kind: m.kind,
        kindLabel: MENTOR_KIND_LABELS[m.kind as MentorKind],
        faculty: m.faculty.nameAr,
        university: m.faculty.university.nameAr,
        major: m.majorLabel,
        graduationYear: m.graduationYear,
      },
    };
  }

  return {
    async profile(slug: string) {
      const m = await db.mentor.findFirst({
        where: { slug, ...LISTED },
        select: {
          ...CARD_SELECT,
          userId: true,
          bio: true,
          department: { select: { nameAr: true } },
          offerings: { where: { isActive: true }, select: { kind: true } },
          reviews: {
            where: { status: 'published' },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              rating: true,
              text: true,
              topic: true,
              createdAt: true,
              student: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
      });
      if (!m) return null;
      return {
        ...card(m),
        bio: m.bio,
        department: m.department?.nameAr ?? null,
        offerings: offerings(m.basePricePiasters, m.offerings),
        reviews: m.reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          topic: r.topic,
          date: r.createdAt.toISOString().slice(0, 10),
          // First name only: reviewers are students.
          name: r.student.user.fullName?.split(' ')[0] ?? 'طالب',
        })),
      };
    },

    async list(p: ListParams) {
      const where: Prisma.MentorWhereInput = {
        ...LISTED,
        faculty: {
          isActive: true,
          ...(p.faculty ? { id: p.faculty } : {}),
          ...(p.field ? { kind: { slug: p.field } } : {}),
          ...(p.university ? { university: { slug: p.university } } : {}),
        },
      };
      const orderBy: Prisma.MentorOrderByWithRelationInput[] =
        p.sort === 'price_asc'
          ? [{ basePricePiasters: 'asc' }]
          : p.sort === 'price_desc'
            ? [{ basePricePiasters: 'desc' }]
            : p.sort === 'rating'
              ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
              : // Recommended: open for bookings first, then experience, then newest.
                [
                  { acceptsBookings: 'desc' },
                  { sessionsCompleted: 'desc' },
                  { ratingAvg: 'desc' },
                  { listedAt: 'desc' },
                ];
      const [total, rows] = await Promise.all([
        db.mentor.count({ where }),
        db.mentor.findMany({
          where,
          orderBy: [...orderBy, { slug: 'asc' }],
          skip: (p.page - 1) * p.pageSize,
          take: p.pageSize,
          select: CARD_SELECT,
        }),
      ]);
      return { total, page: p.page, pageSize: p.pageSize, results: rows.map(card) };
    },

    // ---------- the mentor's own profile ----------

    own,

    async updateOwn(userId: string, patch: MentorPatch) {
      const current = await db.mentor.findUnique({
        where: { userId },
        select: { facultyId: true },
      });
      if (!current) throw Errors.notFound(MESSAGES.noProfile);
      if (patch.departmentId) {
        const dept = await db.department.findFirst({
          where: { id: patch.departmentId, facultyId: current.facultyId, isActive: true },
          select: { id: true },
        });
        if (!dept)
          throw Errors.validation(
            { departmentId: MESSAGES.departmentOutside },
            MESSAGES.departmentOutside,
          );
      }
      await db.$transaction(async (tx) => {
        await tx.mentor.update({
          where: { userId },
          data: {
            ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
            ...(patch.city !== undefined ? { city: patch.city } : {}),
            ...(patch.basePriceEgp !== undefined
              ? { basePricePiasters: patch.basePriceEgp * 100 }
              : {}),
            ...(patch.acceptsBookings !== undefined
              ? { acceptsBookings: patch.acceptsBookings }
              : {}),
            ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId } : {}),
          },
        });
        if (patch.topics) {
          await tx.mentorTopic.deleteMany({ where: { mentorId: userId } });
          await tx.mentorTopic.createMany({
            data: patch.topics.map((label, sortOrder) => ({ mentorId: userId, label, sortOrder })),
          });
        }
      });
      return own(userId);
    },

    async setPhoto(userId: string, body: unknown) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { avatarKey: true, mentor: { select: { userId: true } } },
      });
      if (!user?.mentor) throw Errors.notFound(MESSAGES.noProfile);
      const name = await avatars.save(body);
      await db.user.update({ where: { id: userId }, data: { avatarKey: name } });
      await avatars.remove(user.avatarKey);
      return avatarUrl(name);
    },

    async removePhoto(userId: string) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
      if (!user?.avatarKey) return;
      await db.user.update({ where: { id: userId }, data: { avatarKey: null } });
      await avatars.remove(user.avatarKey);
    },

    // ---------- students' saved mentors ----------

    async saved(studentId: string) {
      const rows = await db.savedMentor.findMany({
        where: { studentId, mentor: LISTED },
        orderBy: { createdAt: 'desc' },
        select: { mentor: { select: CARD_SELECT } },
      });
      return rows.map((r) => card(r.mentor));
    },

    async save(studentId: string, slug: string) {
      const m = await db.mentor.findFirst({ where: { slug, ...LISTED }, select: { userId: true } });
      if (!m) throw Errors.notFound(MESSAGES.notFound);
      await db.savedMentor.upsert({
        where: { studentId_mentorId: { studentId, mentorId: m.userId } },
        update: {},
        create: { studentId, mentorId: m.userId },
      });
    },

    async unsave(studentId: string, slug: string) {
      await db.savedMentor.deleteMany({ where: { studentId, mentor: { slug } } });
    },
  };
}

export type MentorsService = ReturnType<typeof createMentorsService>;
