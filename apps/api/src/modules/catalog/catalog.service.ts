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
import { logoUrl, type LogoStore } from '../media/index.js';
import { createCatalogManagement } from './catalog.manage.js';
import { defined, type Actor, type Audit, type Patch } from './catalog.shared.js';
import {
  indexEntry,
  searchIndex,
  type IndexedFaculty,
  type SearchParams,
} from './catalog.search.js';

/** How long the in-memory search index may be stale (admin edits on this instance refresh it). */
const INDEX_TTL_MS = 60_000;

/** Shown with every faculty page so students know how fresh each fact is. */
export const CATALOG_SOURCES = {
  accreditation: {
    name: 'الهيئة القومية لضمان جودة التعليم والاعتماد',
    latestDecision: '2026-05-20',
  },
  cutoffs: {
    name: 'إعلان وزير التعليم العالي لتنسيق 2026 — المرحلة الأولى',
    date: '2026-08-10',
  },
};

export type { Actor } from './catalog.shared.js';

const MESSAGES = {
  kindNotFound: 'الكلية دي مش موجودة.',
  universityNotFound: 'الجامعة دي مش موجودة.',
  facultyNotFound: 'الكلية دي مش موجودة في الجامعة دي.',
  departmentNotFound: 'القسم ده مش موجود.',
  insightNotFound: 'التجربة دي مش موجودة.',
  departmentExists: 'القسم ده موجود بالفعل في الكلية دي.',
};

/** Arabic names have no ASCII slug; a short stable suffix keeps department slugs unique. */
const departmentSlug = () =>
  `d-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createCatalogService({ db, logos }: { db: Db; logos: LogoStore }) {
  const audit: Audit = (
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

  // ---------- search index ----------
  let index: { at: number; rows: Promise<IndexedFaculty[]> } | null = null;
  const invalidate = () => {
    index = null;
  };
  async function buildIndex(): Promise<IndexedFaculty[]> {
    const rows = await db.faculty.findMany({
      where: { isActive: true, university: { isActive: true }, kind: { isActive: true } },
      select: {
        id: true,
        nameAr: true,
        city: true,
        governorate: true,
        logoKey: true,
        accreditationStatus: true,
        accreditationExpiresAt: true,
        university: {
          select: {
            slug: true,
            nameAr: true,
            nameEn: true,
            type: true,
            governorate: true,
            logoKey: true,
            sortOrder: true,
          },
        },
        kind: {
          select: {
            slug: true,
            nameAr: true,
            fullNameAr: true,
            icon: true,
            category: true,
            sortOrder: true,
          },
        },
        departments: { where: { isActive: true }, select: { nameAr: true } },
        cutoffs: {
          orderBy: [{ year: 'desc' }, { phase: 'asc' }, { minScore: 'desc' }],
          take: 1,
          select: { year: true, track: true, minScore: true, maxScore: true },
        },
        _count: { select: { mentors: { where: { isListed: true } } } },
      },
    });
    return rows.map((f) => {
      const c = f.cutoffs[0];
      return indexEntry({
        id: f.id,
        name: f.nameAr,
        logo: logoUrl(f.logoKey ?? f.university.logoKey),
        city: f.city,
        governorate: f.governorate ?? f.university.governorate,
        university: {
          slug: f.university.slug,
          name: f.university.nameAr,
          type: f.university.type,
          sortOrder: f.university.sortOrder,
        },
        universityNameEn: f.university.nameEn,
        kind: {
          slug: f.kind.slug,
          name: f.kind.nameAr,
          icon: f.kind.icon,
          category: f.kind.category,
          sortOrder: f.kind.sortOrder,
        },
        kindFullName: f.kind.fullNameAr,
        accreditation: {
          status: f.accreditationStatus,
          expiresAt: f.accreditationExpiresAt?.toISOString().slice(0, 10) ?? null,
        },
        cutoff: c
          ? { year: c.year, track: c.track, minScore: Number(c.minScore), maxScore: c.maxScore }
          : null,
        mentorCount: f._count.mentors,
        departments: f.departments.map((d) => d.nameAr),
      });
    });
  }
  function currentIndex() {
    if (!index || Date.now() - index.at > INDEX_TTL_MS) {
      const rows = buildIndex();
      index = { at: Date.now(), rows };
      // A failed build must not stay cached.
      rows.catch(() => {
        if (index?.rows === rows) index = null;
      });
    }
    return index.rows;
  }

  const manage = createCatalogManagement({ db, logos, audit, invalidate });

  return {
    ...manage,

    async search(params: SearchParams) {
      return searchIndex(await currentIndex(), params);
    },

    /** One faculty at one university: everything its own page shows. */
    async faculty(id: string) {
      const f = await db.faculty.findFirst({
        where: { id, isActive: true, university: { isActive: true }, kind: { isActive: true } },
        select: {
          id: true,
          nameAr: true,
          city: true,
          governorate: true,
          website: true,
          about: true,
          logoKey: true,
          sourceUrl: true,
          verifiedAt: true,
          accreditationStatus: true,
          accreditedAt: true,
          accreditationExpiresAt: true,
          accreditedPrograms: true,
          university: {
            select: {
              slug: true,
              nameAr: true,
              type: true,
              governorate: true,
              website: true,
              logoKey: true,
            },
          },
          kind: {
            select: {
              slug: true,
              nameAr: true,
              fullNameAr: true,
              icon: true,
              category: true,
              studyYears: true,
              summary: true,
              about: true,
            },
          },
          departments: {
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: {
              nameAr: true,
              sourceUrl: true,
              _count: { select: { mentors: { where: { isListed: true } } } },
            },
          },
          cutoffs: {
            orderBy: [{ year: 'desc' }, { phase: 'asc' }],
            select: { year: true, phase: true, track: true, minScore: true, maxScore: true },
          },
          _count: { select: { mentors: { where: { isListed: true } } } },
        },
      });
      if (!f) return null;
      return {
        id: f.id,
        name: f.nameAr,
        logo: logoUrl(f.logoKey ?? f.university.logoKey),
        city: f.city,
        governorate: f.governorate ?? f.university.governorate,
        website: f.website ?? f.university.website,
        about: f.about,
        university: {
          slug: f.university.slug,
          name: f.university.nameAr,
          type: f.university.type,
          logo: logoUrl(f.university.logoKey),
        },
        kind: {
          slug: f.kind.slug,
          name: f.kind.nameAr,
          fullName: f.kind.fullNameAr,
          icon: f.kind.icon,
          category: f.kind.category,
          studyYears: f.kind.studyYears,
          summary: f.kind.summary,
          about: f.kind.about,
        },
        accreditation: {
          status: f.accreditationStatus,
          accreditedAt: f.accreditedAt?.toISOString().slice(0, 10) ?? null,
          expiresAt: f.accreditationExpiresAt?.toISOString().slice(0, 10) ?? null,
          programmes:
            (f.accreditedPrograms as
              { name: string; status: string; expiresAt: string }[] | null) ?? [],
        },
        cutoffs: f.cutoffs.map((c) => ({
          year: c.year,
          phase: c.phase,
          track: c.track,
          minScore: Number(c.minScore),
          maxScore: c.maxScore,
        })),
        departments: f.departments.map((d) => ({ name: d.nameAr, mentorCount: d._count.mentors })),
        departmentsSource: f.departments.find((d) => d.sourceUrl)?.sourceUrl ?? null,
        mentorCount: f._count.mentors,
        sourceUrl: f.sourceUrl,
        verifiedAt: f.verifiedAt?.toISOString().slice(0, 10) ?? null,
        sources: CATALOG_SOURCES,
      };
    },

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
              id: true,
              nameAr: true,
              city: true,
              accreditationStatus: true,
              accreditationExpiresAt: true,
              accreditedPrograms: true,
              governorate: true,
              logoKey: true,
              university: {
                select: { slug: true, nameAr: true, type: true, governorate: true, logoKey: true },
              },
              departments: {
                where: { isActive: true },
                orderBy: { id: 'asc' },
                select: {
                  nameAr: true,
                  sourceUrl: true,
                  _count: { select: { mentors: { where: { isListed: true } } } },
                },
              },
              cutoffs: {
                orderBy: [{ year: 'desc' }, { phase: 'asc' }],
                select: { year: true, phase: true, track: true, minScore: true, maxScore: true },
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
        /** Every faculty of this kind, with its NAQAAE accreditation and tansik cutoffs. */
        faculties: k.faculties.map((f) => ({
          id: f.id,
          name: f.nameAr,
          city: f.city,
          logo: logoUrl(f.logoKey ?? f.university.logoKey),
          university: {
            slug: f.university.slug,
            name: f.university.nameAr,
            type: f.university.type,
            governorate: f.governorate ?? f.university.governorate,
          },
          accreditation: {
            status: f.accreditationStatus,
            expiresAt: f.accreditationExpiresAt?.toISOString().slice(0, 10) ?? null,
            programmes:
              (f.accreditedPrograms as
                { name: string; status: string; expiresAt: string }[] | null) ?? [],
          },
          cutoffs: f.cutoffs.map((c) => ({
            year: c.year,
            phase: c.phase,
            track: c.track,
            minScore: Number(c.minScore),
            maxScore: c.maxScore,
          })),
          /** This faculty's own departments, with where the list came from. */
          departments: f.departments.map((d) => ({
            name: d.nameAr,
            mentorCount: d._count.mentors,
          })),
          departmentsSource: f.departments.find((d) => d.sourceUrl)?.sourceUrl ?? null,
          mentorCount: f._count.mentors,
        })),
        sources: CATALOG_SOURCES,
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
        await tx.facultyKind.update({
          where: { id },
          data: { ...patch, adminEditedAt: new Date() },
        });
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
      invalidate();
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
      invalidate();
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
      invalidate();
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
