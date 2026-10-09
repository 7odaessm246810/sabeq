'use client';

import { GOVERNORATES, UNIVERSITY_TYPE_LABELS, UNIVERSITY_TYPES } from '@sabeq/types';
import { FieldError } from '@sabeq/ui';
import { useState, type FormEvent } from 'react';
import { Select } from '@/components/Select';
import { ApiError } from '@/lib/api';
import type { UniversityInput } from '@/lib/catalog';

const EMPTY: UniversityInput = {
  nameAr: '',
  nameEn: null,
  type: 'public',
  governorate: null,
  website: null,
  isActive: true,
};

/** Add or edit a university. Shows the API's per-field messages next to each field. */
export function UniversityForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
}: {
  initial?: UniversityInput;
  submitLabel: string;
  onSubmit: (input: UniversityInput) => Promise<unknown>;
}) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof UniversityInput>(k: K, v: UniversityInput[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.nameAr.trim().length < 2) {
      setErrors({ nameAr: 'اكتب اسم الجامعة.' });
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await onSubmit({
        ...f,
        nameEn: f.nameEn?.trim() || null,
        website: f.website?.trim() || null,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else setFormError('حصلت مشكلة. جرّب تاني.');
    } finally {
      setBusy(false);
    }
  }

  const text = (
    key: 'nameAr' | 'nameEn' | 'website',
    label: string,
    opts: { dir?: string; hint?: string } = {},
  ) => (
    <div className="sb-field">
      <label className="sb-label" htmlFor={`uni-${key}`}>
        {label}
      </label>
      <input
        id={`uni-${key}`}
        className="sb-input"
        dir={opts.dir}
        value={f[key] ?? ''}
        maxLength={key === 'website' ? 200 : 120}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `uni-${key}-err` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {opts.hint && !errors[key] ? <span className="sb-hint">{opts.hint}</span> : null}
      {errors[key] ? <FieldError id={`uni-${key}-err`}>{errors[key]}</FieldError> : null}
    </div>
  );

  return (
    <form className="adm-form" onSubmit={(e) => void submit(e)} noValidate>
      {text('nameAr', 'اسم الجامعة')}
      <div className="two-adm">
        {text('nameEn', 'الاسم بالإنجليزي (اختياري)', {
          dir: 'ltr',
          hint: 'بيتعمل منه رابط الجامعة.',
        })}
        {text('website', 'الموقع الرسمي (اختياري)', { dir: 'ltr', hint: 'https://…' })}
      </div>
      <div className="two-adm">
        <div className="sb-field">
          <label className="sb-label" htmlFor="uni-type">
            نوع الجامعة
          </label>
          <Select
            id="uni-type"
            value={f.type}
            placeholder="اختار"
            options={UNIVERSITY_TYPES.map((t) => [t, UNIVERSITY_TYPE_LABELS[t]] as const)}
            onChange={(v) => v && set('type', v as UniversityInput['type'])}
          />
          {errors.type ? <FieldError id="uni-type-err">{errors.type}</FieldError> : null}
        </div>
        <div className="sb-field">
          <label className="sb-label" htmlFor="uni-gov">
            المحافظة
          </label>
          <Select
            id="uni-gov"
            value={f.governorate ?? ''}
            placeholder="مش محددة"
            options={GOVERNORATES.map((g) => [g, g] as const)}
            onChange={(v) => set('governorate', v || null)}
          />
          {errors.governorate ? (
            <FieldError id="uni-gov-err">{errors.governorate}</FieldError>
          ) : null}
        </div>
      </div>
      <label className="adm-check">
        <input
          type="checkbox"
          checked={f.isActive}
          onChange={(e) => set('isActive', e.target.checked)}
        />
        ظاهرة في الموقع
      </label>
      {formError ? (
        <p className="sb-small adm-danger" role="alert">
          {formError}
        </p>
      ) : null}
      <div>
        <button type="submit" className="sb-btn sb-btn--primary" aria-busy={busy} disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
