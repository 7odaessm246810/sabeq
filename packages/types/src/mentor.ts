/** Mentor vocabulary, shared by the API (validation), admin and web (labels). */

export const MENTOR_KINDS = ['graduate', 'teaching_assistant', 'professor'] as const;
export type MentorKind = (typeof MENTOR_KINDS)[number];

export const MENTOR_KIND_LABELS: Record<MentorKind, string> = {
  graduate: 'خريج',
  teaching_assistant: 'معيد',
  professor: 'عضو هيئة تدريس',
};

/** One base price per mentor (decision 2026-10-07), in whole pounds. */
export const MENTOR_PRICE_EGP = { min: 100, max: 500, step: 10 } as const;

export const SESSION_KINDS = ['consultation', 'comparison', 'quick_call'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/**
 * The three session types of the booking design. Prices derive from the base price:
 * comparison ×1.3 and quick call ×0.5, rounded to 10 EGP (docs/database.md).
 */
export const SESSION_TYPES: Record<
  SessionKind,
  { label: string; durationMin: number; medium: 'video' | 'audio'; multiplier: number }
> = {
  consultation: { label: 'جلسة استشارة', durationMin: 45, medium: 'video', multiplier: 1 },
  comparison: { label: 'مقارنة بين كليتين', durationMin: 60, medium: 'video', multiplier: 1.3 },
  quick_call: { label: 'مكالمة سريعة', durationMin: 20, medium: 'audio', multiplier: 0.5 },
};

/** Limits of what a mentor writes on their own profile. */
export const MENTOR_PROFILE_LIMITS = { bio: 1200, topics: 6, topic: 60 } as const;
