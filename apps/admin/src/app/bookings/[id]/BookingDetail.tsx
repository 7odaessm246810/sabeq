'use client';

import { Banner, Modal, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Money } from '@/components/Money';
import { ApiError } from '@/lib/api';
import {
  BOOKING_STATUS_LABELS,
  LEDGER_LABELS,
  PAYMENT_STATUS_LABELS,
  egp,
  getBooking,
  refundBooking,
  type BookingDetail as Data,
} from '@/lib/dashboard';
import { formatDate } from '@/lib/verification';

const REFUNDABLE = ['confirmed', 'completed', 'no_show'];

/** One booking (Phase 20): money, attendance, review and the mentor's ledger — and a full refund. */
export function BookingDetail({ id }: { id: string }) {
  return (
    <AdminShell title="تفاصيل الحجز">
      {(admin) => <Body id={id} canRefund={['super_admin', 'support'].includes(admin.adminRole)} />}
    </AdminShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <li>
      <span className="sb-small">{k}</span>
      <b>{v}</b>
    </li>
  );
}

function Body({ id, canRefund }: { id: string; canRefund: boolean }) {
  const toast = useToast();
  const [b, setB] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getBooking(id)
      .then((d) => live && setB(d))
      .catch(
        (err: unknown) =>
          live && setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب الحجز.'),
      );
    return () => {
      live = false;
    };
  }, [id]);

  async function refund() {
    setBusy(true);
    setFieldError(null);
    try {
      setB(await refundBooking(id, reason.trim()));
      setRefunding(false);
      toast({
        kind: 'success',
        title: 'اترجع المبلغ كله للطالب',
        description: 'والطرفين وصلهم إشعار.',
      });
    } catch (err) {
      setFieldError(
        err instanceof ApiError ? (err.fields.reason ?? err.message) : 'حصلت مشكلة. جرّب تاني.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Banner kind="error" title={error} />;
  if (!b) return <div aria-busy="true" style={{ minHeight: 300 }} />;

  return (
    <>
      <Link className="adm-back" href="/bookings">
        ← الحجوزات
      </Link>
      <div className="adm-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="sb-card adm-sec">
            <h2 className="sb-h3 adm-card-title">
              {b.label} · {BOOKING_STATUS_LABELS[b.status]}
            </h2>
            <ul className="adm-list">
              <Row
                k="الميعاد"
                v={`${formatDate(b.startsAt)} · ${b.durationMin} دقيقة · ${b.medium === 'audio' ? 'صوت' : 'فيديو'}`}
              />
              <Row
                k="الطالب"
                v={
                  <>
                    {b.student.name ?? '—'} <span className="adm-ltr">{b.student.phone}</span>
                  </>
                }
              />
              <Row
                k="المرشد"
                v={
                  <>
                    {b.mentor.name ?? '—'} <span className="adm-ltr">{b.mentor.phone}</span>
                  </>
                }
              />
              <Row k="اتحجز" v={formatDate(b.createdAt)} />
              {b.note ? <Row k="أسئلة الطالب" v={b.note} /> : null}
              {b.cancelledAt ? (
                <Row
                  k="اتلغى"
                  v={`${formatDate(b.cancelledAt)}${b.cancelledBy ? ` · ${b.cancelledBy.name ?? b.cancelledBy.role}` : ''}${b.cancelReason ? ` · «${b.cancelReason}»` : ''}`}
                />
              ) : null}
            </ul>
          </section>

          <section className="sb-card adm-sec">
            <h2 className="sb-h3 adm-card-title">الدفع</h2>
            <ul className="adm-list">
              <Row k="سعر الجلسة" v={<Money egp={b.priceEgp} />} />
              <Row k="رسوم الخدمة" v={<Money egp={b.feeEgp} />} />
              <Row k="الإجمالي" v={<Money egp={b.totalEgp} />} />
              <Row k="عمولة سابق" v={`${b.commissionBps / 100}%`} />
            </ul>
            {b.payments.length ? (
              <table className="adm-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th scope="col">المحاولة</th>
                    <th scope="col">الطريقة</th>
                    <th scope="col">الحالة</th>
                    <th scope="col">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {formatDate(p.createdAt)}
                        {p.providerTxnId ? (
                          <span className="sb-caption adm-ltr">#{p.providerTxnId}</span>
                        ) : null}
                      </td>
                      <td>{p.method}</td>
                      <td>
                        {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                        {p.failureReason ? (
                          <span className="sb-caption">{p.failureReason}</span>
                        ) : null}
                        {p.refunds.map((r, i) => (
                          <span key={i} className="sb-caption">
                            استرداد {egp(r.amountEgp)} ·{' '}
                            {r.status === 'succeeded'
                              ? 'تم'
                              : r.status === 'pending'
                                ? 'مستني'
                                : r.status}
                          </span>
                        ))}
                      </td>
                      <td>
                        <Money egp={p.amountEgp} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="sb-small adm-muted">مفيش محاولات دفع.</p>
            )}
          </section>
        </div>

        <aside className="adm-side">
          <section className="sb-card adm-sec">
            <h2 className="sb-h3 adm-card-title">الحضور</h2>
            {b.meeting ? (
              <ul className="adm-list">
                <Row
                  k="الطالب دخل"
                  v={b.meeting.studentJoinedAt ? formatDate(b.meeting.studentJoinedAt) : 'ما دخلش'}
                />
                <Row
                  k="المرشد دخل"
                  v={b.meeting.mentorJoinedAt ? formatDate(b.meeting.mentorJoinedAt) : 'ما دخلش'}
                />
              </ul>
            ) : (
              <p className="sb-small adm-muted">محدش فتح غرفة الجلسة.</p>
            )}
          </section>
          {b.review ? (
            <section className="sb-card adm-sec">
              <h2 className="sb-h3 adm-card-title">التقييم</h2>
              <p>
                <b>
                  <span className="sb-num">{b.review.rating}</span> من 5
                </b>
                {b.review.status === 'hidden' ? ' · مخفي' : ''}
              </p>
              {b.review.text ? <p className="sb-small">«{b.review.text}»</p> : null}
            </section>
          ) : null}
          {b.ledger.length ? (
            <section className="sb-card adm-sec">
              <h2 className="sb-h3 adm-card-title">حساب المرشد</h2>
              <ul className="adm-list">
                {b.ledger.map((l, i) => (
                  <Row
                    key={i}
                    k={LEDGER_LABELS[l.type] ?? l.type}
                    v={<Money egp={l.amountEgp} />}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {canRefund && REFUNDABLE.includes(b.status) ? (
            <section className="sb-card adm-sec adm-danger">
              <h2 className="sb-h3 adm-card-title">استرداد كامل</h2>
              <p className="sb-small">
                بيرجّع للطالب {egp(b.totalEgp)} ويلغي الجلسة.
                {b.status !== 'confirmed' ? ' ولأن الجلسة خلصت، مكسب المرشد بيتشال من حسابه.' : ''}
              </p>
              <button
                type="button"
                className="sb-btn adm-btn-danger sb-btn--sm"
                onClick={() => {
                  setReason('');
                  setFieldError(null);
                  setRefunding(true);
                }}
              >
                رجّع المبلغ كله
              </button>
            </section>
          ) : null}
        </aside>
      </div>

      {refunding ? (
        <Modal
          title="ترجّع المبلغ كله؟"
          onClose={() => setRefunding(false)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn adm-btn-danger"
                disabled={busy || reason.trim().length < 3}
                aria-busy={busy}
                onClick={() => void refund()}
              >
                رجّع {egp(b.totalEgp)}
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                onClick={() => setRefunding(false)}
              >
                خليها
              </button>
            </>
          }
        >
          <div className="adm-modal-body">
            <p className="sb-small">السبب بيوصل للمرشد وبيتسجل في سجل العمليات.</p>
            <textarea
              className="sb-input"
              style={{ height: 90, padding: '12px 14px' }}
              maxLength={500}
              aria-label="سبب الاسترداد"
              placeholder="مثلًا: المرشد ما قدرش يكمل الجلسة"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {fieldError ? (
              <p className="sb-small" role="alert" style={{ color: 'var(--error)' }}>
                {fieldError}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
