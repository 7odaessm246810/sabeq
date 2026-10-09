/** University and faculty vocabulary, shared by the API (validation), admin and web (labels). */

export const UNIVERSITY_TYPES = [
  'public',
  'azhar',
  'private',
  'national',
  'technological',
  'international',
] as const;
export type UniversityType = (typeof UNIVERSITY_TYPES)[number];

export const UNIVERSITY_TYPE_LABELS: Record<UniversityType, string> = {
  public: 'حكومية',
  azhar: 'الأزهر',
  private: 'خاصة',
  national: 'أهلية',
  technological: 'تكنولوجية',
  international: 'دولية',
};

export const FACULTY_CATEGORIES = [
  'medical',
  'engineering',
  'science',
  'literary',
  'arts',
] as const;
export type FacultyCategory = (typeof FACULTY_CATEGORIES)[number];

export const FACULTY_CATEGORY_LABELS: Record<FacultyCategory, string> = {
  medical: 'طبي',
  engineering: 'هندسي',
  science: 'علمي',
  literary: 'أدبي',
  arts: 'فني',
};

export const ACCREDITATION_STATUSES = [
  'accredited',
  'conditional',
  'not_accredited',
  'unknown',
] as const;
export type AccreditationStatus = (typeof ACCREDITATION_STATUSES)[number];

export const ACCREDITATION_LABELS: Record<AccreditationStatus, string> = {
  accredited: 'معتمدة من هيئة الجودة',
  conditional: 'اعتماد مشروط',
  not_accredited: 'مش معتمدة حاليًا',
  unknown: 'مش معروف',
};

/** Logos: PNG, JPEG or WebP up to 512 KB (no SVG — it can carry scripts). */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 512 * 1024;
