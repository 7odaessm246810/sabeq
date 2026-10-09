'use client';

import { Banner, FieldError, Icon, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ApiError } from '@/lib/api';
import {
  addDepartment,
  addInsight,
  deleteInsight,
  getKind,
  updateDepartment,
  updateInsight,
  updateKind,
  type KindDetail,
  type KindPatch,
} from '@/lib/catalog';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.';

export function KindEditor({ id }: { id: string }) {
  return (
    <AdminShell title="تعديل كلية">
      {(admin) =>
        admin.adminRole === 'super_admin' || admin.adminRole === 'support' ? (
          <Editor id={id} />
        ) : (
          <Banner kind="warning" title="مش متاح">
            إدارة الكليات للمدير والدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Editor({ id }: { id: string }) {
  const toast = useToast();
  const [kind, setKind] = useState<KindDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      getKind(id)
        .then(setKind)
        .catch((err: unknown) => setError(errorText(err))),
    [id],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs a change, reloads the faculty, and tells the admin how it went. */
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

  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }
  if (!kind) return <div aria-busy="true" style={{ minHeight: 320 }} />;

  return (
    <>
      <div className="adm-back">
        <Link href="/catalog" className="sb-btn sb-btn--ghost sb-btn--sm">
          <Icon name="chevR" />
          كل الكليات
        </Link>
        <a
          className="sb-btn sb-btn--ghost sb-btn--sm"
          href={`${process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000'}/faculty/${kind.slug}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          شوفها في الموقع
        </a>
      </div>
      <div className="adm-grid">
        <TextsForm
          key={kind.id + kind.summary}
          kind={kind}
          onSave={(p) => act(() => updateKind(kind.id, p), 'اتحفظت')}
        />
        <div className="adm-side">
          <Insights kind={kind} act={act} />
          <Departments kind={kind} act={act} />
        </div>
      </div>
    </>
  );
}

function TextsForm({
  kind,
  onSave,
}: {
  kind: KindDetail;
  onSave: (patch: KindPatch) => Promise<boolean>;
}) {
  const [f, setF] = useState({
    fullNameAr: kind.fullNameAr,
    nameAr: kind.nameAr,
    summary: kind.summary,
    studyYears: String(kind.studyYears),
    about: kind.about,
    genericInfo: kind.genericInfo,
    isActive: kind.isActive,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...f, studyYears: Number(f.studyYears) });
    setBusy(false);
  }

  const field = (key: 'fullNameAr' | 'nameAr' | 'summary', label: string, max: number) => (
    <div className="sb-field">
      <label className="sb-label" htmlFor={key}>
        {label}
      </label>
      <input
        id={key}
        className="sb-input"
        maxLength={max}
        value={f[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );
  const area = (key: 'about' | 'genericInfo', label: string, hint: string) => (
    <div className="sb-field">
      <label className="sb-label" htmlFor={key}>
        {label}
      </label>
      <textarea
        id={key}
        className="sb-input"
        style={{ height: 120, padding: '12px 14px' }}
        maxLength={4000}
        value={f[key]}
        aria-describedby={`${key}-hint`}
        onChange={(e) => set(key, e.target.value)}
      />
      <span className="sb-hint" id={`${key}-hint`}>
        {hint}
      </span>
    </div>
  );

  return (
    <form className="sb-card adm-sec" onSubmit={(e) => void submit(e)} aria-labelledby="h-texts">
      <h2 className="sb-h3" id="h-texts">
        بيانات الكلية
      </h2>
      <div className="two-adm">
        {field('fullNameAr', 'الاسم الكامل', 120)}
        {field('nameAr', 'الاسم المختصر', 80)}
      </div>
      {field('summary', 'سطر الوصف (بيظهر في الكارت)', 200)}
      <div className="sb-field">
        <label className="sb-label" htmlFor="years">
          سنين الدراسة
        </label>
        <input
          id="years"
          className="sb-input"
          type="number"
          min={2}
          max={7}
          value={f.studyYears}
          onChange={(e) => set('studyYears', e.target.value)}
          style={{ width: 120 }}
        />
      </div>
      {area('about', 'عن الكلية', 'بيظهر في أول صفحة الكلية.')}
      {area(
        'genericInfo',
        'اللي هتلاقيه على النت',
        'المعلومة الرسمية العامة، قصاد تجارب الخريجين.',
      )}
      <label className="adm-check">
        <input
          type="checkbox"
          checked={f.isActive}
          onChange={(e) => set('isActive', e.target.checked)}
        />
        ظاهرة في الموقع
      </label>
      <div>
        <button type="submit" className="sb-btn sb-btn--primary" aria-busy={busy}>
          احفظ
        </button>
      </div>
    </form>
  );
}

function Insights({
  kind,
  act,
}: {
  kind: KindDetail;
  act: (work: () => Promise<unknown>, done: string) => Promise<boolean>;
}) {
  const [quote, setQuote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const q = quote.trim();
    if (q.length < 5) {
      setErr('اكتب التجربة (5 حروف على الأقل).');
      return;
    }
    if (await act(() => addInsight(kind.id, q.startsWith('«') ? q : `«${q}»`), 'اتضافت'))
      setQuote('');
  }

  return (
    <section className="sb-card adm-sec" aria-labelledby="h-insights">
      <h2 className="sb-h3" id="h-insights">
        اللي الخريجين بيقولوه
      </h2>
      <ul className="adm-list">
        {kind.insights.map((i) => (
          <li key={i.id}>
            <span className={i.isPublished ? '' : 'adm-muted'}>{i.quote}</span>
            <span className="adm-row-actions">
              <button
                type="button"
                className="sb-btn sb-btn--ghost sb-btn--sm"
                onClick={() =>
                  void act(
                    () => updateInsight(i.id, { isPublished: !i.isPublished }),
                    i.isPublished ? 'اتخفت' : 'ظهرت',
                  )
                }
              >
                {i.isPublished ? 'اخفي' : 'اظهر'}
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost sb-btn--sm adm-danger"
                onClick={() => void act(() => deleteInsight(i.id), 'اتمسحت')}
              >
                امسح
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form className="adm-inline-form" onSubmit={(e) => void add(e)}>
        <div className="sb-field" style={{ flex: 1 }}>
          <label className="adm-sr" htmlFor="new-quote">
            تجربة جديدة
          </label>
          <input
            id="new-quote"
            className="sb-input"
            placeholder="جملة قالها خريج من الكلية"
            maxLength={400}
            value={quote}
            aria-invalid={Boolean(err)}
            aria-describedby={err ? 'quote-err' : undefined}
            onChange={(e) => {
              setQuote(e.target.value);
              setErr(null);
            }}
          />
          {err ? <FieldError id="quote-err">{err}</FieldError> : null}
        </div>
        <button type="submit" className="sb-btn sb-btn--secondary">
          ضيف
        </button>
      </form>
    </section>
  );
}

function Departments({
  kind,
  act,
}: {
  kind: KindDetail;
  act: (work: () => Promise<unknown>, done: string) => Promise<boolean>;
}) {
  const [facultyId, setFacultyId] = useState(kind.faculties[0]?.id ?? '');
  const [name, setName] = useState('');
  const faculty = kind.faculties.find((x) => x.id === facultyId);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !facultyId) return;
    if (await act(() => addDepartment(facultyId, name.trim()), 'القسم اتضاف')) setName('');
  }

  return (
    <section className="sb-card adm-sec" aria-labelledby="h-depts">
      <h2 className="sb-h3" id="h-depts">
        الأقسام
      </h2>
      <div className="adm-pills" role="group" aria-label="الجامعة">
        {kind.faculties.map((x) => (
          <button
            key={x.id}
            type="button"
            className="sb-chip sb-chip--sm"
            aria-pressed={x.id === facultyId}
            onClick={() => setFacultyId(x.id)}
          >
            {x.university.nameAr.replace('جامعة ', '')}
          </button>
        ))}
      </div>
      <ul className="adm-list">
        {(faculty?.departments ?? []).map((d) => (
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
