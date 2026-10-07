/**
 * What a mentor application holds (`mentor_applications.payload`). Drafts accept any subset; submit
 * requires everything (decision 2026-10-07: graduates, teaching assistants and professors only;
 * one base price 100–500 EGP).
 */
import { z } from 'zod';

export const WEEKDAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export const MENTOR_KINDS = ['graduate', 'teaching_assistant', 'professor'] as const;
export const PRICE_EGP = { min: 100, max: 500, step: 10 } as const;

const thisYear = new Date().getUTCFullYear();

export const payloadFields = {
  kind: z.enum(MENTOR_KINDS, { error: 'اختار صفتك.' }),
  universitySlug: z.string({ error: 'اختار الجامعة.' }).min(1, 'اختار الجامعة.').max(60),
  facultyId: z.uuid({ error: 'اختار الكلية.' }),
  major: z
    .string({ error: 'اكتب القسم أو التخصص.' })
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(2, 'اكتب القسم أو التخصص.').max(120, 'اكتب 120 حرف بالكتير.')),
  graduationYear: z
    .number({ error: 'اختار سنة التخرج.' })
    .int()
    .min(1960, 'سنة التخرج مش مظبوطة.')
    .max(thisYear, 'سنة التخرج مش مظبوطة.'),
  basePriceEgp: z
    .number({ error: 'حدد السعر.' })
    .int()
    .min(PRICE_EGP.min, `السعر من ${PRICE_EGP.min} لـ ${PRICE_EGP.max} ج.م.`)
    .max(PRICE_EGP.max, `السعر من ${PRICE_EGP.min} لـ ${PRICE_EGP.max} ج.م.`)
    .refine((n) => n % PRICE_EGP.step === 0, `السعر بيزيد ${PRICE_EGP.step} ج.م كل مرة.`),
  days: z
    .array(z.enum(WEEKDAYS))
    .max(7)
    .transform((d) => WEEKDAYS.filter((w) => d.includes(w))),
  topics: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(500, 'اكتب 500 حرف بالكتير.')),
};

/** PUT body: any subset of the payload, plus the applicant's name (stored on the user). */
export const draftSchema = z
  .object({
    fullName: z
      .string({ error: 'اكتب اسمك.' })
      .transform((s) => s.replace(/\s+/g, ' ').trim())
      .pipe(
        z
          .string()
          .max(60, 'الاسم طويل.')
          .regex(/^[\p{L}\p{M}' .-]+$/u, 'الاسم يكون حروف بس.')
          .refine((s) => s.split(' ').length >= 2, 'اكتب اسمك الأول واسم العيلة على الأقل.'),
      )
      .optional(),
    kind: payloadFields.kind.optional(),
    universitySlug: payloadFields.universitySlug.optional(),
    facultyId: payloadFields.facultyId.optional(),
    major: payloadFields.major.optional(),
    graduationYear: payloadFields.graduationYear.nullable().optional(),
    basePriceEgp: payloadFields.basePriceEgp.optional(),
    days: payloadFields.days.optional(),
    topics: payloadFields.topics.optional(),
  })
  .strict();

export type DraftInput = z.output<typeof draftSchema>;
export type Payload = Partial<Omit<DraftInput, 'fullName'>>;

/** Everything a submitted application must have. Professors may leave the graduation year empty. */
export const submitSchema = z
  .object({
    kind: payloadFields.kind,
    universitySlug: payloadFields.universitySlug,
    facultyId: payloadFields.facultyId,
    major: payloadFields.major,
    graduationYear: payloadFields.graduationYear.nullable().optional(),
    basePriceEgp: payloadFields.basePriceEgp,
    days: payloadFields.days.refine((d) => d.length > 0, 'اختار يوم واحد على الأقل.'),
    topics: payloadFields.topics.optional(),
  })
  .superRefine((p, ctx) => {
    if (p.kind !== 'professor' && (p.graduationYear === null || p.graduationYear === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['graduationYear'], message: 'اختار سنة التخرج.' });
    }
  });

/** Upload slots. The credential slot is a degree for graduates, proof of employment otherwise. */
export const UPLOAD_KINDS = ['credential', 'national_id_front'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
