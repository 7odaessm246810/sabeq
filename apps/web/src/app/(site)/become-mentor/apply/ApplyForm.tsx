'use client';

import { Banner, FieldError, Icon, Stepper, SuccessRing, cx } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Crumb } from '@/components/Crumb';
import { FACULTIES, UNIVERSITIES } from '@/lib/mock/data';

const STEPS = ['بياناتك', 'دراستك', 'التوثيق', 'الجلسات', 'مراجعة'];
const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const YEARS = ['2026', '2025', '2024', '2023', '2022', 'قبل 2022'];
const DOCS = [
  ['شهادة التخرج أو إثبات التعيين', 'shahada_takharog.pdf · 1.2 ميجا'],
  ['بطاقة الرقم القومي (الوش)', 'national_id.jpg · 0.8 ميجا'],
] as const;

interface Application {
  name: string;
  phone: string;
  uni: string;
  fac: string;
  major: string;
  year: string;
  files: (string | null)[];
  price: number;
  days: Record<string, boolean>;
  topics: string;
}

type Errors = Partial<
  Record<'name' | 'phone' | 'uni' | 'fac' | 'major' | 'year' | 'files' | 'days', string>
>;

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cx('sb-field', error && 'sb-field--error')}>
      <label className="sb-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
    </div>
  );
}

function Select({
  id,
  value,
  options,
  error,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly string[];
  error: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sb-select-wrap">
      <select
        className="sb-input sb-select"
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">اختار</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <span>
        <Icon name="chevron" />
      </span>
    </div>
  );
}

/**
 * Mentor application — 5 steps (prototype `P.apply`). Phase 09 posts it to the API and uploads the
 * documents to the private bucket; here everything stays in the browser.
 */
export function ApplyForm() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Application>({
    name: '',
    phone: '',
    uni: '',
    fac: '',
    major: '',
    year: '',
    files: [null, null],
    price: 250,
    days: {},
    topics: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const update = <K extends keyof Application>(key: K, value: Application[K]) => {
    setA((prev) => ({ ...prev, [key]: value }));
    // Typing into a field clears its error (prototype behaviour).
    setErrors((prev) =>
      key in prev
        ? (Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)) as Errors)
        : prev,
    );
  };

  function validate(): Errors {
    const e: Errors = {};
    if (step === 0) {
      if (a.name.trim().split(/\s+/).length < 2) e.name = 'اكتب اسمك الأول واسم العيلة على الأقل.';
      if (!/^01\d{9}$/.test(a.phone.replace(/\s/g, '')))
        e.phone = 'الرقم لازم يكون 11 رقم ويبدأ بـ 01.';
    }
    if (step === 1) {
      for (const k of ['uni', 'fac', 'major', 'year'] as const) {
        if (!a[k].trim()) e[k] = 'الخانة دي مطلوبة.';
      }
    }
    if (step === 2 && a.files.filter(Boolean).length < 2)
      e.files = 'محتاجين الملفين عشان نقدر نوثّقك.';
    if (step === 3 && !Object.values(a.days).some(Boolean)) e.days = 'اختار يوم واحد على الأقل.';
    return e;
  }

  function next() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step === 4) {
      setBusy(true);
      timer.current = setTimeout(() => {
        setBusy(false);
        setStep(5);
      }, 900);
      return;
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const nav = (
    <div className="nav-b">
      {step ? (
        <button
          type="button"
          className="sb-btn sb-btn--ghost"
          onClick={() => setStep((s) => s - 1)}
        >
          <Icon name="chevR" />
          رجوع
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        className="sb-btn sb-btn--primary sb-btn--lg"
        aria-busy={busy}
        onClick={next}
      >
        {step === 4 ? 'ابعت الطلب' : 'التالي'}{' '}
        <span className="sb-arrow i18">
          <Icon name="arrow" />
        </span>
      </button>
    </div>
  );

  const selectedDays = WEEK.filter((d) => a.days[d]);

  return (
    <section className="sb-container page-body" style={{ maxWidth: 820, paddingTop: 28 }}>
      <Crumb items={[{ label: 'كن مرشدًا', href: '/become-mentor' }, { label: 'التقديم' }]} />
      <h1 className="sb-h2" style={{ margin: '12px 0 20px' }}>
        قدّم كمرشد
      </h1>
      <Stepper steps={STEPS} current={Math.min(step, 5)} />
      <div className="sb-card ap-panel">
        <div className="view" key={step}>
          {step === 0 ? (
            <>
              <h2 className="sb-h3">عرّفنا بيك</h2>
              <Field id="name" label="الاسم بالكامل" error={errors.name}>
                <input
                  className="sb-input"
                  id="name"
                  autoComplete="name"
                  placeholder="زي ما هو في البطاقة"
                  value={a.name}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-err' : undefined}
                  onChange={(e) => update('name', e.target.value)}
                />
              </Field>
              <Field id="phone" label="رقم الموبايل" error={errors.phone}>
                <input
                  className="sb-input"
                  id="phone"
                  autoComplete="tel-national"
                  placeholder="01x xxxx xxxx"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                  inputMode="numeric"
                  value={a.phone}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'phone-err' : undefined}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </Field>
              {nav}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="sb-h3">درست فين؟</h2>
              <div className="two">
                <Field id="uni" label="الجامعة" error={errors.uni}>
                  <Select
                    id="uni"
                    value={a.uni}
                    options={UNIVERSITIES}
                    error={errors.uni}
                    onChange={(v) => update('uni', v)}
                  />
                </Field>
                <Field id="fac" label="الكلية" error={errors.fac}>
                  <Select
                    id="fac"
                    value={a.fac}
                    options={FACULTIES.map((f) => f.full)}
                    error={errors.fac}
                    onChange={(v) => update('fac', v)}
                  />
                </Field>
              </div>
              <div className="two">
                <Field id="major" label="القسم / التخصص" error={errors.major}>
                  <input
                    className="sb-input"
                    id="major"
                    placeholder="مثلًا: هندسة الحاسبات"
                    value={a.major}
                    aria-invalid={Boolean(errors.major)}
                    aria-describedby={errors.major ? 'major-err' : undefined}
                    onChange={(e) => update('major', e.target.value)}
                  />
                </Field>
                <Field id="year" label="سنة التخرج" error={errors.year}>
                  <Select
                    id="year"
                    value={a.year}
                    options={YEARS}
                    error={errors.year}
                    onChange={(v) => update('year', v)}
                  />
                </Field>
              </div>
              {nav}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="sb-h3">ارفع المستندات</h2>
              <p className="sb-small">بنستخدمها للتوثيق بس، ومحدش من الطلاب بيشوفها.</p>
              {DOCS.map(([label, demoFile], i) => {
                const file = a.files[i];
                return (
                  <button
                    key={label}
                    type="button"
                    className={cx('drop', file && 'ok')}
                    onClick={() => {
                      const files = [...a.files];
                      files[i] = demoFile;
                      update('files', files);
                    }}
                  >
                    <span className="i22">
                      <Icon name={file ? 'check' : 'plus'} />
                    </span>
                    <span className="g">
                      <b>{label}</b>
                      <span className="sb-caption">{file ?? 'PDF أو صورة · لحد 10 ميجا'}</span>
                    </span>
                    <span className="sb-small">{file ? 'تغيير' : 'اختار ملف'}</span>
                  </button>
                );
              })}
              {errors.files ? (
                <Banner kind="error" title="ناقص مستند">
                  {errors.files}
                </Banner>
              ) : null}
              {nav}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2 className="sb-h3">الجلسات</h2>
              <div className="sb-field">
                <label className="sb-label" htmlFor="pp">
                  سعر جلسة 45 دقيقة: <span className="sb-num">{a.price}</span> ج.م
                </label>
                <input
                  type="range"
                  id="pp"
                  min={100}
                  max={500}
                  step={10}
                  value={a.price}
                  style={{ accentColor: 'var(--primary)' }}
                  aria-describedby="pp-hint"
                  onChange={(e) => update('price', Number(e.target.value))}
                />
                <span className="sb-hint" id="pp-hint">
                  متوسط السعر في كليتك: 240 ج.م
                </span>
              </div>
              <div className="sb-field">
                <span className="sb-label" id="days-label">
                  الأيام المتاحة
                </span>
                <div className="chips-row" role="group" aria-labelledby="days-label">
                  {WEEK.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="sb-chip sb-chip--sm"
                      aria-pressed={Boolean(a.days[d])}
                      onClick={() => update('days', { ...a.days, [d]: !a.days[d] })}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {errors.days ? <FieldError>{errors.days}</FieldError> : null}
              </div>
              <div className="sb-field">
                <label className="sb-label" htmlFor="tp">
                  بتحب تتكلم عن إيه؟
                </label>
                <textarea
                  className="sb-input"
                  id="tp"
                  style={{ height: 96, padding: '12px 14px' }}
                  placeholder="مثلًا: الإعدادي، الفرق بين الأقسام، التدريب"
                  value={a.topics}
                  onChange={(e) => update('topics', e.target.value)}
                />
              </div>
              {nav}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h2 className="sb-h3">راجع طلبك</h2>
              <div className="sb-summary" style={{ padding: 0 }}>
                {(
                  [
                    ['الاسم', a.name],
                    [
                      'الموبايل',
                      <span key="p" className="sb-num">
                        {a.phone}
                      </span>,
                    ],
                    ['الدراسة', `${a.major} · ${a.fac} · ${a.uni}`],
                    ['التخرج', a.year],
                    ['المستندات', `${a.files.filter(Boolean).length} ملف`],
                    [
                      'السعر',
                      <span key="pr">
                        <span className="sb-num">{a.price}</span> ج.م
                      </span>,
                    ],
                    ['الأيام', selectedDays.join('، ')],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="sb-summary-row">
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              <Banner kind="info" title="المراجعة بتاخد يومين عمل.">
                هنكلمك نحدد معاد المقابلة القصيرة.
              </Banner>
              {nav}
            </>
          ) : null}

          {step === 5 ? (
            <div className="done-ok">
              <SuccessRing />
              <h2 className="sb-h2" style={{ fontSize: 28 }}>
                طلبك وصل
              </h2>
              <p className="sb-lead" style={{ maxWidth: 460 }}>
                شكرًا يا {a.name.split(' ')[0]}. هنراجع المستندات ونكلمك خلال يومين عمل على{' '}
                <span className="sb-num">{a.phone}</span>.
              </p>
              <Link className="sb-btn sb-btn--primary" href="/">
                رجوع للرئيسية
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
