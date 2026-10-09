/** Catalog curation API (`/api/v1/admin/catalog`, Phase 11) — super admins and support. */
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

export interface UniversityRow {
  id: string;
  slug: string;
  nameAr: string;
  governorate: string;
  type: string;
  isActive: boolean;
  _count: { faculties: number };
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
export const listUniversities = () =>
  api<{ universities: UniversityRow[] }>(`${base}/universities`).then((d) => d.universities);
export const updateUniversity = (id: string, patch: { nameAr?: string; isActive?: boolean }) =>
  api<{ universities: UniversityRow[] }>(`${base}/universities/${id}`, {
    method: 'PATCH',
    body: patch,
  }).then((d) => d.universities);
