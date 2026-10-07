'use client';

import {
  GOVERNORATES,
  MAX_STUDENT_INTERESTS,
  SCHOOL_YEARS,
  SCHOOL_YEAR_LABELS,
  STUDENT_TRACKS,
  STUDENT_TRACK_LABELS,
  type StudentTrack,
} from '@sabeq/types';
import { FieldError } from '@sabeq/ui';
import { useState, type FormEvent } from 'react';
import { Field, Select } from '@/components/form';
import { ApiError } from '@/lib/api';
import { updateProfile, type Profile } from '@/lib/account';
import { FACULTIES } from '@/lib/mock/data';

type Errors = Partial<
  Record<'fullName' | 'track' | 'schoolYear' | 'governorate' | 'interests' | 'form', string>
>;

/**
 * Name for everyone; track, school year, governorate and faculty interests for students.
 * Used by the first-login step (/welcome) and the account page.
 */
export function ProfileForm({
  profile,
  submitLabel,
  onSaved,
}: {
  profile: Profile;
  submitLabel: string;
  onSaved: (p: Profile) => void | Promise<void>;
}) {
  const isStudent = profile.role === 'student';
  const s = profile.student;
  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [track, setTrack] = useState<StudentTrack | ''>(s?.track ?? '');
  const [year, setYear] = useState<number | null>(s?.schoolYear ?? null);
  const [governorate, setGovernorate] = useState(s?.governorate ?? '');
  const [interests, setInterests] = useState<string[]>(s?.interests ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    const name = fullName.replace(/\s+/g, ' ').trim();
    if (name.length < 2) e.fullName = 'اكتب اسمك (حرفين على الأقل).';
    if (isStudent && !track) e.track = 'اختار الشعبة.';
    if (isStudent && !year) e.schoolYear = 'اختار الصف.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const saved = await updateProfile({
        fullName: fullName.replace(/\s+/g, ' ').trim(),
        ...(isStudent
          ? { track: track || null, schoolYear: year, governorate: governorate || null, interests }
          : {}),
      });
      await onSaved(saved);
    } catch (err) {
      const api = err instanceof ApiError ? err : null;
      setErrors({ ...(api?.fields ?? {}), form: api?.message ?? 'ما قدرناش نحفظ. جرّب تاني.' });
    } finally {
      setBusy(false);
    }
  }

  const toggleInterest = (id: string) =>
    setInterests((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= MAX_STUDENT_INTERESTS
          ? cur
          : [...cur, id],
    );

  return (
    <form className="view" onSubmit={(e) => void submit(e)} noValidate>
      <Field id="pf-name" label="اسمك" error={errors.fullName}>
        <input
          className="sb-input"
          id="pf-name"
          autoComplete="name"
          placeholder="مثلًا: ملك أشرف"
          value={fullName}
          maxLength={60}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? 'pf-name-err' : undefined}
          onChange={(e) => setFullName(e.target.value)}
        />
      </Field>

      {isStudent ? (
        <>
          <div className="sb-field">
            <span className="sb-label" id="pf-track-label">
              الشعبة
            </span>
            <div className="chips-row" role="group" aria-labelledby="pf-track-label">
              {STUDENT_TRACKS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="sb-chip sb-chip--sm"
                  aria-pressed={track === t}
                  onClick={() => setTrack(t)}
                >
                  {STUDENT_TRACK_LABELS[t]}
                </button>
              ))}
            </div>
            {errors.track ? <FieldError>{errors.track}</FieldError> : null}
          </div>

          <div className="two">
            <div className="sb-field">
              <span className="sb-label" id="pf-year-label">
                الصف
              </span>
              <div className="chips-row" role="group" aria-labelledby="pf-year-label">
                {SCHOOL_YEARS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className="sb-chip sb-chip--sm"
                    aria-pressed={year === y}
                    onClick={() => setYear(y)}
                  >
                    {SCHOOL_YEAR_LABELS[y]}
                  </button>
                ))}
              </div>
              {errors.schoolYear ? <FieldError>{errors.schoolYear}</FieldError> : null}
            </div>
            <Field id="pf-gov" label="المحافظة (اختياري)" error={errors.governorate}>
              <Select
                id="pf-gov"
                value={governorate}
                options={GOVERNORATES}
                error={errors.governorate}
                onChange={setGovernorate}
              />
            </Field>
          </div>

          <div className="sb-field">
            <span className="sb-label" id="pf-int-label">
              كليات مهتم بيها (اختياري، لحد {MAX_STUDENT_INTERESTS})
            </span>
            <div className="chips-row" role="group" aria-labelledby="pf-int-label">
              {FACULTIES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="sb-chip sb-chip--sm"
                  aria-pressed={interests.includes(f.id)}
                  disabled={!interests.includes(f.id) && interests.length >= MAX_STUDENT_INTERESTS}
                  onClick={() => toggleInterest(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            {errors.interests ? <FieldError>{errors.interests}</FieldError> : null}
          </div>
        </>
      ) : null}

      {errors.form ? (
        <p className="sb-small" role="alert" style={{ color: 'var(--error)' }}>
          {errors.form}
        </p>
      ) : null}

      <div>
        <button type="submit" className="sb-btn sb-btn--primary sb-btn--lg" aria-busy={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
