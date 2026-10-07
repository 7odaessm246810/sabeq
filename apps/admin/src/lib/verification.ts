/** Admin verification API (`/api/v1/admin/applications`, Phase 10). */
import { api } from './api';

export type ReviewStatus =
  'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected';
export type Decision = 'approve' | 'reject' | 'request_changes';

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  submitted: 'جديد',
  under_review: 'بيتراجع',
  changes_requested: 'محتاج تعديل',
  approved: 'اتقبل',
  rejected: 'اترفض',
};

export const STATUS_BADGE: Record<ReviewStatus, string> = {
  submitted: 'sb-badge--primary',
  under_review: 'sb-badge--warning',
  changes_requested: 'sb-badge--neutral',
  approved: 'sb-badge--success',
  rejected: 'sb-badge--error',
};

export const KIND_LABELS: Record<string, string> = {
  graduate: 'خريج',
  teaching_assistant: 'معيد',
  professor: 'دكتور جامعة',
};

export const DOC_LABELS: Record<string, string> = {
  graduation_certificate: 'شهادة التخرج',
  employment_proof: 'إثبات التعيين',
  national_id_front: 'البطاقة (الوش)',
};

export const DAY_LABELS: Record<string, string> = {
  sat: 'السبت',
  sun: 'الأحد',
  mon: 'الاثنين',
  tue: 'الثلاثاء',
  wed: 'الأربعاء',
  thu: 'الخميس',
  fri: 'الجمعة',
};

export const ACTION_LABELS: Record<string, string> = {
  'mentor_application.submit': 'المتقدم بعت الطلب',
  'mentor_application.start_review': 'بدأت المراجعة',
  'mentor_application.approve': 'اتقبل',
  'mentor_application.reject': 'اترفض',
  'mentor_application.request_changes': 'اتطلب تعديل',
  'mentor_document.view': 'اتفتح مستند',
  'auth.login': 'دخول أدمن',
  'admin.create': 'اتعمل حساب أدمن',
};

export interface QueueItem {
  id: string;
  status: ReviewStatus;
  applicant: { fullName: string | null; phone: string };
  kind: string | null;
  major: string | null;
  faculty: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  reviewer: string | null;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApplicationDetail {
  id: string;
  status: ReviewStatus;
  payload: {
    kind?: string;
    major?: string;
    graduationYear?: number | null;
    basePriceEgp?: number;
    days?: string[];
    topics?: string;
  };
  university: string | null;
  faculty: string | null;
  applicant: { id: string; fullName: string | null; phone: string; createdAt: string };
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  reviewer: string | null;
  documents: {
    id: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  }[];
  history: { action: string; actor: string; at: string; note: string | null }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
  actor: { fullName: string | null; phone: string } | null;
}

export const listApplications = (status: ReviewStatus | undefined, page: number) =>
  api<{ items: QueueItem[]; counts: Partial<Record<ReviewStatus, number>>; page: PageInfo }>(
    `/admin/applications?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) })}`,
  );

export const getApplication = (id: string) =>
  api<{ application: ApplicationDetail }>(`/admin/applications/${id}`).then((d) => d.application);

export const startReview = (id: string) =>
  api<{ application: ApplicationDetail }>(`/admin/applications/${id}/start`, {
    method: 'POST',
  }).then((d) => d.application);

export const decide = (id: string, decision: Decision, note?: string) =>
  api<{ application: ApplicationDetail }>(`/admin/applications/${id}/decision`, {
    method: 'POST',
    body: { decision, ...(note ? { note } : {}) },
  }).then((d) => d.application);

/** Same-origin URL: opening it sends the admin cookie; the API decrypts and audits the view. */
export const documentUrl = (applicationId: string, documentId: string) =>
  `/api/v1/admin/applications/${applicationId}/documents/${documentId}`;

export const listAudit = (filter: { entityType?: string; action?: string; page: number }) =>
  api<{ items: AuditEntry[]; page: PageInfo }>(
    `/admin/audit?${new URLSearchParams({
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      page: String(filter.page),
    })}`,
  );

const dateFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
export const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
