/**
 * Admin management of universities and faculties (Phase 11c): create, edit, hide, delete, logos,
 * cutoffs. Every write is audited and refreshes the search index. Rows an admin creates or edits
 * are marked (`adminEditedAt`) so the research seed never overwrites or hides them.
 *
 * Deleting is only allowed for rows nothing depends on; anything referenced by mentors or mentor
 * applications must be hidden instead (`isActive: false`), which removes it from every public read.
 */
import { randomBytes } from 'node:crypto';
import type { AccreditationStatus, StudentTrack, UniversityType } from '@sabeq/types';
import { Errors } from '../../core/errors.js';
import type { Db } from '../../infra/db.js';
import { logoUrl, type LogoStore } from '../media/index.js';
import { defined, type Actor, type Audit, type Patch } from './catalog.shared.js';

const MESSAGES = {
  universityNotFound: 'الجامعة دي مش موجودة.',
  facultyNotFound: 'الكلية دي مش موجودة.',
  kindNotFound: 'نوع الكلية ده مش موجود.',
  cutoffNotFound: 'الحد الأدنى ده مش موجود.',
  facultyExists: 'في كلية بنفس الاسم في الجامعة دي.',
  slugTaken: 'الرابط ده مستخدم لجامعة تانية.',
  universityHasFaculties:
    'الجامعة دي فيها كليات. امسح كلياتها الأول أو اخفي الجامعة بدل ما تمسحها.',
  facultyInUse:
    'الكلية دي مرتبط بيها مرشدين أو طلبات انضمام، فمينفعش تتمسح. اخفيها بدل كده وهتختفي من الموقع.',
  expiryBeforeAccreditation: 'تاريخ انتهاء الاعتماد لازم يكون بعد تاريخ الاعتماد.',
};

export interface UniversityInput {
  slug?: string | undefined;
  nameAr: string;
  nameEn?: string | null | undefined;
  type: UniversityType;
  governorate?: string | null | undefined;
  website?: string | null | undefined;
  isActive?: boolean | undefined;
}

export interface FacultyInput {
  universityId: string;
  kindId: string;
  nameAr: string;
  city?: string | null | undefined;
  governorate?: string | null | undefined;
  website?: string | null | undefined;
  about?: string | null | undefined;
  accreditationStatus?: AccreditationStatus | undefined;
  accreditedAt?: string | null | undefined;
  accreditationExpiresAt?: string | null | undefined;
  isActive?: boolean | undefined;
}

export interface CutoffInput {
  year: number;
  phase: number;
  track: Exclude<StudentTrack, 'azhar' | 'other'>;
  minScore: number;
  maxScore: number;
  /** Where the number was announced — every catalog fact keeps its source. */
  sourceUrl: string;
}

const toDate = (d: string | null | undefined) =>
  d === undefined ? undefined : d === null ? null : new Date(`${d}T00:00:00Z`);
const isoDay = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

/** "Cairo University" → "cairo-university"; Arabic-only names get a short random slug. */
function slugFrom(nameEn: string | null | undefined) {
  const base = (nameEn ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base || `u-${randomBytes(3).toString('hex')}`;
}

export function createCatalogManagement(deps: {
  db: Db;
  logos: LogoStore;
  audit: Audit;
  invalidate: () => void;
}) {
  const { db, logos, audit, invalidate } = deps;

  async function universityOrThrow(id: string) {
    const u = await db.university.findUnique({ where: { id } });
    if (!u) throw Errors.notFound(MESSAGES.universityNotFound);
    return u;
  }
  async function facultyOrThrow(id: string) {
    const f = await db.faculty.findUnique({ where: { id } });
    if (!f) throw Errors.notFound(MESSAGES.facultyNotFound);
    return f;
  }
  async function assertKind(kindId: string) {
    const k = await db.facultyKind.findUnique({ where: { id: kindId }, select: { id: true } });
    if (!k) throw Errors.validation({ kindId: MESSAGES.kindNotFound }, MESSAGES.kindNotFound);
  }
  async function assertFacultyNameFree(universityId: string, nameAr: string, exceptId?: string) {
    const clash = await db.faculty.findFirst({
      where: { universityId, nameAr, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw Errors.conflict(MESSAGES.facultyExists);
  }
  function assertDates(accreditedAt: Date | null, expiresAt: Date | null) {
    if (accreditedAt && expiresAt && expiresAt < accreditedAt)
      throw Errors.validation(
        { accreditationExpiresAt: MESSAGES.expiryBeforeAccreditation },
        MESSAGES.expiryBeforeAccreditation,
      );
  }

  return {
    // ---------- universities ----------

    async adminUniversities() {
      const rows = await db.university.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          type: true,
          governorate: true,
          website: true,
          logoKey: true,
          isActive: true,
          adminEditedAt: true,
          _count: { select: { faculties: true } },
        },
      });
      return rows.map(({ logoKey, ...u }) => ({ ...u, logo: logoUrl(logoKey) }));
    },

    async adminUniversity(id: string) {
      const u = await db.university.findUnique({
        where: { id },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          type: true,
          governorate: true,
          website: true,
          logoKey: true,
          sourceUrl: true,
          isActive: true,
          adminEditedAt: true,
          faculties: {
            orderBy: [{ kind: { sortOrder: 'asc' } }, { nameAr: 'asc' }],
            select: {
              id: true,
              nameAr: true,
              city: true,
              governorate: true,
              logoKey: true,
              isActive: true,
              accreditationStatus: true,
              kind: { select: { id: true, nameAr: true } },
              _count: { select: { mentors: true, departments: true } },
            },
          },
        },
      });
      if (!u) throw Errors.notFound(MESSAGES.universityNotFound);
      const { logoKey, faculties, ...rest } = u;
      return {
        ...rest,
        logo: logoUrl(logoKey),
        faculties: faculties.map(({ logoKey: fLogo, ...f }) => ({ ...f, logo: logoUrl(fLogo) })),
      };
    },

    async createUniversity(input: UniversityInput, actor: Actor) {
      const slug = input.slug ?? slugFrom(input.nameEn);
      if (await db.university.findUnique({ where: { slug }, select: { id: true } }))
        throw Errors.validation({ slug: MESSAGES.slugTaken }, MESSAGES.slugTaken);
      const last = await db.university.aggregate({ _max: { sortOrder: true } });
      const created = await db.$transaction(async (tx) => {
        const u = await tx.university.create({
          data: {
            slug,
            nameAr: input.nameAr,
            nameEn: input.nameEn ?? null,
            type: input.type,
            governorate: input.governorate ?? null,
            website: input.website ?? null,
            isActive: input.isActive ?? true,
            sortOrder: (last._max.sortOrder ?? 0) + 1,
            adminEditedAt: new Date(),
          },
        });
        await audit(
          tx,
          actor,
          'catalog.university.create',
          { type: 'university', id: u.id },
          {
            after: { ...input, slug },
          },
        );
        return u;
      });
      invalidate();
      return created.id;
    },

    async updateUniversity(id: string, raw: Patch<Omit<UniversityInput, 'slug'>>, actor: Actor) {
      const patch = defined(raw);
      const before = await universityOrThrow(id);
      await db.$transaction(async (tx) => {
        await tx.university.update({
          where: { id },
          data: { ...patch, adminEditedAt: new Date() },
        });
        const changed = Object.keys(patch) as (keyof typeof patch)[];
        await audit(
          tx,
          actor,
          'catalog.university.update',
          { type: 'university', id },
          {
            before: Object.fromEntries(changed.map((k) => [k, before[k]])),
            after: patch,
          },
        );
      });
      invalidate();
    },

    async deleteUniversity(id: string, actor: Actor) {
      const u = await universityOrThrow(id);
      if (await db.faculty.count({ where: { universityId: id } }))
        throw Errors.conflict(MESSAGES.universityHasFaculties);
      await db.$transaction(async (tx) => {
        await tx.university.delete({ where: { id } });
        await audit(
          tx,
          actor,
          'catalog.university.delete',
          { type: 'university', id },
          {
            before: { slug: u.slug, nameAr: u.nameAr },
          },
        );
      });
      await logos.remove(u.logoKey);
      invalidate();
    },

    async setUniversityLogo(id: string, body: unknown, actor: Actor) {
      const u = await universityOrThrow(id);
      const name = await logos.save(body);
      await db.$transaction(async (tx) => {
        await tx.university.update({ where: { id }, data: { logoKey: name } });
        await audit(
          tx,
          actor,
          'catalog.university.logo',
          { type: 'university', id },
          {
            before: { logoKey: u.logoKey },
            after: { logoKey: name },
          },
        );
      });
      await logos.remove(u.logoKey);
      invalidate();
      return logoUrl(name);
    },

    async removeUniversityLogo(id: string, actor: Actor) {
      const u = await universityOrThrow(id);
      if (!u.logoKey) return;
      await db.$transaction(async (tx) => {
        await tx.university.update({ where: { id }, data: { logoKey: null } });
        await audit(
          tx,
          actor,
          'catalog.university.logo',
          { type: 'university', id },
          {
            before: { logoKey: u.logoKey },
            after: { logoKey: null },
          },
        );
      });
      await logos.remove(u.logoKey);
      invalidate();
    },

    // ---------- faculties ----------

    async adminFaculty(id: string) {
      const f = await db.faculty.findUnique({
        where: { id },
        select: {
          id: true,
          nameAr: true,
          city: true,
          governorate: true,
          website: true,
          about: true,
          logoKey: true,
          isActive: true,
          accreditationStatus: true,
          accreditedAt: true,
          accreditationExpiresAt: true,
          accreditedPrograms: true,
          sourceUrl: true,
          verifiedAt: true,
          adminEditedAt: true,
          university: { select: { id: true, nameAr: true, governorate: true, logoKey: true } },
          kind: { select: { id: true, slug: true, nameAr: true } },
          departments: {
            // Visible first; hidden ones (e.g. the prototype's placeholders) at the end.
            orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
            select: { id: true, nameAr: true, isActive: true, sourceUrl: true },
          },
          cutoffs: {
            orderBy: [{ year: 'desc' }, { phase: 'asc' }, { track: 'asc' }],
            select: {
              id: true,
              year: true,
              phase: true,
              track: true,
              minScore: true,
              maxScore: true,
              sourceUrl: true,
            },
          },
          _count: { select: { mentors: true } },
        },
      });
      if (!f) throw Errors.notFound(MESSAGES.facultyNotFound);
      const { logoKey, university, cutoffs, ...rest } = f;
      return {
        ...rest,
        accreditedAt: isoDay(f.accreditedAt),
        accreditationExpiresAt: isoDay(f.accreditationExpiresAt),
        logo: logoUrl(logoKey),
        university: {
          id: university.id,
          nameAr: university.nameAr,
          governorate: university.governorate,
          logo: logoUrl(university.logoKey),
        },
        cutoffs: cutoffs.map((c) => ({ ...c, minScore: Number(c.minScore) })),
      };
    },

    async createFaculty(input: FacultyInput, actor: Actor) {
      await universityOrThrow(input.universityId);
      await assertKind(input.kindId);
      await assertFacultyNameFree(input.universityId, input.nameAr);
      const accreditedAt = toDate(input.accreditedAt) ?? null;
      const expiresAt = toDate(input.accreditationExpiresAt) ?? null;
      assertDates(accreditedAt, expiresAt);
      const created = await db.$transaction(async (tx) => {
        const f = await tx.faculty.create({
          data: {
            universityId: input.universityId,
            kindId: input.kindId,
            nameAr: input.nameAr,
            city: input.city ?? null,
            governorate: input.governorate ?? null,
            website: input.website ?? null,
            about: input.about ?? null,
            accreditationStatus: input.accreditationStatus ?? 'unknown',
            accreditedAt,
            accreditationExpiresAt: expiresAt,
            isActive: input.isActive ?? true,
            adminEditedAt: new Date(),
          },
        });
        await audit(
          tx,
          actor,
          'catalog.faculty.create',
          { type: 'faculty', id: f.id },
          {
            after: input,
          },
        );
        return f;
      });
      invalidate();
      return created.id;
    },

    async updateFaculty(id: string, raw: Patch<Omit<FacultyInput, 'universityId'>>, actor: Actor) {
      const patch = defined(raw);
      const before = await facultyOrThrow(id);
      if (patch.kindId) await assertKind(patch.kindId);
      if (patch.nameAr && patch.nameAr !== before.nameAr)
        await assertFacultyNameFree(before.universityId, patch.nameAr, id);
      const { accreditedAt: a, accreditationExpiresAt: e, ...rest } = patch;
      const accreditedAt = toDate(a);
      const expiresAt = toDate(e);
      assertDates(
        accreditedAt === undefined ? before.accreditedAt : accreditedAt,
        expiresAt === undefined ? before.accreditationExpiresAt : expiresAt,
      );
      await db.$transaction(async (tx) => {
        await tx.faculty.update({
          where: { id },
          data: {
            ...rest,
            ...(accreditedAt !== undefined ? { accreditedAt } : {}),
            ...(expiresAt !== undefined ? { accreditationExpiresAt: expiresAt } : {}),
            adminEditedAt: new Date(),
          },
        });
        const changed = Object.keys(patch) as (keyof typeof patch)[];
        await audit(
          tx,
          actor,
          'catalog.faculty.update',
          { type: 'faculty', id },
          {
            before: Object.fromEntries(
              changed.map((k) => [k, (before as Record<string, unknown>)[k] ?? null]),
            ),
            after: patch,
          },
        );
      });
      invalidate();
    },

    async deleteFaculty(id: string, actor: Actor) {
      const f = await facultyOrThrow(id);
      const [mentors, applications] = await Promise.all([
        db.mentor.count({ where: { facultyId: id } }),
        db.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM mentor_applications WHERE payload->>'facultyId' = ${id}`,
      ]);
      if (mentors || Number(applications[0]?.n ?? 0)) throw Errors.conflict(MESSAGES.facultyInUse);
      await db.$transaction(async (tx) => {
        // Departments and cutoffs go with it (ON DELETE CASCADE).
        await tx.faculty.delete({ where: { id } });
        await audit(
          tx,
          actor,
          'catalog.faculty.delete',
          { type: 'faculty', id },
          {
            before: { universityId: f.universityId, kindId: f.kindId, nameAr: f.nameAr },
          },
        );
      });
      await logos.remove(f.logoKey);
      invalidate();
    },

    async setFacultyLogo(id: string, body: unknown, actor: Actor) {
      const f = await facultyOrThrow(id);
      const name = await logos.save(body);
      await db.$transaction(async (tx) => {
        await tx.faculty.update({ where: { id }, data: { logoKey: name } });
        await audit(
          tx,
          actor,
          'catalog.faculty.logo',
          { type: 'faculty', id },
          {
            before: { logoKey: f.logoKey },
            after: { logoKey: name },
          },
        );
      });
      await logos.remove(f.logoKey);
      invalidate();
      return logoUrl(name);
    },

    async removeFacultyLogo(id: string, actor: Actor) {
      const f = await facultyOrThrow(id);
      if (!f.logoKey) return;
      await db.$transaction(async (tx) => {
        await tx.faculty.update({ where: { id }, data: { logoKey: null } });
        await audit(
          tx,
          actor,
          'catalog.faculty.logo',
          { type: 'faculty', id },
          {
            before: { logoKey: f.logoKey },
            after: { logoKey: null },
          },
        );
      });
      await logos.remove(f.logoKey);
      invalidate();
    },

    // ---------- cutoffs ----------

    async saveCutoff(facultyId: string, c: CutoffInput, actor: Actor) {
      await facultyOrThrow(facultyId);
      const key = { facultyId, year: c.year, track: c.track, phase: c.phase };
      await db.$transaction(async (tx) => {
        const row = await tx.facultyCutoff.upsert({
          where: { facultyId_year_track_phase: key },
          update: { minScore: c.minScore, maxScore: c.maxScore, sourceUrl: c.sourceUrl },
          create: { ...key, minScore: c.minScore, maxScore: c.maxScore, sourceUrl: c.sourceUrl },
        });
        await tx.faculty.update({ where: { id: facultyId }, data: { adminEditedAt: new Date() } });
        await audit(
          tx,
          actor,
          'catalog.cutoff.save',
          { type: 'faculty_cutoff', id: row.id },
          {
            after: { facultyId, ...c },
          },
        );
      });
      invalidate();
    },

    async deleteCutoff(id: string, actor: Actor) {
      const c = await db.facultyCutoff.findUnique({ where: { id } });
      if (!c) throw Errors.notFound(MESSAGES.cutoffNotFound);
      await db.$transaction(async (tx) => {
        await tx.facultyCutoff.delete({ where: { id } });
        await tx.faculty.update({
          where: { id: c.facultyId },
          data: { adminEditedAt: new Date() },
        });
        await audit(
          tx,
          actor,
          'catalog.cutoff.delete',
          { type: 'faculty_cutoff', id },
          {
            before: {
              facultyId: c.facultyId,
              year: c.year,
              track: c.track,
              phase: c.phase,
              minScore: Number(c.minScore),
            },
          },
        );
      });
      invalidate();
    },
  };
}
