/** Catalog curation API (`/api/v1/admin/catalog`, Phase 11) — super admins and support. */
import type { AccreditationStatus, UniversityType } from '@sabeq/types';
import { api } from './api';

export interface KindRow {
  id: string;
  slug: string;
  nameAr: string;
  fullNameAr: string;
  isActive: boolean;
  _count: { faculties: number; insights: number };
}

export interface KindDetail {
  id: string;
  slug: string;
  nameAr: string;
  fullNameAr: string;
  icon: string;
  category: string;
  studyYears: number;
  summary: string;
  about: string;
  genericInfo: string;
  isActive: boolean;
  insights: { id: string; quote: string; isPublished: boolean; sortOrder: number }[];
  faculties: {
    id: string;
    isActive: boolean;
    university: { nameAr: string; isActive: boolean };
    departments: { id: string; nameAr: string; isActive: boolean }[];
  }[];
}

export type KindPatch = Partial<
  Pick<
    KindDetail,
    'nameAr' | 'fullNameAr' | 'summary' | 'about' | 'genericInfo' | 'studyYears' | 'isActive'
  >
>;

const base = '/admin/catalog';

export const listKinds = () => api<{ kinds: KindRow[] }>(`${base}/kinds`).then((d) => d.kinds);
export const getKind = (id: string) =>
  api<{ kind: KindDetail }>(`${base}/kinds/${id}`).then((d) => d.kind);
export const updateKind = (id: string, patch: KindPatch) =>
  api<{ kind: KindDetail }>(`${base}/kinds/${id}`, { method: 'PATCH', body: patch }).then(
    (d) => d.kind,
  );
export const addInsight = (kindId: string, quote: string) =>
  api<{ kind: KindDetail }>(`${base}/kinds/${kindId}/insights`, {
    method: 'POST',
    body: { quote },
  }).then((d) => d.kind);
export const updateInsight = (id: string, patch: { quote?: string; isPublished?: boolean }) =>
  api(`${base}/insights/${id}`, { method: 'PATCH', body: patch });
export const deleteInsight = (id: string) => api(`${base}/insights/${id}`, { method: 'DELETE' });
export const addDepartment = (facultyId: string, nameAr: string) =>
  api(`${base}/faculties/${facultyId}/departments`, { method: 'POST', body: { nameAr } });
export const updateDepartment = (id: string, patch: { nameAr?: string; isActive?: boolean }) =>
  api(`${base}/departments/${id}`, { method: 'PATCH', body: patch });
// ---------- universities & faculties (Phase 11c) ----------

export interface UniversityRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  type: UniversityType;
  governorate: string | null;
  website: string | null;
  logo: string | null;
  isActive: boolean;
  adminEditedAt: string | null;
  _count: { faculties: number };
}

export interface UniversityFacultyRow {
  id: string;
  nameAr: string;
  city: string | null;
  governorate: string | null;
  logo: string | null;
  isActive: boolean;
  accreditationStatus: AccreditationStatus;
  kind: { id: string; nameAr: string };
  _count: { mentors: number; departments: number };
}

export interface UniversityDetail extends Omit<UniversityRow, '_count'> {
  sourceUrl: string | null;
  faculties: UniversityFacultyRow[];
}

export interface UniversityInput {
  nameAr: string;
  nameEn: string | null;
  type: UniversityType;
  governorate: string | null;
  website: string | null;
  isActive: boolean;
}

export interface Cutoff {
  id: string;
  year: number;
  phase: number;
  track: 'science_bio' | 'science_math' | 'literary';
  minScore: number;
  maxScore: number;
  sourceUrl: string;
}

export interface FacultyDetail {
  id: string;
  nameAr: string;
  city: string | null;
  governorate: string | null;
  website: string | null;
  about: string | null;
  logo: string | null;
  isActive: boolean;
  accreditationStatus: AccreditationStatus;
  accreditedAt: string | null;
  accreditationExpiresAt: string | null;
  accreditedPrograms: { name: string; status: string; expiresAt: string }[] | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  adminEditedAt: string | null;
  university: { id: string; nameAr: string; governorate: string | null; logo: string | null };
  kind: { id: string; slug: string; nameAr: string };
  departments: { id: string; nameAr: string; isActive: boolean; sourceUrl: string | null }[];
  cutoffs: Cutoff[];
  _count: { mentors: number };
}

export interface FacultyInput {
  kindId: string;
  nameAr: string;
  city: string | null;
  governorate: string | null;
  website: string | null;
  about: string | null;
  accreditationStatus: AccreditationStatus;
  accreditedAt: string | null;
  accreditationExpiresAt: string | null;
  isActive: boolean;
}

export const listUniversities = () =>
  api<{ universities: UniversityRow[] }>(`${base}/universities`).then((d) => d.universities);
export const getUniversity = (id: string) =>
  api<{ university: UniversityDetail }>(`${base}/universities/${id}`).then((d) => d.university);
export const createUniversity = (input: UniversityInput) =>
  api<{ university: UniversityDetail }>(`${base}/universities`, {
    method: 'POST',
    body: input,
  }).then((d) => d.university);
export const updateUniversity = (id: string, patch: Partial<UniversityInput>) =>
  api<{ university: UniversityDetail }>(`${base}/universities/${id}`, {
    method: 'PATCH',
    body: patch,
  }).then((d) => d.university);
export const deleteUniversity = (id: string) =>
  api(`${base}/universities/${id}`, { method: 'DELETE' });

export const getFaculty = (id: string) =>
  api<{ faculty: FacultyDetail }>(`${base}/faculties/${id}`).then((d) => d.faculty);
export const createFaculty = (universityId: string, input: FacultyInput) =>
  api<{ faculty: FacultyDetail }>(`${base}/faculties`, {
    method: 'POST',
    body: { universityId, ...input },
  }).then((d) => d.faculty);
export const updateFaculty = (id: string, patch: Partial<FacultyInput>) =>
  api<{ faculty: FacultyDetail }>(`${base}/faculties/${id}`, {
    method: 'PATCH',
    body: patch,
  }).then((d) => d.faculty);
export const deleteFaculty = (id: string) => api(`${base}/faculties/${id}`, { method: 'DELETE' });

export const saveCutoff = (facultyId: string, cutoff: Omit<Cutoff, 'id'>) =>
  api<{ faculty: FacultyDetail }>(`${base}/faculties/${facultyId}/cutoffs`, {
    method: 'POST',
    body: cutoff,
  }).then((d) => d.faculty);
export const deleteCutoff = (id: string) => api(`${base}/cutoffs/${id}`, { method: 'DELETE' });

/** `owner` is "universities" or "faculties". Returns the new logo URL. */
export const uploadLogo = (owner: 'universities' | 'faculties', id: string, file: File) =>
  api<{ logo: string }>(`${base}/${owner}/${id}/logo`, { method: 'PUT', file }).then((d) => d.logo);
export const removeLogo = (owner: 'universities' | 'faculties', id: string) =>
  api(`${base}/${owner}/${id}/logo`, { method: 'DELETE' });
