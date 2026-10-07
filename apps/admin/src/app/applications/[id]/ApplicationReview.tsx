'use client';

import { formatEgyptianMobile } from '@sabeq/utils';
import { Banner, FieldError, Icon, Modal, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ApiError } from '@/lib/api';
import {
  ACTION_LABELS,
  DAY_LABELS,
  DOC_LABELS,
  KIND_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  decide,
  documentUrl,
  formatDate,
  getApplication,
  startReview,
  type ApplicationDetail,
  type Decision,
} from '@/lib/verification';

const DECISIONS: Record<Decision, { title: string; confirm: string; needsNote: boolean }> = {
  approve: { title: 'تقبل الطلب؟', confirm: 'اقبل وانشر البروفايل', needsNote: false },
  request_changes: { title: 'تطلب تعديل؟', confirm: 'ابعت طلب التعديل', needsNote: true },
  reject: { title: 'ترفض الطلب؟', confirm: 'ارفض الطلب', needsNote: true },
};

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} ميجا`
    : `${Math.ceil(bytes / 1024)} ك.ب`;

export function ApplicationReview({ id }: { id: string }) {
  return <AdminShell title="مراجعة طلب مرشد">{() => <Review id={id} />}</AdminShell>;
}

function Review({ id }: { id: string }) {
  const toast = useToast();
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getApplication(id)
      .then(setApp)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب الطلب.'),
      );
  }, [id]);

  async function run(action: () => Promise<ApplicationDetail>, success: string) {
    setBusy(true);
    try {
      setApp(await action());
      toast({ kind: 'success', title: success });
      setPending(null);
      setNote('');
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      if (e?.fields.note) setNoteError(e.fields.note);
      else {
        toast({ kind: 'error', title: e?.message ?? 'حصلت مشكلة. جرّب تاني.' });
        setPending(null);
        // Someone else may have decided meanwhile — show the current state.
        getApplication(id)
          .then(setApp)
          .catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }
  if (!app) return <div aria-busy="true" style={{ minHeight: 320 }} />;

  const p = app.payload;
  const reviewable = app.status === 'submitted' || app.status === 'under_review';
  const rows: [string, React.ReactNode][] = [
    ['الاسم', app.applicant.fullName ?? '—'],
    [
      'الموبايل',
      <span key="ph" className="sb-num" dir="ltr">
        {formatEgyptianMobile(app.applicant.phone)}
      </span>,
    ],
    ['الصفة', p.kind ? KIND_LABELS[p.kind] : '—'],
    ['الجامعة', app.university ?? '—'],
    ['الكلية', app.faculty ?? '—'],
    ['القسم / التخصص', p.major ?? '—'],
    ['سنة التخرج', p.graduationYear ?? '—'],
    [
      'سعر الاستشارة',
      p.basePriceEgp ? (
        <span key="pr">
          <span className="sb-num">{p.basePriceEgp}</span> ج.م
        </span>
      ) : (
        '—'
      ),
    ],
    ['الأيام', (p.days ?? []).map((d) => DAY_LABELS[d] ?? d).join('، ') || '—'],
    ['بيتكلم عن', p.topics || '—'],
  ];

  return (
    <>
      <div className="adm-back">
        <Link href="/" className="sb-btn sb-btn--ghost sb-btn--sm">
          <Icon name="chevR" />
          كل الطلبات
        </Link>
        <span className={`sb-badge ${STATUS_BADGE[app.status]}`}>{STATUS_LABELS[app.status]}</span>
      </div>

      <div className="adm-grid">
        <section className="sb-card adm-sec" aria-labelledby="h-data">
          <h2 className="sb-h3" id="h-data">
            بيانات المتقدم
          </h2>
          <div className="sb-summary" style={{ padding: 0 }}>
            {rows.map(([k, v]) => (
              <div key={k} className="sb-summary-row">
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        </section>

        <div className="adm-side">
          <section className="sb-card adm-sec" aria-labelledby="h-docs">
            <h2 className="sb-h3" id="h-docs">
              المستندات
            </h2>
            <p className="sb-caption">كل فتحة لمستند بتتسجل باسمك في سجل العمليات.</p>
            {app.documents.length === 0 ? (
              <p className="sb-small">مفيش مستندات.</p>
            ) : (
              <ul className="adm-docs">
                {app.documents.map((d) => (
                  <li key={d.id}>
                    <span className="g">
                      <b>{DOC_LABELS[d.kind] ?? d.kind}</b>
                      <span className="sb-caption">
                        {d.mimeType === 'application/pdf' ? 'PDF' : 'صورة'} ·{' '}
                        {sizeLabel(d.sizeBytes)}
                      </span>
                    </span>
                    <a
                      className="sb-btn sb-btn--secondary sb-btn--sm"
                      href={documentUrl(app.id, d.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      افتح
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sb-card adm-sec" aria-labelledby="h-decision">
            <h2 className="sb-h3" id="h-decision">
              القرار
            </h2>
            {app.status === 'submitted' ? (
              <button
                type="button"
                className="sb-btn sb-btn--secondary sb-btn--block"
                aria-busy={busy}
                onClick={() => void run(() => startReview(app.id), 'الطلب بقى عندك للمراجعة')}
              >
                ابدأ المراجعة
              </button>
            ) : null}
            {reviewable ? (
              <div className="adm-actions">
                <button
                  type="button"
                  className="sb-btn sb-btn--primary"
                  onClick={() => setPending('approve')}
                >
                  اقبل
                </button>
                <button
                  type="button"
                  className="sb-btn sb-btn--secondary"
                  onClick={() => setPending('request_changes')}
                >
                  اطلب تعديل
                </button>
                <button
                  type="button"
                  className="sb-btn sb-btn--ghost adm-danger"
                  onClick={() => setPending('reject')}
                >
                  ارفض
                </button>
              </div>
            ) : (
              <p className="sb-small">
                {app.status === 'changes_requested'
                  ? 'مستنيين المتقدم يعدّل ويبعت تاني.'
                  : `اتاخد القرار ${formatDate(app.decidedAt)}${app.reviewer ? ` · ${app.reviewer}` : ''}.`}
              </p>
            )}
            {app.decisionNote ? (
              <Banner kind="info" title="الملاحظة اللي اتبعتت">
                {app.decisionNote}
              </Banner>
            ) : null}
          </section>

          <section className="sb-card adm-sec" aria-labelledby="h-history">
            <h2 className="sb-h3" id="h-history">
              السجل
            </h2>
            <ol className="adm-history">
              {app.history.map((h, i) => (
                <li key={i}>
                  <b>{ACTION_LABELS[h.action] ?? h.action}</b>
                  <span className="sb-caption">
                    {h.actor} · {formatDate(h.at)}
                  </span>
                  {h.note ? <span className="sb-small">«{h.note}»</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {pending ? (
        <Modal
          title={DECISIONS[pending].title}
          onClose={() => {
            setPending(null);
            setNoteError(null);
          }}
          footer={
            <>
              <button
                type="button"
                className={
                  pending === 'reject'
                    ? 'sb-btn sb-btn--primary adm-btn-danger'
                    : 'sb-btn sb-btn--primary'
                }
                aria-busy={busy}
                onClick={() => {
                  if (DECISIONS[pending].needsNote && !note.trim()) {
                    setNoteError('اكتب السبب عشان المتقدم يعرف يعمل إيه.');
                    return;
                  }
                  void run(
                    () => decide(app.id, pending, note.trim() || undefined),
                    pending === 'approve' ? 'اتقبل والبروفايل اتعمل' : 'القرار اتبعت للمتقدم',
                  );
                }}
              >
                {DECISIONS[pending].confirm}
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                onClick={() => setPending(null)}
              >
                رجوع
              </button>
            </>
          }
        >
          <div className="adm-modal-body">
            {pending === 'approve' ? (
              <p className="sb-body">
                هيتعمل بروفايل مرشد لـ {app.applicant.fullName} ويظهر للطلاب، والمتقدم هيوصله إشعار.
              </p>
            ) : null}
            <div className="sb-field">
              <label className="sb-label" htmlFor="note">
                {pending === 'approve' ? 'ملاحظة (اختياري)' : 'السبب (هيوصل للمتقدم)'}
              </label>
              <textarea
                id="note"
                className="sb-input"
                style={{ height: 96, padding: '12px 14px' }}
                maxLength={1000}
                value={note}
                aria-invalid={Boolean(noteError)}
                aria-describedby={noteError ? 'note-err' : undefined}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteError(null);
                }}
              />
              {noteError ? <FieldError id="note-err">{noteError}</FieldError> : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
