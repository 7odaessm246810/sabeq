/**
 * Catalog data for server components (Phase 11): the API's faculty kinds mapped to the `Faculty`
 * shape the design's components already use, so pages keep their exact markup.
 *
 * Server-side only: calls the API directly at API_INTERNAL_URL (no browser, no cookies). Responses
 * are cached for 5 minutes in Next's data cache, so an admin edit shows up within that time.
 */
import type { IconName } from '@sabeq/ui';
import type { Faculty, FacultyCategory } from './mock/data';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1';
const REVALIDATE_SECONDS = 300;

export type ApiCategory = 'medical' | 'engineering' | 'science' | 'literary' | 'arts';

const CATEGORY: Record<ApiCategory, FacultyCategory> = {
  medical: 'طبي',
  engineering: 'هندسي',
  science: 'علمي',
  literary: 'أدبي',
  arts: 'فني',
};

interface ApiKindSummary {
  slug: string;
  name: string;
  fullName: string;
  icon: string;
  category: ApiCategory;
  studyYears: number;
  summary: string;
  mentorCount: number;
  universities: string[];
  departments: string[];
}

export type UniversityType =
  'public' | 'azhar' | 'private' | 'national' | 'technological' | 'international';

/** One faculty of this kind at one university (Phase 11 research data). */
export interface FacultyOffering {
  id: string;
  name: string;
  city: string | null;
  logo: string | null;
  university: { slug: string; name: string; type: UniversityType; governorate: string | null };
  accreditation: {
    status: 'accredited' | 'conditional' | 'not_accredited' | 'unknown';
    expiresAt: string | null;
    programmes: { name: string; status: string; expiresAt: string }[];
  };
  cutoffs: { year: number; phase: number; track: string; minScore: number; maxScore: number }[];
  departments: { name: string; mentorCount: number }[];
  departmentsSource: string | null;
  mentorCount: number;
}

export interface CatalogSources {
  accreditation: { name: string; latestDecision: string };
  cutoffs: { name: string; date: string };
}

interface ApiKind extends Omit<ApiKindSummary, 'universities' | 'departments'> {
  about: string;
  genericInfo: string;
  insights: string[];
  universities: { slug: string; name: string }[];
  departments: { name: string; mentorCount: number }[];
  faculties: FacultyOffering[];
  sources: CatalogSources;
}

export interface UniversityOption {
  slug: string;
  name: string;
}

/** A faculty card for /explore, plus what its filters need. */
export interface ExploreFaculty extends Faculty {
  universities: readonly string[];
}

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`catalog ${path} → ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

export async function getExploreData(): Promise<{
  faculties: ExploreFaculty[];
  universities: UniversityOption[];
}> {
  const [kinds, unis] = await Promise.all([
    get<{ kinds: ApiKindSummary[] }>('/catalog/faculty-kinds'),
    get<{ universities: UniversityOption[] }>('/catalog/universities'),
  ]);
  return {
    faculties: (kinds?.kinds ?? []).map((k) => ({
      id: k.slug,
      name: k.name,
      full: k.fullName,
      icon: k.icon as IconName,
      cat: CATEGORY[k.category],
      years: k.studyYears,
      desc: k.summary,
      mentors: k.mentorCount,
      about: '',
      depts: k.departments.map((d) => [d, 0] as const),
      generic: '',
      real: [],
      universities: k.universities,
    })),
    universities: (unis?.universities ?? []).map(({ slug, name }) => ({ slug, name })),
  };
}

export async function getFacultyPage(
  slug: string,
): Promise<{ faculty: Faculty; offerings: FacultyOffering[]; sources: CatalogSources } | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const data = await get<{ kind: ApiKind }>(`/catalog/faculty-kinds/${slug}`);
  if (!data) return null;
  const k = data.kind;
  const faculty: Faculty = {
    id: k.slug,
    name: k.name,
    full: k.fullName,
    icon: k.icon as IconName,
    cat: CATEGORY[k.category],
    years: k.studyYears,
    desc: k.summary,
    mentors: k.mentorCount,
    about: k.about,
    depts: k.departments.map((d) => [d.name, d.mentorCount] as const),
    generic: k.genericInfo,
    real: k.insights,
  };
  return { faculty, offerings: k.faculties, sources: k.sources };
}

// ---------- faculty search and one faculty's page (Phase 11c) ----------

export interface SearchParams {
  q?: string | undefined;
  governorate?: string | undefined;
  university?: string | undefined;
  category?: ApiCategory | undefined;
  type?: UniversityType | undefined;
  page?: number | undefined;
}

export interface FacultyHit {
  id: string;
  name: string;
  logo: string | null;
  city: string | null;
  governorate: string | null;
  university: { slug: string; name: string; type: UniversityType };
  kind: { slug: string; name: string; icon: string; category: ApiCategory };
  accreditation: { status: FacultyOffering['accreditation']['status']; expiresAt: string | null };
  cutoff: { year: number; track: string; minScore: number; maxScore: number } | null;
  mentorCount: number;
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  results: FacultyHit[];
  facets: {
    governorates: { name: string; count: number }[];
    universities: { slug: string; name: string; type: UniversityType; count: number }[];
    categories: { category: ApiCategory; count: number }[];
    types: { type: UniversityType; count: number }[];
  };
}

export interface CollegePage {
  id: string;
  name: string;
  logo: string | null;
  city: string | null;
  governorate: string | null;
  website: string | null;
  about: string | null;
  university: { slug: string; name: string; type: UniversityType; logo: string | null };
  kind: {
    slug: string;
    name: string;
    fullName: string;
    icon: string;
    category: ApiCategory;
    studyYears: number;
    summary: string;
    about: string;
  };
  accreditation: {
    status: FacultyOffering['accreditation']['status'];
    accreditedAt: string | null;
    expiresAt: string | null;
    programmes: { name: string; status: string; expiresAt: string }[];
  };
  cutoffs: { year: number; phase: number; track: string; minScore: number; maxScore: number }[];
  departments: { name: string; mentorCount: number }[];
  departmentsSource: string | null;
  mentorCount: number;
  sourceUrl: string | null;
  verifiedAt: string | null;
  sources: CatalogSources;
}

/** Query string for /catalog/faculties and /explore (same names on both). */
export function searchQuery(p: SearchParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p))
    if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) qs.set(k, String(v));
  return qs.toString();
}

/** Server side: first page for /explore (search engines and shared links see real results). */
export async function searchFacultiesServer(p: SearchParams): Promise<SearchResponse> {
  const res = await fetch(`${API}/catalog/faculties?${searchQuery(p)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`catalog search → ${res.status}`);
  return ((await res.json()) as { data: SearchResponse }).data;
}

/** Browser side, through the same-origin proxy. */
export async function searchFaculties(
  p: SearchParams,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const res = await fetch(`/api/v1/catalog/faculties?${searchQuery(p)}`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`catalog search → ${res.status}`);
  return ((await res.json()) as { data: SearchResponse }).data;
}

export async function getCollegePage(id: string): Promise<CollegePage | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const data = await get<{ faculty: CollegePage }>(`/catalog/faculties/${id}`);
  return data?.faculty ?? null;
}
