/** Mentor applicant API (`/api/v1/mentor/application`, Phase 09) and the catalog it needs. */
import { api } from './api';

export type MentorKind = 'graduate' | 'teaching_assistant' | 'professor';
export type Weekday = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export type ApplicationStatus =
  'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected';

export interface ApplicationPayload {
  kind?: MentorKind;
  universitySlug?: string;
  facultyId?: string;
  major?: string;
  graduationYear?: number | null;
  basePriceEgp?: number;
  days?: Weekday[];
  topics?: string;
}

export interface ApplicationDocument {
  id: string;
  kind: 'graduation_certificate' | 'employment_proof' | 'national_id_front';
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Application {
  id: string;
  status: ApplicationStatus;
  payload: ApplicationPayload;
  submittedAt: string | null;
  decisionNote: string | null;
  documents: ApplicationDocument[];
}

export interface CatalogUniversity {
  slug: string;
  name: string;
  faculties: { id: string; kind: string; name: string }[];
}

export const MENTOR_KIND_LABELS: Record<MentorKind, string> = {
  graduate: 'خريج',
  teaching_assistant: 'معيد',
  professor: 'دكتور جامعة',
};

/** Same order as the design's day chips (Saturday first). */
export const WEEKDAYS: readonly (readonly [Weekday, string])[] = [
  ['sat', 'السبت'],
  ['sun', 'الأحد'],
  ['mon', 'الاثنين'],
  ['tue', 'الثلاثاء'],
  ['wed', 'الأربعاء'],
  ['thu', 'الخميس'],
  ['fri', 'الجمعة'],
];

export const getApplication = () =>
  api<{ application: Application | null }>('/mentor/application').then((d) => d.application);

export const saveApplication = (patch: ApplicationPayload & { fullName?: string }) =>
  api<{ application: Application }>('/mentor/application', { method: 'PUT', body: patch }).then(
    (d) => d.application,
  );

export const uploadDocument = (slot: 'credential' | 'national_id_front', file: File) =>
  api<{ document: ApplicationDocument }>(`/mentor/application/documents/${slot}`, {
    method: 'POST',
    file,
  }).then((d) => d.document);

export const submitApplication = () =>
  api<{ application: Application }>('/mentor/application/submit', { method: 'POST' }).then(
    (d) => d.application,
  );

export const getUniversities = () =>
  api<{ universities: CatalogUniversity[] }>('/catalog/universities').then((d) => d.universities);
