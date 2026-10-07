/**
 * Admin side of mentor onboarding (Phase 10): the review queue, documents, and decisions.
 *
 *   submitted ──start──▶ under_review ──approve──▶ approved   (mentor profile created, listed)
 *        │                    ├──reject────────▶ rejected
 *        └──(decide directly)─┴──request changes▶ changes_requested (back to the applicant)
 *
 * Every transition and every document view is written to `audit_logs`. Decisions use conditional
 * updates, so two reviewers acting at once cannot both win.
 */
import { randomBytes } from 'node:crypto';
import { AppError, Errors } from '../../core/errors.js';
import { inetOrNull } from '../../core/http.js';
import type { MentorApplicationStatus, Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import type { ObjectStore } from '../../infra/storage.js';
import { submitSchema } from '../mentor-application/application.schemas.js';
import type { AuthContext } from '../auth/session.service.js';

export type Decision = 'approve' | 'reject' | 'request_changes';

/** Sessions every new mentor offers (durations and media from the booking design). */
const OFFERINGS = [
  { kind: 'consultation', durationMin: 45, medium: 'video' },
  { kind: 'comparison', durationMin: 60, medium: 'video' },
  { kind: 'quick_call', durationMin: 20, medium: 'audio' },
] as const;

const REVIEWABLE: MentorApplicationStatus[] = ['submitted', 'under_review'];
const PAGE_SIZE = 20;

const MESSAGES = {
  notFound: 'الطلب ده مش موجود.',
  docNotFound: 'المستند ده مش موجود.',
  notReviewable: 'الطلب ده اتاخد فيه قرار أو رجع للمتقدم. حدّث الصفحة.',
  notSubmitted: 'الطلب لازم يكون جديد عشان تبدأ مراجعته.',
  invalidPayload: 'بيانات الطلب ناقصة أو مش مظبوطة، ومينفعش يتقبل. اطلب تعديل.',
  noteRequired: 'اكتب السبب عشان المتقدم يعرف يعمل إيه.',
};

const NOTIFY: Record<Decision, { title: string; body: (note?: string) => string }> = {
  approve: {
    title: 'اتقبلت كمرشد في سابق',
    body: () => 'مبروك! طلبك اتقبل. حدد مواعيدك عشان الطلاب يقدروا يحجزوا معاك.',
  },
  request_changes: {
    title: 'طلبك محتاج تعديل بسيط',
    body: (note) => `راجعنا طلبك ومحتاجين تعديل: ${note ?? ''}`.trim(),
  },
  reject: {
    title: 'بخصوص طلب الانضمام لسابق',
    body: (note) => `للأسف طلبك ما اتقبلش المرة دي. ${note ?? ''}`.trim(),
  },
};

interface Actor {
  auth: AuthContext;
  ip: string;
  requestId: string;
}

const splitTopics = (text: string | undefined) =>
  (text ?? '')
    .split(/[،,\n؛;]+/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8)
    .map((t) => t.slice(0, 80));

export function createVerificationService(deps: {
  db: Db;
  store: ObjectStore;
  crypto: DocumentCrypto;
}) {
  const { db, store, crypto } = deps;

  const audit = (
    tx: Prisma.TransactionClient | Db,
    actor: Actor,
    action: string,
    entity: { type: string; id: string },
    change: { before?: object; after?: object } = {},
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

  async function load(id: string) {
    const app = await db.mentorApplication.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, phone: true, createdAt: true } },
        reviewer: { select: { fullName: true } },
        documents: {
          select: { id: true, kind: true, mimeType: true, sizeBytes: true, uploadedAt: true },
          orderBy: { kind: 'asc' },
        },
      },
    });
    if (!app) throw Errors.notFound(MESSAGES.notFound);
    return app;
  }

  return {
    async list(filter: { status?: MentorApplicationStatus | undefined; page: number }) {
      // Drafts are the applicant's private work in progress — never in the admin queue.
      const where: Prisma.MentorApplicationWhereInput = filter.status
        ? { status: filter.status }
        : { status: { not: 'draft' } };
      const [rows, total, counts] = await Promise.all([
        db.mentorApplication.findMany({
          where,
          // Oldest waiting first: applicants are promised an answer within two working days.
          orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
          skip: (filter.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            status: true,
            payload: true,
            submittedAt: true,
            decidedAt: true,
            user: { select: { fullName: true, phone: true } },
            reviewer: { select: { fullName: true } },
          },
        }),
        db.mentorApplication.count({ where }),
        db.mentorApplication.groupBy({
          by: ['status'],
          where: { status: { not: 'draft' } },
          _count: { _all: true },
        }),
      ]);
      const facultyIds = [
        ...new Set(
          rows.map((r) => (r.payload as { facultyId?: string }).facultyId).filter(Boolean),
        ),
      ] as string[];
      const faculties = await db.faculty.findMany({
        where: { id: { in: facultyIds } },
        select: {
          id: true,
          nameAr: true,
          kind: { select: { fullNameAr: true } },
          university: { select: { nameAr: true } },
        },
      });
      const facultyName = new Map(
        faculties.map((f) => [f.id, `${f.nameAr ?? f.kind.fullNameAr} · ${f.university.nameAr}`]),
      );

      return {
        items: rows.map((r) => {
          const p = r.payload as { kind?: string; facultyId?: string; major?: string };
          return {
            id: r.id,
            status: r.status,
            applicant: r.user,
            kind: p.kind ?? null,
            major: p.major ?? null,
            faculty: (p.facultyId && facultyName.get(p.facultyId)) || null,
            submittedAt: r.submittedAt,
            decidedAt: r.decidedAt,
            reviewer: r.reviewer?.fullName ?? null,
          };
        }),
        meta: { page: filter.page, pageSize: PAGE_SIZE, total },
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      };
    },

    async detail(id: string) {
      const app = await load(id);
      const p = app.payload as { facultyId?: string; universitySlug?: string };
      const [faculty, history] = await Promise.all([
        p.facultyId
          ? db.faculty.findUnique({
              where: { id: p.facultyId },
              select: {
                nameAr: true,
                kind: { select: { fullNameAr: true } },
                university: { select: { nameAr: true } },
              },
            })
          : null,
        db.auditLog.findMany({
          where: { entityType: 'mentor_application', entityId: id },
          orderBy: { createdAt: 'asc' },
          select: {
            action: true,
            actorRole: true,
            createdAt: true,
            after: true,
            actor: { select: { fullName: true } },
          },
        }),
      ]);
      return {
        id: app.id,
        status: app.status,
        payload: app.payload,
        university: faculty?.university.nameAr ?? null,
        faculty: faculty ? (faculty.nameAr ?? faculty.kind.fullNameAr) : null,
        applicant: app.user,
        submittedAt: app.submittedAt,
        decidedAt: app.decidedAt,
        decisionNote: app.decisionNote,
        reviewer: app.reviewer?.fullName ?? null,
        documents: app.documents,
        history: history.map((h) => ({
          action: h.action,
          actor: h.actor?.fullName ?? h.actorRole,
          at: h.createdAt,
          note: (h.after as { note?: string } | null)?.note ?? null,
        })),
      };
    },

    async startReview(id: string, actor: Actor) {
      const updated = await db.mentorApplication.updateMany({
        where: { id, status: 'submitted' },
        data: { status: 'under_review', reviewerId: actor.auth.userId },
      });
      if (updated.count !== 1) {
        await load(id); // 404 when it does not exist
        throw new AppError('CONFLICT', MESSAGES.notSubmitted);
      }
      await audit(
        db,
        actor,
        'mentor_application.start_review',
        { type: 'mentor_application', id },
        {
          before: { status: 'submitted' },
          after: { status: 'under_review' },
        },
      );
    },

    async decide(id: string, decision: Decision, note: string | undefined, actor: Actor) {
      if (decision !== 'approve' && !note) throw Errors.validation({ note: MESSAGES.noteRequired });
      const app = await load(id);
      if (!REVIEWABLE.includes(app.status)) throw new AppError('CONFLICT', MESSAGES.notReviewable);

      const status: MentorApplicationStatus =
        decision === 'approve'
          ? 'approved'
          : decision === 'reject'
            ? 'rejected'
            : 'changes_requested';
      const parsed = submitSchema.safeParse(app.payload);
      if (decision === 'approve' && !parsed.success)
        throw Errors.validation(undefined, MESSAGES.invalidPayload);

      await db.$transaction(async (tx) => {
        const now = new Date();
        const moved = await tx.mentorApplication.updateMany({
          where: { id, status: { in: REVIEWABLE } },
          data: {
            status,
            reviewerId: actor.auth.userId,
            decisionNote: note ?? null,
            // A request for changes is not a final decision.
            decidedAt: decision === 'request_changes' ? null : now,
          },
        });
        if (moved.count !== 1) throw new AppError('CONFLICT', MESSAGES.notReviewable);

        if (decision === 'approve' && parsed.success) {
          const p = parsed.data;
          await tx.mentor.create({
            data: {
              userId: app.userId,
              slug: `m-${randomBytes(5).toString('hex')}`,
              kind: p.kind,
              facultyId: p.facultyId,
              majorLabel: p.major,
              graduationYear: p.graduationYear ?? null,
              basePricePiasters: p.basePriceEgp * 100,
              isListed: true,
              listedAt: now,
              offerings: { create: OFFERINGS.map((o) => ({ ...o })) },
              topics: {
                create: splitTopics(p.topics).map((label, sortOrder) => ({ label, sortOrder })),
              },
            },
          });
        }

        await tx.notification.create({
          data: {
            userId: app.userId,
            type: `mentor_application.${status}`,
            title: NOTIFY[decision].title,
            body: NOTIFY[decision].body(note),
            data: { applicationId: id },
          },
        });
        await audit(
          tx,
          actor,
          `mentor_application.${decision}`,
          { type: 'mentor_application', id },
          {
            before: { status: app.status },
            after: { status, ...(note ? { note } : {}) },
          },
        );
      });
    },

    /** Decrypted file for an admin, recorded in the audit log before it is returned. */
    async document(applicationId: string, documentId: string, actor: Actor) {
      const doc = await db.mentorDocument.findFirst({
        where: { id: documentId, applicationId },
        select: {
          id: true,
          kind: true,
          mimeType: true,
          storageKey: true,
          encryptionKeyId: true,
          sha256: true,
        },
      });
      if (!doc) throw Errors.notFound(MESSAGES.docNotFound);
      await audit(
        db,
        actor,
        'mentor_document.view',
        { type: 'mentor_document', id: doc.id },
        {
          after: { applicationId, kind: doc.kind },
        },
      );
      const blob = await store.get(doc.storageKey);
      const body = doc.encryptionKeyId
        ? crypto.open(blob, doc.encryptionKeyId, doc.storageKey)
        : blob;
      return { body, mimeType: doc.mimeType, kind: doc.kind };
    },

    async auditLog(filter: {
      entityType?: string | undefined;
      action?: string | undefined;
      page: number;
    }) {
      const where: Prisma.AuditLogWhereInput = {
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.action ? { action: { startsWith: filter.action } } : {}),
      };
      const [rows, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (filter.page - 1) * 50,
          take: 50,
          select: {
            id: true,
            action: true,
            actorRole: true,
            entityType: true,
            entityId: true,
            before: true,
            after: true,
            ip: true,
            createdAt: true,
            actor: { select: { fullName: true, phone: true } },
          },
        }),
        db.auditLog.count({ where }),
      ]);
      return { items: rows, meta: { page: filter.page, pageSize: 50, total } };
    },
  };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
