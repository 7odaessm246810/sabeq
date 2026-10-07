/**
 * Student profile vocabulary, shared by the API (validation) and the web app (labels).
 * Track and school year only — scores are never stored (decision 2026-10-07).
 */

export const STUDENT_TRACKS = [
  'science_math',
  'science_bio',
  'literary',
  'azhar',
  'other',
] as const;
export type StudentTrack = (typeof STUDENT_TRACKS)[number];

export const STUDENT_TRACK_LABELS: Record<StudentTrack, string> = {
  science_math: 'علمي رياضة',
  science_bio: 'علمي علوم',
  literary: 'أدبي',
  azhar: 'أزهري',
  other: 'نظام تاني',
};

/** 1–3 = الصف الأول / الثاني / الثالث الثانوي. */
export const SCHOOL_YEARS = [1, 2, 3] as const;
export type SchoolYear = (typeof SCHOOL_YEARS)[number];

export const SCHOOL_YEAR_LABELS: Record<SchoolYear, string> = {
  1: 'أولى ثانوي',
  2: 'تانية ثانوي',
  3: 'تالتة ثانوي',
};

/** The 27 governorates of Egypt, as stored and displayed. */
export const GOVERNORATES = [
  'القاهرة',
  'الجيزة',
  'الإسكندرية',
  'القليوبية',
  'الدقهلية',
  'الشرقية',
  'الغربية',
  'المنوفية',
  'البحيرة',
  'كفر الشيخ',
  'دمياط',
  'بورسعيد',
  'الإسماعيلية',
  'السويس',
  'شمال سيناء',
  'جنوب سيناء',
  'الفيوم',
  'بني سويف',
  'المنيا',
  'أسيوط',
  'سوهاج',
  'قنا',
  'الأقصر',
  'أسوان',
  'البحر الأحمر',
  'الوادي الجديد',
  'مطروح',
] as const;
export type Governorate = (typeof GOVERNORATES)[number];

/** How many faculty kinds a student can follow on their profile. */
export const MAX_STUDENT_INTERESTS = 5;
