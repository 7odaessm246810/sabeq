/**
 * Universities, faculty kinds ("الهندسة" across all universities), faculties (a kind at a
 * university), departments and published insights — Phase 11.
 *
 * Public reads power /explore and /faculty/:slug. Admin writes (super_admin, support) keep the
 * catalog current; every write is audited. Mentor counts only include listed mentors.
 */
import { AppError, Errors } from '../../core/errors.js';
import { inetOrNull } from '../../core/http.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';
import type { AuthContext } from '../auth/session.service.js';

export interface Actor {
  auth: AuthContext;
  ip: string;
  requestId: string;
}

const MESSAGES = {
  kindNotFound: 'الكلية دي مش موجودة.',
  universityNotFound: 'الجامعة دي مش موجودة.',
  facultyNotFound: 'الكلية دي مش موجودة في الجامعة دي.',
  departmentNotFound: 'القسم ده مش موجود.',
  insightNotFound: 'التجربة دي مش موجودة.',
  departmentExists: 'القسم ده موجود بالفعل في الكلية دي.',
};

/** PATCH bodies: omitted fields arrive as undefined and must not reach the update. */
type Patch<T> = { [K in keyof T]?: T[K] | undefined };
const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };

/** Arabic names have no ASCII slug; a short stable suffix keeps department slugs unique. */
const departmentSlug = () =>
  `d-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createCatalogService({ db }: { db: Db }) {
  const audit = (
    tx: Prisma.TransactionClient | Db,
    actor: Actor,
    action: string,
    entity: { type: string; id: string },
    change: { before?: object; after?: object },
  ) =>
    tx.auditLog.create({
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

  /** Listed mentors per faculty kind, in one query. */
  async function mentorCountsByKind(): Promise<Map<string, number>> {
    const rows = await db.mentor.groupBy({
      by: ['facultyId'],
      where: { isListed: true },
      _count: { _all: true },
    });
    if (!rows.length) return new Map();
    const faculties = await db.faculty.findMany({
      where: { id: { in: rows.map((r) => r.facultyId) } },
      select: { id: true, kindId: true },
    });
    const kindOf = new Map(faculties.map((f) => [f.id, f.kindId]));
    const counts = new Map<string, number>();
    for (const r of rows) {
      const kindId = kindOf.get(r.facultyId);
      if (kindId) counts.set(kindId, (counts.get(kindId) ?? 0) + r._count._all);
    }
    return counts;
  }

  return {
    async universities() {
      const rows = await db.university.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        select: {
          slug: true,
          nameAr: true,
          faculties: {
            where: { isActive: true, kind: { isActive: true } },
            orderBy: { kind: { sortOrder: 'asc' } },
            select: { id: true, nameAr: true, kind: { select: { slug: true, fullNameAr: true } } },
          },
        },
      });
      return rows.map((u) => ({
        slug: u.slug,
        name: u.nameAr,
        faculties: u.faculties.map((f) => ({
          id: f.id,
          kind: f.kind.slug,
          name: f.nameAr ?? f.kind.fullNameAr,
        })),
      }));
    },

    /** Everything /explore needs in one call. */
    async kinds() {
      const [kinds, counts] = await Promise.all([
        db.facultyKind.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
          select: {
            id: true,
            slug: true,
            nameAr: true,
            fullNameAr: true,
            icon: true,
            category: true,
            studyYears: true,
            summary: true,
            faculties: {
              where: { isActive: true, university: { isActive: true } },
              select: {
                university: { select: { slug: true } },
                departments: { where: { isActive: true }, select: { nameAr: true } },
              },
            },
          },
        }),
        mentorCountsByKind(),
      ]);
      return kinds.map((k) => ({
        slug: k.slug,
        name: k.nameAr,
        fullName: k.fullNameAr,
        icon: k.icon,
        category: k.category,
        studyYears: k.studyYears,
        summary: k.summary,
        mentorCount: counts.get(k.id) ?? 0,
        universities: k.faculties.map((f) => f.university.slug),
        departments: [...new Set(k.faculties.flatMap((f) => f.departments.map((d) => d.nameAr)))],
      }));
    },

    /** A faculty page: the kind, its departments (merged across universities) and insights. */
    async kind(slug: string) {
      const k = await db.facultyKind.findFirst({
        where: { slug, isActive: true },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          fullNameAr: true,
          icon: true,
          category: true,
          studyYears: true,
          summary: true,
          about: true,
          genericInfo: true,
          insights: {
            where: { isPublished: true },
            orderBy: { sortOrder: 'asc' },
            select: { quote: true },
          },
          faculties: {
            where: { isActive: true, university: { isActive: true } },
            orderBy: { university: { sortOrder: 'asc' } },
            select: {
              university: { select: { slug: true, nameAr: true } },
              departments: {
                where: { isActive: true },
                select: {
                  nameAr: true,
                  _count: { select: { mentors: { where: { isListed: true } } } },
                },
              },
              _count: { select: { mentors: { where: { isListed: true } } } },
            },
          },
        },
      });
      if (!k) return null;

      // The same department exists at several universities: show it once, with all its mentors.
      const departments = new Map<string, number>();
      for (const f of k.faculties)
        for (const d of f.departments)
          departments.set(d.nameAr, (departments.get(d.nameAr) ?? 0) + d._count.mentors);

      return {
        slug: k.slug,
        name: k.nameAr,
        fullName: k.fullNameAr,
        icon: k.icon,
        category: k.category,
        studyYears: k.studyYears,
        summary: k.summary,
        about: k.about,
        genericInfo: k.genericInfo,
        insights: k.insights.map((i) => i.quote),
        mentorCount: k.faculties.reduce((n, f) => n + f._count.mentors, 0),
        universities: k.faculties.map((f) => ({
          slug: f.university.slug,
          name: f.university.nameAr,
        })),
        departments: [...departments].map(([name, mentorCount]) => ({ name, mentorCount })),
      };
    },

    // ---------- admin ----------

    async adminKinds() {
      return db.facultyKind.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        select: {
          id: true,
          slug: true,
          nameAr: true,
          fullNameAr: true,
          isActive: true,
          _count: { select: { faculties: true, insights: true } },
        },
      });
    },

    async adminKind(id: string) {
      const k = await db.facultyKind.findUnique({
        where: { id },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          fullNameAr: true,
          icon: true,
          category: true,
          studyYears: true,
          summary: true,
          about: true,
          genericInfo: true,
          isActive: true,
          insights: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, quote: true, isPublished: true, sortOrder: true },
          },
          faculties: {
            orderBy: { university: { sortOrder: 'asc' } },
            select: {
              id: true,
              isActive: true,
              university: { select: { nameAr: true, isActive: true } },
              departments: {
                orderBy: { nameAr: 'asc' },
                select: { id: true, nameAr: true, isActive: true },
              },
            },
          },
        },
      });
      if (!k) throw Errors.notFound(MESSAGES.kindNotFound);
      return k;
    },

    async updateKind(
      id: string,
      raw: Patch<{
        nameAr: string;
        fullNameAr: string;
        summary: string;
        about: string;
        genericInfo: string;
        studyYears: number;
        isActive: boolean;
      }>,
      actor: Actor,
    ) {
      const patch = defined(raw);
      const before = await db.facultyKind.findUnique({ where: { id } });
      if (!before) throw Errors.notFound(MESSAGES.kindNotFound);
      await db.$transaction(async (tx) => {
        await tx.facultyKind.update({ where: { id }, data: patch });
        const changed = Object.keys(patch) as (keyof typeof patch)[];
        await audit(
          tx,
          actor,
          'catalog.kind.update',
          { type: 'faculty_kind', id },
          {
            before: Object.fromEntries(changed.map((f) => [f, before[f]])),
            after: patch,
          },
        );
      });
    },

    async addInsight(kindId: string, quote: string, actor: Actor) {
      const kind = await db.facultyKind.findUnique({ where: { id: kindId }, select: { id: true } });
      if (!kind) throw Errors.notFound(MESSAGES.kindNotFound);
      const last = await db.facultyInsight.aggregate({
        where: { kindId },
        _max: { sortOrder: true },
      });
      await db.$transaction(async (tx) => {
        const created = await tx.facultyInsight.create({
          data: { kindId, quote, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        });
        await audit(
          tx,
          actor,
          'catalog.insight.create',
          { type: 'faculty_insight', id: created.id },
          {
            after: { kindId, quote },
          },
        );
      });
    },

    async updateInsight(
      id: string,
      raw: Patch<{ quote: string; isPublished: boolean }>,
      actor: Actor,
    ) {
      const patch = defined(raw);
      const before = await db.facultyInsight.findUnique({ where: { id } });
      if (!before) throw Errors.notFound(MESSAGES.insightNotFound);
      await db.$transaction(async (tx) => {
        await tx.facultyInsight.update({ where: { id }, data: patch });
        await audit(
          tx,
          actor,
          'catalog.insight.update',
          { type: 'faculty_insight', id },
          {
            before: { quote: before.quote, isPublished: before.isPublished },
            after: patch,
          },
        );
      });
    },

    async deleteInsight(id: string, actor: Actor) {
      const before = await db.facultyInsight.findUnique({ where: { id } });
      if (!before) throw Errors.notFound(MESSAGES.insightNotFound);
      await db.$transaction(async (tx) => {
        await tx.facultyInsight.delete({ where: { id } });
        await audit(
          tx,
          actor,
          'catalog.insight.delete',
          { type: 'faculty_insight', id },
          {
            before: { kindId: before.kindId, quote: before.quote },
          },
        );
      });
    },

    async addDepartment(facultyId: string, nameAr: string, actor: Actor) {
      const faculty = await db.faculty.findUnique({
        where: { id: facultyId },
        select: { id: true, departments: { select: { nameAr: true } } },
      });
      if (!faculty) throw Errors.notFound(MESSAGES.facultyNotFound);
      if (faculty.departments.some((d) => d.nameAr === nameAr))
        throw new AppError('CONFLICT', MESSAGES.departmentExists);
      await db.$transaction(async (tx) => {
        const created = await tx.department.create({
          data: { facultyId, nameAr, slug: departmentSlug() },
        });
        await audit(
          tx,
          actor,
          'catalog.department.create',
          { type: 'department', id: created.id },
          {
            after: { facultyId, nameAr },
          },
        );
      });
    },

    async updateDepartment(
      id: string,
      raw: Patch<{ nameAr: string; isActive: boolean }>,
      actor: Actor,
    ) {
      const patch = defined(raw);
      const before = await db.department.findUnique({ where: { id } });
      if (!before) throw Errors.notFound(MESSAGES.departmentNotFound);
      if (patch.nameAr && patch.nameAr !== before.nameAr) {
        const clash = await db.department.findFirst({
          where: { facultyId: before.facultyId, nameAr: patch.nameAr, id: { not: id } },
          select: { id: true },
        });
        if (clash) throw new AppError('CONFLICT', MESSAGES.departmentExists);
      }
      await db.$transaction(async (tx) => {
        await tx.department.update({ where: { id }, data: patch });
        await audit(
          tx,
          actor,
          'catalog.department.update',
          { type: 'department', id },
          {
            before: { nameAr: before.nameAr, isActive: before.isActive },
            after: patch,
          },
        );
      });
    },

    async adminUniversities() {
      return db.university.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        select: {
          id: true,
          slug: true,
          nameAr: true,
          governorate: true,
          type: true,
          isActive: true,
          _count: { select: { faculties: true } },
        },
      });
    },

    async updateUniversity(
      id: string,
      raw: Patch<{ nameAr: string; isActive: boolean }>,
      actor: Actor,
    ) {
      const patch = defined(raw);
      const before = await db.university.findUnique({ where: { id } });
      if (!before) throw Errors.notFound(MESSAGES.universityNotFound);
      await db.$transaction(async (tx) => {
        await tx.university.update({ where: { id }, data: patch });
        await audit(
          tx,
          actor,
          'catalog.university.update',
          { type: 'university', id },
          {
            before: { nameAr: before.nameAr, isActive: before.isActive },
            after: patch,
          },
        );
      });
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
