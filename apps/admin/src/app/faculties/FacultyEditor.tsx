'use client';

import {
  ACCREDITATION_LABELS,
  ACCREDITATION_STATUSES,
  GOVERNORATES,
  type AccreditationStatus,
} from '@sabeq/types';
import { Banner, FieldError, Icon, Modal, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { LogoField } from '@/components/LogoField';
import { Select } from '@/components/Select';
import { ApiError } from '@/lib/api';
import {
  addDepartment,
  createFaculty,
  deleteCutoff,
  deleteFaculty,
  getFaculty,
  getUniversity,
  listKinds,
  saveCutoff,
  updateDepartment,
  updateFaculty,
  type Cutoff,
  type FacultyDetail,
  type FacultyInput,
  type KindRow,
  type UniversityDetail,
} from '@/lib/catalog';

const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const TRACKS = [
  ['science_bio', 'علمي علوم'],
  ['science_math', 'علمي رياضة'],
  ['literary', 'أدبي'],
] as const;
const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.';

/** Add a faculty to a university (`universityId`) or edit one (`id`). */
export function FacultyEditor(props: { id?: string; universityId?: string }) {
  return (
    <AdminShell title={props.id ? 'تعديل كلية' : 'كلية جديدة'}>
      {(admin) =>
        admin.adminRole === 'super_admin' || admin.adminRole === 'support' ? (
          <Body {...props} />
        ) : (
          <Banner kind="warning" title="مش متاح">
            إدارة الجامعات والكليات للمدير والدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Body({ id, universityId }: { id?: string; universityId?: string }) {
  const toast = useToast();
  const router = useRouter();
  const [kinds, setKinds] = useState<KindRow[] | null>(null);
  const [faculty, setFaculty] = useState<FacultyDetail | null>(null);
  const [uni, setUni] = useState<UniversityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = useCallback(
    () =>
      Promise.all([
        listKinds(),
        id ? getFaculty(id) : null,
        !id && universityId ? getUniversity(universityId) : null,
      ])
        .then(([k, f, u]) => {
          setKinds(k);
          setFaculty(f);
          if (u) setUni(u);
        })
        .catch((err: unknown) => setError(errorText(err))),
    [id, universityId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs a change, reloads, and tells the admin how it went. */
  async function act(work: () => Promise<unknown>, done: string) {
    try {
      await work();
      await reload();
      toast({ kind: 'success', title: done });
      return true;
    } catch (err) {
      toast({ kind: 'error', title: errorText(err) });
      return false;
    }
  }

  if (!id && !universityId) {
    return (
      <Banner kind="warning" title="اختار الجامعة الأول">
        افتح الجامعة من <Link href="/universities">قائمة الجامعات</Link> واضغط «كلية جديدة».
      </Banner>
    );
  }
  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }
  const university =
    faculty?.university ??
    (uni ? { id: uni.id, nameAr: uni.nameAr, governorate: uni.governorate, logo: uni.logo } : null);
  if (!kinds || !university) return <div aria-busy="true" style={{ minHeight: 320 }} />;

  async function remove() {
    if (!faculty) return;
    try {
      await deleteFaculty(faculty.id);
      toast({ kind: 'success', title: 'الكلية اتمسحت' });
      router.replace(`/universities/${faculty.university.id}`);
    } catch (err) {
      setConfirmDelete(false);
      toast({ kind: 'error', title: errorText(err) });
    }
  }

  return (
    <>
      <div className="adm-back">
        <Link href={`/universities/${university.id}`} className="sb-btn sb-btn--ghost sb-btn--sm">
          <Icon name="chevR" />
          {university.nameAr}
        </Link>
        {faculty?.isActive ? (
          <a
            className="sb-btn sb-btn--ghost sb-btn--sm"
            href={`${WEB}/college/${faculty.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            شوفها في الموقع
          </a>
        ) : null}
      </div>

      <div className="adm-grid">
        <section className="sb-card adm-sec" aria-labelledby="h-fac">
          <h2 className="sb-h3" id="h-fac">
            بيانات الكلية
          </h2>
          {faculty ? (
            <LogoField
              owner="faculties"
              id={faculty.id}
              name={faculty.nameAr}
              logo={faculty.logo}
              fallback={{
                logo: university.logo,
                note: 'مفيش لوجو للكلية، فبيظهر لوجو الجامعة.',
              }}
              onChange={(logo) => setFaculty({ ...faculty, logo })}
            />
          ) : (
            <p className="sb-small">اللوجو بترفعه بعد ما تحفظ الكلية.</p>
          )}
          <FacultyForm
            key={faculty?.adminEditedAt ?? faculty?.id ?? 'new'}
            kinds={kinds}
            universityGovernorate={university.governorate}
            faculty={faculty}
            onSubmit={async (input) => {
              if (faculty) {
                setFaculty(await updateFaculty(faculty.id, input));
                toast({ kind: 'success', title: 'اتحفظت' });
              } else {
                const created = await createFaculty(university.id, input);
                toast({ kind: 'success', title: 'الكلية اتضافت' });
                router.replace(`/faculties/${created.id}`);
              }
            }}
          />
          {faculty ? (
            <div className="adm-danger-zone">
              <button
                type="button"
                className="sb-btn sb-btn--ghost sb-btn--sm adm-danger"
                onClick={() => setConfirmDelete(true)}
              >
                امسح الكلية
              </button>
              <span className="sb-caption">
                مينفعش تتمسح لو ليها مرشدين أو طلبات انضمام — اخفيها بدل كده.
              </span>
            </div>
          ) : null}
        </section>

        {faculty ? (
          <div className="adm-side">
            <Cutoffs faculty={faculty} act={act} />
            <Departments faculty={faculty} act={act} />
            {faculty.accreditedPrograms?.length ? (
              <section className="sb-card adm-sec" aria-labelledby="h-progs">
                <h2 className="sb-h3" id="h-progs">
                  البرامج المعتمدة (من هيئة الجودة)
                </h2>
                <ul className="adm-list">
                  {faculty.accreditedPrograms.map((p) => (
                    <li key={p.name}>
                      <span>{p.name}</span>
                      <span className="sb-caption">حتى {p.expiresAt.slice(0, 4)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {confirmDelete && faculty ? (
        <Modal
          title="تمسح الكلية؟"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                onClick={() => setConfirmDelete(false)}
              >
                لا، ارجع
              </button>
              <button type="button" className="adm-btn-danger sb-btn" onClick={() => void remove()}>
                امسحها نهائيًا
              </button>
            </>
          }
        >
          <p className="adm-modal-body">
            «{faculty.nameAr}» هتتمسح نهائيًا هي وأقسامها والحد الأدنى بتاعها. لو عايز تخفيها بس،
            شيل علامة «ظاهرة في الموقع».
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function FacultyForm({
  kinds,
  universityGovernorate,
  faculty,
  onSubmit,
}: {
  kinds: KindRow[];
  universityGovernorate: string | null;
  faculty: FacultyDetail | null;
  onSubmit: (input: FacultyInput) => Promise<unknown>;
}) {
  const [f, setF] = useState<FacultyInput>({
    kindId: faculty?.kind.id ?? '',
    nameAr: faculty?.nameAr ?? '',
    city: faculty?.city ?? null,
    governorate: faculty?.governorate ?? null,
    website: faculty?.website ?? null,
    about: faculty?.about ?? null,
    accreditationStatus: faculty?.accreditationStatus ?? 'unknown',
    accreditedAt: faculty?.accreditedAt ?? null,
    accreditationExpiresAt: faculty?.accreditationExpiresAt ?? null,
    isActive: faculty?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FacultyInput>(k: K, v: FacultyInput[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.kindId) local.kindId = 'اختار نوع الكلية.';
    if (f.nameAr.trim().length < 4) local.nameAr = 'اكتب اسم الكلية.';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await onSubmit({
        ...f,
        city: f.city?.trim() || null,
        website: f.website?.trim() || null,
        about: f.about?.trim() || null,
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

  const err = (k: string) =>
    errors[k] ? <FieldError id={`fac-${k}-err`}>{errors[k]}</FieldError> : null;
  const text = (
    key: 'nameAr' | 'city' | 'website',
    label: string,
    opts: { dir?: string; hint?: string; max: number },
  ) => (
    <div className="sb-field">
      <label className="sb-label" htmlFor={`fac-${key}`}>
        {label}
      </label>
      <input
        id={`fac-${key}`}
        className="sb-input"
        dir={opts.dir}
        maxLength={opts.max}
        value={f[key] ?? ''}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `fac-${key}-err` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {opts.hint && !errors[key] ? <span className="sb-hint">{opts.hint}</span> : null}
      {err(key)}
    </div>
  );

  return (
    <form className="adm-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="sb-field">
        <label className="sb-label" htmlFor="fac-kind">
          نوع الكلية (المجال)
        </label>
        <Select
          id="fac-kind"
          value={f.kindId}
          placeholder="اختار"
          options={kinds.map((k) => [k.id, k.fullNameAr] as const)}
          onChange={(v) => {
            const kind = kinds.find((k) => k.id === v);
            setF((p) => ({ ...p, kindId: v, nameAr: p.nameAr || kind?.fullNameAr || '' }));
            setErrors((e) => ({ ...e, kindId: '' }));
          }}
        />
        <span className="sb-hint">بيحدد الكلية بتظهر تحت أنهي مجال في البحث.</span>
        {err('kindId')}
      </div>
      {text('nameAr', 'اسم الكلية', {
        max: 160,
        hint: 'زي ما الجامعة بتكتبه، مثلًا «كلية الهندسة بشبرا».',
      })}
      <div className="two-adm">
        {text('city', 'المدينة (اختياري)', { max: 80, hint: 'لو مش في مقر الجامعة الرئيسي.' })}
        <div className="sb-field">
          <label className="sb-label" htmlFor="fac-gov">
            المحافظة
          </label>
          <Select
            id="fac-gov"
            value={f.governorate ?? ''}
            placeholder={`زي الجامعة${universityGovernorate ? ` (${universityGovernorate})` : ''}`}
            options={GOVERNORATES.map((g) => [g, g] as const)}
            onChange={(v) => set('governorate', v || null)}
          />
          {err('governorate')}
        </div>
      </div>
      {text('website', 'موقع الكلية (اختياري)', { dir: 'ltr', max: 200, hint: 'https://…' })}
      <div className="sb-field">
        <label className="sb-label" htmlFor="fac-about">
          عن الكلية دي (اختياري)
        </label>
        <textarea
          id="fac-about"
          className="sb-input"
          style={{ height: 110, padding: '12px 14px' }}
          maxLength={4000}
          value={f.about ?? ''}
          onChange={(e) => set('about', e.target.value)}
        />
        <span className="sb-hint">
          اللي يميز الكلية دي بالذات. الكلام العام عن المجال بيتكتب في «أنواع الكليات».
        </span>
        {err('about')}
      </div>
      <fieldset className="adm-fieldset">
        <legend className="sb-label">الاعتماد من هيئة الجودة</legend>
        <div className="two-adm">
          <Select
            id="fac-acc"
            value={f.accreditationStatus}
            placeholder="اختار"
            options={ACCREDITATION_STATUSES.map((s) => [s, ACCREDITATION_LABELS[s]] as const)}
            onChange={(v) => v && set('accreditationStatus', v as AccreditationStatus)}
          />
          <span />
          <div className="sb-field">
            <label className="sb-label" htmlFor="fac-acc-from">
              تاريخ الاعتماد
            </label>
            <input
              id="fac-acc-from"
              type="date"
              className="sb-input"
              value={f.accreditedAt ?? ''}
              onChange={(e) => set('accreditedAt', e.target.value || null)}
            />
            {err('accreditedAt')}
          </div>
          <div className="sb-field">
            <label className="sb-label" htmlFor="fac-acc-to">
              ينتهي في
            </label>
            <input
              id="fac-acc-to"
              type="date"
              className="sb-input"
              value={f.accreditationExpiresAt ?? ''}
              aria-invalid={Boolean(errors.accreditationExpiresAt)}
              onChange={(e) => set('accreditationExpiresAt', e.target.value || null)}
            />
            {err('accreditationExpiresAt')}
          </div>
        </div>
      </fieldset>
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
          {faculty ? 'احفظ' : 'ضيف الكلية'}
        </button>
      </div>
    </form>
  );
}

type Act = (work: () => Promise<unknown>, done: string) => Promise<boolean>;

function Cutoffs({ faculty, act }: { faculty: FacultyDetail; act: Act }) {
  const [c, setC] = useState({
    year: String(new Date().getFullYear()),
    phase: '1',
    track: '' as Cutoff['track'] | '',
    minScore: '',
    maxScore: '320',
    sourceUrl: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const trackLabel = (t: string) => TRACKS.find(([v]) => v === t)?.[1] ?? t;

  async function add(e: FormEvent) {
    e.preventDefault();
    const min = Number(c.minScore);
    const max = Number(c.maxScore);
    if (!c.track) return setErr('اختار الشعبة.');
    if (!c.minScore || Number.isNaN(min) || min > max) return setErr('اكتب الحد الأدنى صح.');
    if (!/^https?:\/\//.test(c.sourceUrl.trim()))
      return setErr('حط رابط المصدر اللي اتعلن فيه الرقم.');
    setErr(null);
    const ok = await act(
      () =>
        saveCutoff(faculty.id, {
          year: Number(c.year),
          phase: Number(c.phase),
          track: c.track as Cutoff['track'],
          minScore: min,
          maxScore: max,
          sourceUrl: c.sourceUrl.trim(),
        }),
      'الحد الأدنى اتحفظ',
    );
    if (ok) setC((p) => ({ ...p, minScore: '' }));
  }

  return (
    <section className="sb-card adm-sec" aria-labelledby="h-cut">
      <h2 className="sb-h3" id="h-cut">
        الحد الأدنى للتنسيق
      </h2>
      {faculty.cutoffs.length ? (
        <ul className="adm-list">
          {faculty.cutoffs.map((x) => (
            <li key={x.id}>
              <span>
                <b className="sb-num">{x.minScore}</b> من{' '}
                <span className="sb-num">{x.maxScore}</span> · {trackLabel(x.track)} · {x.year}{' '}
                مرحلة {x.phase}
              </span>
              <button
                type="button"
                className="sb-btn sb-btn--ghost sb-btn--sm adm-danger"
                onClick={() => void act(() => deleteCutoff(x.id), 'اتمسح')}
              >
                امسح
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sb-small">مفيش أرقام تنسيق متسجلة.</p>
      )}
      <form className="adm-form" onSubmit={(e) => void add(e)} noValidate>
        <div className="two-adm">
          <div className="sb-field">
            <label className="sb-label" htmlFor="cut-track">
              الشعبة
            </label>
            <Select
              id="cut-track"
              value={c.track}
              options={TRACKS}
              onChange={(v) => setC({ ...c, track: v as Cutoff['track'] })}
            />
          </div>
          <div className="sb-field">
            <label className="sb-label" htmlFor="cut-min">
              الحد الأدنى
            </label>
            <input
              id="cut-min"
              className="sb-input"
              inputMode="decimal"
              value={c.minScore}
              onChange={(e) => setC({ ...c, minScore: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label className="sb-label" htmlFor="cut-year">
              السنة
            </label>
            <input
              id="cut-year"
              className="sb-input"
              inputMode="numeric"
              value={c.year}
              onChange={(e) => setC({ ...c, year: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label className="sb-label" htmlFor="cut-phase">
              المرحلة
            </label>
            <input
              id="cut-phase"
              className="sb-input"
              inputMode="numeric"
              value={c.phase}
              onChange={(e) => setC({ ...c, phase: e.target.value })}
            />
          </div>
        </div>
        <div className="sb-field">
          <label className="sb-label" htmlFor="cut-src">
            رابط المصدر
          </label>
          <input
            id="cut-src"
            className="sb-input"
            dir="ltr"
            placeholder="https://…"
            value={c.sourceUrl}
            onChange={(e) => setC({ ...c, sourceUrl: e.target.value })}
          />
        </div>
        {err ? <FieldError id="cut-err">{err}</FieldError> : null}
        <div>
          <button type="submit" className="sb-btn sb-btn--secondary">
            احفظ الرقم
          </button>
        </div>
      </form>
    </section>
  );
}

function Departments({ faculty, act }: { faculty: FacultyDetail; act: Act }) {
  const [name, setName] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    if (await act(() => addDepartment(faculty.id, name.trim()), 'القسم اتضاف')) setName('');
  }

  return (
    <section className="sb-card adm-sec" aria-labelledby="h-depts">
      <h2 className="sb-h3" id="h-depts">
        الأقسام <span className="sb-num sb-small">({faculty.departments.length})</span>
      </h2>
      <ul className="adm-list">
        {faculty.departments.map((d) => (
          <li key={d.id}>
            <span className={d.isActive ? '' : 'adm-muted'}>{d.nameAr}</span>
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm"
              onClick={() =>
                void act(
                  () => updateDepartment(d.id, { isActive: !d.isActive }),
                  d.isActive ? 'القسم اتخفى' : 'القسم ظهر',
                )
              }
            >
              {d.isActive ? 'اخفي' : 'اظهر'}
            </button>
          </li>
        ))}
      </ul>
      <form className="adm-inline-form" onSubmit={(e) => void add(e)}>
        <label className="adm-sr" htmlFor="new-dept">
          قسم جديد
        </label>
        <input
          id="new-dept"
          className="sb-input"
          placeholder="اسم القسم"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="sb-btn sb-btn--secondary">
          ضيف
        </button>
      </form>
    </section>
  );
}
