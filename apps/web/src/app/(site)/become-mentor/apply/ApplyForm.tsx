'use client';

import { formatEgyptianMobile } from '@sabeq/utils';
import { Banner, FieldError, Icon, Stepper, SuccessRing, cx } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crumb } from '@/components/Crumb';
import { Field, Select } from '@/components/form';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  MENTOR_KIND_LABELS,
  WEEKDAYS,
  getApplication,
  getUniversities,
  saveApplication,
  submitApplication,
  uploadDocument,
  type Application,
  type ApplicationDocument,
  type CatalogUniversity,
  type MentorKind,
  type Weekday,
} from '@/lib/mentor-application';
import { useSignedIn } from '@/lib/use-signed-in';

const STEPS = ['بياناتك', 'دراستك', 'التوثيق', 'الجلسات', 'مراجعة'];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1979 }, (_, i) => String(THIS_YEAR - i));
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

type Slot = 'credential' | 'national_id_front';
type FieldKey =
  | 'fullName'
  | 'kind'
  | 'universitySlug'
  | 'facultyId'
  | 'major'
  | 'graduationYear'
  | 'credential'
  | 'national_id_front'
  | 'basePriceEgp'
  | 'days'
  | 'topics'
  | 'form';
type Errors = Partial<Record<FieldKey, string>>;

/** Which wizard step owns each field — server errors jump back to the first one affected. */
const STEP_OF: Record<Exclude<FieldKey, 'form'>, number> = {
  fullName: 0,
  kind: 0,
  universitySlug: 1,
  facultyId: 1,
  major: 1,
  graduationYear: 1,
  credential: 2,
  national_id_front: 2,
  basePriceEgp: 3,
  days: 3,
  topics: 3,
};

interface Form {
  fullName: string;
  kind: MentorKind | '';
  uni: string;
  fac: string;
  major: string;
  year: string;
  price: number;
  days: Weekday[];
  topics: string;
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} ميجا`
    : `${Math.ceil(bytes / 1024)} ك.ب`;
const typeLabel = (mime: string) => (mime === 'application/pdf' ? 'PDF' : 'صورة');

function errorsFrom(err: unknown): Errors {
  if (!(err instanceof ApiError)) return { form: 'حصلت مشكلة. جرّب تاني.' };
  const out: Errors = { ...(err.fields as Errors) };
  if (err.fields.file) out.credential = err.fields.file;
  if (!Object.keys(err.fields).length) out.form = err.message;
  return out;
}

/**
 * Mentor application — 5 steps (prototype `P.apply`), saved to the API on every step (Phase 09).
 * Documents upload as soon as they are picked and are stored encrypted.
 */
export function ApplyForm() {
  const user = useSignedIn('/become-mentor/apply');
  const { refresh } = useAuth();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [unis, setUnis] = useState<CatalogUniversity[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'mentor') return;
    Promise.all([getApplication(), getUniversities()])
      .then(([a, u]) => {
        setApp(a);
        setUnis(u);
      })
      .catch(() => setLoadError(true));
  }, [user]);

  const shell = (children: React.ReactNode, current = 0) => (
    <section className="sb-container page-body" style={{ maxWidth: 820, paddingTop: 28 }}>
      <Crumb items={[{ label: 'كن مرشدًا', href: '/become-mentor' }, { label: 'التقديم' }]} />
      <h1 className="sb-h2" style={{ margin: '12px 0 20px' }}>
        قدّم كمرشد
      </h1>
      <Stepper steps={STEPS} current={current} />
      <div className="sb-card ap-panel">{children}</div>
    </section>
  );

  if (!user) return <div className="page-body" aria-busy="true" />;

  if (user.role !== 'mentor') {
    return shell(
      <div className="done-ok">
        <h2 className="sb-h2" style={{ fontSize: 26 }}>
          حسابك حساب طالب
        </h2>
        <p className="sb-lead" style={{ maxWidth: 460 }}>
          كل حساب ليه دور واحد. عشان تقدّم كمرشد، اخرج وادخل برقم تاني واختار «أنا مرشد».
        </p>
        <Link className="sb-btn sb-btn--primary" href="/account">
          حسابي
        </Link>
      </div>,
    );
  }

  if (loadError) {
    return shell(
      <Banner kind="error" title="ما قدرناش نجيب طلبك">
        حدّث الصفحة وجرّب تاني.
      </Banner>,
    );
  }
  if (app === undefined) return shell(<div aria-busy="true" style={{ minHeight: 320 }} />);

  if (app && (app.status === 'submitted' || app.status === 'under_review')) {
    return shell(<Submitted name={user.fullName} phone={user.phone} />, 5);
  }
  if (app?.status === 'approved') {
    return shell(
      <div className="done-ok">
        <SuccessRing />
        <h2 className="sb-h2" style={{ fontSize: 28 }}>
          اتقبلت كمرشد
        </h2>
        <p className="sb-lead">بروفايلك هيظهر للطلاب قريب.</p>
        <Link className="sb-btn sb-btn--primary" href="/">
          رجوع للرئيسية
        </Link>
      </div>,
      5,
    );
  }

  return (
    <Wizard
      key={app?.id ?? 'new'}
      initial={app}
      unis={unis}
      fullName={user.fullName ?? ''}
      phone={user.phone}
      shell={shell}
      onSubmitted={async (a) => {
        setApp(a);
        await refresh();
      }}
    />
  );
}

function Submitted({ name, phone }: { name: string | null; phone: string }) {
  return (
    <div className="done-ok">
      <SuccessRing />
      <h2 className="sb-h2" style={{ fontSize: 28 }}>
        طلبك وصل
      </h2>
      <p className="sb-lead" style={{ maxWidth: 460 }}>
        شكرًا{name ? ` يا ${name.split(' ')[0]}` : ''}. هنراجع المستندات ونكلمك خلال يومين عمل على{' '}
        <span className="sb-num">{formatEgyptianMobile(phone).replace(/\s/g, '')}</span>.
      </p>
      <Link className="sb-btn sb-btn--primary" href="/">
        رجوع للرئيسية
      </Link>
    </div>
  );
}

function Wizard({
  initial,
  unis,
  fullName,
  phone,
  shell,
  onSubmitted,
}: {
  initial: Application | null;
  unis: CatalogUniversity[];
  fullName: string;
  phone: string;
  shell: (children: React.ReactNode, current?: number) => React.ReactNode;
  onSubmitted: (a: Application) => Promise<void>;
}) {
  const p = initial?.payload ?? {};
  const rejected = initial?.status === 'rejected';
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({
    fullName,
    kind: rejected ? '' : (p.kind ?? ''),
    uni: rejected ? '' : (p.universitySlug ?? ''),
    fac: rejected ? '' : (p.facultyId ?? ''),
    major: rejected ? '' : (p.major ?? ''),
    year: !rejected && p.graduationYear ? String(p.graduationYear) : '',
    price: (!rejected && p.basePriceEgp) || 250,
    days: rejected ? [] : (p.days ?? []),
    topics: rejected ? '' : (p.topics ?? ''),
  });
  const [docs, setDocs] = useState<ApplicationDocument[]>(
    rejected ? [] : (initial?.documents ?? []),
  );
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inputs = useRef<Record<Slot, HTMLInputElement | null>>({
    credential: null,
    national_id_front: null,
  });

  const uni = unis.find((u) => u.slug === f.uni);
  const faculty = uni?.faculties.find((x) => x.id === f.fac);
  const docFor = (slot: Slot) =>
    docs.find((d) =>
      slot === 'national_id_front'
        ? d.kind === 'national_id_front'
        : d.kind === 'graduation_certificate' || d.kind === 'employment_proof',
    );
  const credentialLabel =
    f.kind === 'graduate'
      ? 'شهادة التخرج'
      : f.kind
        ? 'إثبات التعيين (خطاب من الكلية أو كارنيه العمل)'
        : 'شهادة التخرج أو إثبات التعيين';

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    const fieldKey =
      (
        {
          uni: 'universitySlug',
          fac: 'facultyId',
          year: 'graduationYear',
          price: 'basePriceEgp',
        } as Record<string, FieldKey>
      )[key] ?? (key as FieldKey);
    // Typing into a field clears its error (prototype behaviour).
    setErrors((prev) => {
      if (!(fieldKey in prev) && !prev.form) return prev;
      return Object.fromEntries(
        Object.entries(prev).filter(([k]) => k !== fieldKey && k !== 'form'),
      ) as Errors;
    });
  };

  function validate(): Errors {
    const e: Errors = {};
    if (step === 0) {
      if (f.fullName.trim().split(/\s+/).length < 2)
        e.fullName = 'اكتب اسمك الأول واسم العيلة على الأقل.';
      if (!f.kind) e.kind = 'اختار صفتك.';
    }
    if (step === 1) {
      if (!f.uni) e.universitySlug = 'الخانة دي مطلوبة.';
      if (!f.fac) e.facultyId = 'الخانة دي مطلوبة.';
      if (f.major.trim().length < 2) e.major = 'الخانة دي مطلوبة.';
      if (!f.year && f.kind !== 'professor') e.graduationYear = 'الخانة دي مطلوبة.';
    }
    if (step === 2) {
      if (!docFor('credential')) e.credential = `ارفع ${credentialLabel}.`;
      if (!docFor('national_id_front')) e.national_id_front = 'ارفع صورة البطاقة (الوش).';
    }
    if (step === 3 && !f.days.length) e.days = 'اختار يوم واحد على الأقل.';
    return e;
  }

  const patchForStep = () => {
    if (step === 0) return { fullName: f.fullName, ...(f.kind ? { kind: f.kind } : {}) };
    if (step === 1)
      return {
        universitySlug: f.uni,
        facultyId: f.fac,
        major: f.major,
        graduationYear: f.year ? Number(f.year) : null,
      };
    if (step === 3) return { basePriceEgp: f.price, days: f.days, topics: f.topics };
    return null;
  };

  function showServerErrors(e: Errors) {
    setErrors(e);
    const steps = Object.keys(e)
      .filter((k): k is Exclude<FieldKey, 'form'> => k in STEP_OF)
      .map((k) => STEP_OF[k]);
    if (steps.length) setStep(Math.min(...steps));
  }

  async function next() {
    if (busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (step === 4) {
        const submitted = await submitApplication();
        setDone(true);
        await onSubmitted(submitted);
        return;
      }
      const patch = patchForStep();
      if (patch) await saveApplication(patch);
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showServerErrors(errorsFrom(err));
    } finally {
      setBusy(false);
    }
  }

  async function pick(slot: Slot, file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setErrors((prev) => ({ ...prev, [slot]: 'الملف أكبر من 10 ميجا.' }));
      return;
    }
    setUploading(slot);
    setErrors((prev) => ({ ...prev, [slot]: undefined }));
    try {
      // The credential's kind (degree / employment proof) follows the role chosen in step 1.
      if (slot === 'credential' && f.kind) await saveApplication({ kind: f.kind });
      const doc = await uploadDocument(slot, file);
      setDocs((prev) => [
        ...prev.filter((d) =>
          slot === 'national_id_front'
            ? d.kind !== 'national_id_front'
            : d.kind === 'national_id_front',
        ),
        doc,
      ]);
    } catch (err) {
      const e = errorsFrom(err);
      setErrors((prev) => ({ ...prev, [slot]: e.credential ?? e[slot] ?? e.form }));
    } finally {
      setUploading(null);
      const input = inputs.current[slot];
      if (input) input.value = '';
    }
  }

  const facultyOptions = useMemo(
    () => (uni?.faculties ?? []).map((x) => [x.id, x.name] as const),
    [uni],
  );

  if (done) return shell(<Submitted name={f.fullName} phone={phone} />, 5);

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
        onClick={() => void next()}
      >
        {step === 4 ? 'ابعت الطلب' : 'التالي'}{' '}
        <span className="sb-arrow i18">
          <Icon name="arrow" />
        </span>
      </button>
    </div>
  );

  const formError = errors.form ? (
    <Banner kind="error" title="ما اتحفظش">
      {errors.form}
    </Banner>
  ) : null;

  return shell(
    <div className="view" key={step}>
      {initial?.status === 'changes_requested' && step === 0 ? (
        <Banner kind="warning" title="محتاجين تعديل بسيط">
          {initial.decisionNote ?? 'راجع بياناتك وابعت الطلب تاني.'}
        </Banner>
      ) : null}
      {rejected && step === 0 ? (
        <Banner kind="info" title="طلبك اللي فات ما اتقبلش">
          {initial.decisionNote ? `${initial.decisionNote} ` : ''}تقدر تقدّم من جديد.
        </Banner>
      ) : null}

      {step === 0 ? (
        <>
          <h2 className="sb-h3">عرّفنا بيك</h2>
          <Field id="name" label="الاسم بالكامل" error={errors.fullName}>
            <input
              className="sb-input"
              id="name"
              autoComplete="name"
              placeholder="زي ما هو في البطاقة"
              value={f.fullName}
              maxLength={60}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? 'name-err' : undefined}
              onChange={(e) => update('fullName', e.target.value)}
            />
          </Field>
          <Field id="phone" label="رقم الموبايل" error={undefined} hint="ده الرقم اللي بتدخل بيه.">
            <input
              className="sb-input"
              id="phone"
              dir="ltr"
              style={{ textAlign: 'right' }}
              value={formatEgyptianMobile(phone)}
              readOnly
              aria-readonly="true"
            />
          </Field>
          <div className="sb-field">
            <span className="sb-label" id="kind-label">
              صفتك
            </span>
            <div className="chips-row" role="group" aria-labelledby="kind-label">
              {(Object.keys(MENTOR_KIND_LABELS) as MentorKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="sb-chip sb-chip--sm"
                  aria-pressed={f.kind === k}
                  onClick={() => update('kind', k)}
                >
                  {MENTOR_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            {errors.kind ? <FieldError>{errors.kind}</FieldError> : null}
          </div>
          {formError}
          {nav}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h2 className="sb-h3">درست فين؟</h2>
          <div className="two">
            <Field id="uni" label="الجامعة" error={errors.universitySlug}>
              <Select
                id="uni"
                value={f.uni}
                options={unis.map((u) => [u.slug, u.name] as const)}
                error={errors.universitySlug}
                onChange={(v) => {
                  update('uni', v);
                  update('fac', '');
                }}
              />
            </Field>
            <Field id="fac" label="الكلية" error={errors.facultyId}>
              <Select
                id="fac"
                value={f.fac}
                options={facultyOptions}
                error={errors.facultyId}
                placeholder={f.uni ? 'اختار' : 'اختار الجامعة الأول'}
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
                value={f.major}
                maxLength={120}
                aria-invalid={Boolean(errors.major)}
                aria-describedby={errors.major ? 'major-err' : undefined}
                onChange={(e) => update('major', e.target.value)}
              />
            </Field>
            <Field
              id="year"
              label={f.kind === 'professor' ? 'سنة التخرج (اختياري)' : 'سنة التخرج'}
              error={errors.graduationYear}
            >
              <Select
                id="year"
                value={f.year}
                options={YEARS}
                error={errors.graduationYear}
                onChange={(v) => update('year', v)}
              />
            </Field>
          </div>
          {formError}
          {nav}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h2 className="sb-h3">ارفع المستندات</h2>
          <p className="sb-small">بنستخدمها للتوثيق بس، ومحدش من الطلاب بيشوفها. بتتحفظ مشفّرة.</p>
          {(
            [
              ['credential', credentialLabel],
              ['national_id_front', 'بطاقة الرقم القومي (الوش)'],
            ] as const
          ).map(([slot, label]) => {
            const doc = docFor(slot);
            const isUploading = uploading === slot;
            return (
              <div key={slot}>
                <input
                  ref={(el) => {
                    inputs.current[slot] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => void pick(slot, e.target.files?.[0])}
                />
                <button
                  type="button"
                  className={cx('drop', doc && !isUploading && 'ok')}
                  aria-busy={isUploading}
                  aria-describedby={errors[slot] ? `${slot}-err` : undefined}
                  disabled={uploading !== null}
                  onClick={() => inputs.current[slot]?.click()}
                >
                  <span className="i22">
                    <Icon name={doc && !isUploading ? 'check' : 'plus'} />
                  </span>
                  <span className="g">
                    <b>{label}</b>
                    <span className="sb-caption">
                      {isUploading
                        ? 'بيترفع…'
                        : doc
                          ? `اترفع · ${typeLabel(doc.mimeType)} · ${sizeLabel(doc.sizeBytes)}`
                          : 'PDF أو صورة · لحد 10 ميجا'}
                    </span>
                  </span>
                  <span className="sb-small">{doc ? 'تغيير' : 'اختار ملف'}</span>
                </button>
                {errors[slot] ? <FieldError id={`${slot}-err`}>{errors[slot]}</FieldError> : null}
              </div>
            );
          })}
          {formError}
          {nav}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h2 className="sb-h3">الجلسات</h2>
          <div className="sb-field">
            <label className="sb-label" htmlFor="pp">
              سعر جلسة 45 دقيقة: <span className="sb-num">{f.price}</span> ج.م
            </label>
            <input
              type="range"
              id="pp"
              min={100}
              max={500}
              step={10}
              value={f.price}
              style={{ accentColor: 'var(--primary)' }}
              aria-describedby="pp-hint"
              onChange={(e) => update('price', Number(e.target.value))}
            />
            <span className="sb-hint" id="pp-hint">
              جلسة المقارنة بـ{' '}
              <span className="sb-num">{Math.round((f.price * 1.3) / 10) * 10}</span> ج.م، والمكالمة
              السريعة بـ <span className="sb-num">{Math.round((f.price * 0.5) / 10) * 10}</span>{' '}
              ج.م.
            </span>
            {errors.basePriceEgp ? <FieldError>{errors.basePriceEgp}</FieldError> : null}
          </div>
          <div className="sb-field">
            <span className="sb-label" id="days-label">
              الأيام المتاحة
            </span>
            <div className="chips-row" role="group" aria-labelledby="days-label">
              {WEEKDAYS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="sb-chip sb-chip--sm"
                  aria-pressed={f.days.includes(key)}
                  onClick={() =>
                    update(
                      'days',
                      f.days.includes(key) ? f.days.filter((d) => d !== key) : [...f.days, key],
                    )
                  }
                >
                  {label}
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
              value={f.topics}
              maxLength={500}
              onChange={(e) => update('topics', e.target.value)}
            />
            {errors.topics ? <FieldError>{errors.topics}</FieldError> : null}
          </div>
          {formError}
          {nav}
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h2 className="sb-h3">راجع طلبك</h2>
          <div className="sb-summary" style={{ padding: 0 }}>
            {(
              [
                ['الاسم', f.fullName],
                [
                  'الموبايل',
                  <span key="p" className="sb-num">
                    {formatEgyptianMobile(phone).replace(/\s/g, '')}
                  </span>,
                ],
                ['الصفة', f.kind ? MENTOR_KIND_LABELS[f.kind] : ''],
                ['الدراسة', `${f.major} · ${faculty?.name ?? ''} · ${uni?.name ?? ''}`],
                ['التخرج', f.year || '—'],
                ['المستندات', `${docs.length} ملف`],
                [
                  'السعر',
                  <span key="pr">
                    <span className="sb-num">{f.price}</span> ج.م
                  </span>,
                ],
                [
                  'الأيام',
                  WEEKDAYS.filter(([k]) => f.days.includes(k))
                    .map(([, l]) => l)
                    .join('، '),
                ],
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
          {formError}
          {nav}
        </>
      ) : null}
    </div>,
    step,
  );
}
