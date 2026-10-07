/**
 * The applicant's side of mentor onboarding (Phase 09):
 *
 *   draft ──submit──▶ submitted ──(admin, Phase 10)──▶ under_review ─▶ approved | rejected
 *     ▲                                                        │
 *     └──────────── changes_requested ◀────────────────────────┘
 *
 * The applicant edits only `draft` and `changes_requested`. After a rejection they may start a new
 * application; the database allows one open application per person.
 */
import { createHash, randomUUID } from 'node:crypto';
import { AppError, Errors } from '../../core/errors.js';
import { inetOrNull } from '../../core/http.js';
import type { DocumentKind, MentorApplicationStatus } from '../../generated/prisma/enums.js';
import type { Db } from '../../infra/db.js';
import type { DocumentCrypto } from '../../infra/document-crypto.js';
import type { ObjectStore } from '../../infra/storage.js';
import {
  submitSchema,
  type DraftInput,
  type Payload,
  type UploadKind,
} from './application.schemas.js';
import { DOCUMENT_MAX_BYTES, sniffDocumentType } from './file-type.js';

const OPEN: MentorApplicationStatus[] = ['draft', 'submitted', 'under_review', 'changes_requested'];
const EDITABLE: MentorApplicationStatus[] = ['draft', 'changes_requested'];

export interface ApplicationDocument {
  id: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface ApplicationView {
  id: string;
  status: MentorApplicationStatus;
  payload: Payload;
  submittedAt: Date | null;
  decidedAt: Date | null;
  /** What the reviewer asked to change, or why it was rejected. */
  decisionNote: string | null;
  documents: ApplicationDocument[];
  updatedAt: Date;
}

const MESSAGES = {
  inReview: 'طلبك اتبعت وبيتراجع دلوقتي. هنكلمك أول ما نخلص.',
  alreadyMentor: 'انت مرشد بالفعل.',
  facultyMismatch: 'الكلية دي مش في الجامعة اللي اخترتها.',
  noApplication: 'مفيش طلب لسه. ابدأ بالبيانات الأول.',
  badFile: 'ارفع PDF أو صورة (JPG أو PNG أو WebP).',
  tooBig: 'الملف أكبر من 10 ميجا.',
  docNotFound: 'المستند ده مش موجود.',
  missingCredential: 'ارفع شهادة التخرج أو إثبات التعيين.',
  missingId: 'ارفع صورة البطاقة (الوش).',
  missingName: 'اكتب اسمك بالكامل.',
};

const DOC_SELECT = {
  id: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
} as const;

export function createApplicationService(deps: {
  db: Db;
  store: ObjectStore;
  crypto: DocumentCrypto;
}) {
  const { db, store, crypto } = deps;

  async function latest(userId: string) {
    return db.mentorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { documents: { select: DOC_SELECT, orderBy: { kind: 'asc' } } },
    });
  }

  function view(app: NonNullable<Awaited<ReturnType<typeof latest>>>): ApplicationView {
    return {
      id: app.id,
      status: app.status,
      payload: app.payload as Payload,
      submittedAt: app.submittedAt,
      decidedAt: app.decidedAt,
      decisionNote: app.decisionNote,
      documents: app.documents,
      updatedAt: app.updatedAt,
    };
  }

  /** The open application to edit, created on first use. Refuses while it is under review. */
  async function editable(userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { mentor: true } });
    if (user?.mentor) throw Errors.conflict(MESSAGES.alreadyMentor);

    const app = await latest(userId);
    if (app && EDITABLE.includes(app.status)) return app;
    if (app && OPEN.includes(app.status)) throw Errors.conflict(MESSAGES.inReview);
    if (app?.status === 'approved') throw Errors.conflict(MESSAGES.alreadyMentor);
    await db.mentorApplication.create({ data: { userId, payload: {} } });
    const created = await latest(userId);
    if (!created) throw Errors.internal(new Error('application vanished after create'));
    return created;
  }

  async function checkFaculty(payload: Payload) {
    if (!payload.facultyId) return;
    const faculty = await db.faculty.findUnique({
      where: { id: payload.facultyId },
      select: { isActive: true, university: { select: { slug: true } } },
    });
    if (!faculty?.isActive) throw Errors.validation({ facultyId: 'اختار الكلية.' });
    if (payload.universitySlug && faculty.university.slug !== payload.universitySlug) {
      throw Errors.validation({ facultyId: MESSAGES.facultyMismatch });
    }
  }

  return {
    async current(userId: string): Promise<ApplicationView | null> {
      const app = await latest(userId);
      return app ? view(app) : null;
    },

    async saveDraft(userId: string, input: DraftInput): Promise<ApplicationView> {
      const app = await editable(userId);
      const { fullName, ...patch } = input;
      // `null` clears a field; omitted fields keep their value.
      const merged = Object.fromEntries(
        Object.entries({ ...(app.payload as Payload), ...patch }).filter(([, v]) => v !== null),
      );
      await checkFaculty(merged as Payload);

      await db.$transaction([
        ...(fullName ? [db.user.update({ where: { id: userId }, data: { fullName } })] : []),
        db.mentorApplication.update({ where: { id: app.id }, data: { payload: merged as object } }),
      ]);
      const saved = await latest(userId);
      if (!saved) throw Errors.internal();
      return view(saved);
    },

    async uploadDocument(
      userId: string,
      slot: UploadKind,
      body: unknown,
    ): Promise<ApplicationDocument> {
      if (!Buffer.isBuffer(body) || body.length === 0)
        throw Errors.validation({ file: MESSAGES.badFile });
      if (body.length > DOCUMENT_MAX_BYTES) throw Errors.validation({ file: MESSAGES.tooBig });
      const mimeType = sniffDocumentType(body);
      if (!mimeType) throw Errors.validation({ file: MESSAGES.badFile });

      const app = await editable(userId);
      const kind: DocumentKind =
        slot === 'national_id_front'
          ? 'national_id_front'
          : (app.payload as Payload).kind === 'graduate' || !(app.payload as Payload).kind
            ? 'graduation_certificate'
            : 'employment_proof';

      const storageKey = `mentor-documents/${app.id}/${randomUUID()}`;
      const { keyId, blob } = crypto.seal(body, storageKey);
      await store.put(storageKey, blob, 'application/octet-stream');

      // One credential per application: a new upload in this slot replaces whichever kind was there.
      const replaced = await db.mentorDocument.findMany({
        where: {
          applicationId: app.id,
          kind:
            slot === 'national_id_front'
              ? 'national_id_front'
              : { in: ['graduation_certificate', 'employment_proof'] },
        },
        select: { id: true, storageKey: true },
      });
      try {
        const [, doc] = await db.$transaction([
          db.mentorDocument.deleteMany({ where: { id: { in: replaced.map((r) => r.id) } } }),
          db.mentorDocument.create({
            data: {
              applicationId: app.id,
              kind,
              storageKey,
              mimeType,
              sizeBytes: body.length,
              sha256: createHash('sha256').update(body).digest('hex'),
              encryptionKeyId: keyId,
            },
            select: DOC_SELECT,
          }),
        ]);
        await Promise.allSettled(replaced.map((r) => store.delete(r.storageKey)));
        return doc;
      } catch (err) {
        // Never leave an orphan object if the row could not be written.
        await store.delete(storageKey).catch(() => undefined);
        throw err;
      }
    },

    async deleteDocument(userId: string, documentId: string): Promise<void> {
      const app = await editable(userId);
      const doc = await db.mentorDocument.findFirst({
        where: { id: documentId, applicationId: app.id },
        select: { id: true, storageKey: true },
      });
      if (!doc) throw Errors.notFound(MESSAGES.docNotFound);
      await db.mentorDocument.delete({ where: { id: doc.id } });
      await store.delete(doc.storageKey).catch(() => undefined);
    },

    async submit(
      userId: string,
      meta: { ip: string; requestId: string },
    ): Promise<ApplicationView> {
      const app = await latest(userId);
      if (!app || !EDITABLE.includes(app.status)) {
        if (app && OPEN.includes(app.status)) throw Errors.conflict(MESSAGES.inReview);
        throw Errors.validation(undefined, MESSAGES.noApplication);
      }

      const fields: Record<string, string> = {};
      const parsed = submitSchema.safeParse(app.payload);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '_');
          fields[key] ??= issue.message;
        }
        // zod skips the cross-field rule when other fields fail; report it in the same round.
        const p = app.payload as Payload;
        if (p.kind !== 'professor' && (p.graduationYear === null || p.graduationYear === undefined))
          fields.graduationYear ??= 'اختار سنة التخرج.';
      } else {
        await checkFaculty(parsed.data);
      }
      const user = await db.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      if (!user?.fullName || user.fullName.split(' ').length < 2)
        fields.fullName = MESSAGES.missingName;
      const kinds = new Set(app.documents.map((d) => d.kind));
      if (!kinds.has('graduation_certificate') && !kinds.has('employment_proof'))
        fields.credential = MESSAGES.missingCredential;
      if (!kinds.has('national_id_front')) fields.national_id_front = MESSAGES.missingId;
      if (Object.keys(fields).length) throw Errors.validation(fields);

      // Conditional update: two submits at once cannot both pass.
      const updated = await db.mentorApplication.updateMany({
        where: { id: app.id, status: { in: EDITABLE } },
        data: { status: 'submitted', submittedAt: new Date(), payload: parsed.data as object },
      });
      if (updated.count !== 1) throw new AppError('CONFLICT', MESSAGES.inReview);
      await db.auditLog.create({
        data: {
          actorUserId: userId,
          actorRole: 'mentor',
          action: 'mentor_application.submit',
          entityType: 'mentor_application',
          entityId: app.id,
          ip: inetOrNull(meta.ip),
          requestId: meta.requestId,
        },
      });
      const saved = await latest(userId);
      if (!saved) throw Errors.internal();
      return view(saved);
    },
  };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;
