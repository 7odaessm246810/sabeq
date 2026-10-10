'use client';

import {
  BOOKING_STATUS_LABELS,
  FREE_CANCEL_HOURS,
  cancellationRefund,
  type BookingStatus,
} from '@sabeq/types';
import { formatCairoDay, formatCairoTime } from '@sabeq/utils';
import { Avatar, EmptyState, Icon, Modal, Tabs, useToast, type IconName } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SavedMentors } from '@/components/mentor/SavedMentors';
import { PageHead } from '@/components/PageHead';
import { ApiError } from '@/lib/api';
import {
  cancelBooking,
  completeBooking,
  listBookings,
  markNoShow,
  type Booking,
} from '@/lib/bookings';
import { useSignedIn } from '@/lib/use-signed-in';

type Tab = 'up' | 'past' | 'saved';

const BADGE: Record<BookingStatus, [string, IconName]> = {
  pending: ['sb-badge--warning', 'clock'],
  confirmed: ['sb-badge--primary', 'calendar'],
  completed: ['sb-badge--success', 'check'],
  cancelled: ['sb-badge--neutral', 'refresh'],
  refunded: ['sb-badge--neutral', 'refresh'],
  no_show: ['sb-badge--neutral', 'x'],
};

function StatusBadge({ b, now }: { b: Booking; now: number }) {
  const [cls, icon] = BADGE[b.status];
  const ended = Date.parse(b.endsAt) < now;
  const label =
    b.status === 'confirmed' && ended
      ? 'خلصت'
      : b.status === 'cancelled' && b.refundEgp
        ? 'ملغاة · الفلوس هترجع'
        : BOOKING_STATUS_LABELS[b.status];
  return (
    <span className={`sb-badge ${cls}`}>
      <Icon name={icon} />
      {label}
    </span>
  );
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.';

/**
 * «جلساتي» (Phase 15): the signed-in student's bookings, or the mentor's sessions, from the API.
 * Joining the call arrives with Phase 17 and ratings with Phase 18.
 */
export function SessionsClient() {
  const toast = useToast();
  const user = useSignedIn('/sessions');
  const role = user?.role === 'mentor' ? 'mentor' : 'student';
  const [tab, setTab] = useState<Tab>('up');
  const [list, setList] = useState<Booking[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /** «Now» as of the last load: rendering must stay pure. */
  const [now, setNow] = useState(0);

  /** Bumped to reload the current tab (retry). */
  const [reloads, setReloads] = useState(0);
  const canList = user?.role === 'student' || user?.role === 'mentor';
  useEffect(() => {
    if (!canList || tab === 'saved') return;
    let live = true;
    listBookings(tab === 'up' ? 'upcoming' : 'past')
      .then((l) => {
        if (!live) return;
        setNow(Date.now());
        setFailed(false);
        setList(l);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [canList, tab, reloads]);
  const switchTab = (t: Tab) => {
    setList(null);
    setFailed(false);
    setTab(t);
  };

  if (!user) return <div className="page-body" aria-busy="true" />;

  async function act(work: () => Promise<Booking>, done: string) {
    setBusy(true);
    try {
      const updated = await work();
      setList((l) => l?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      toast({ kind: 'success', title: done });
      return true;
    } catch (err) {
      toast({ kind: 'error', title: errorText(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const refundFor = (b: Booking) =>
    cancellationRefund({
      status: b.status,
      by: role,
      hoursBefore: (Date.parse(b.startsAt) - now) / 3_600_000,
      pricePiasters: Math.round(b.priceEgp * 100),
      feePiasters: Math.round(b.feeEgp * 100),
    }).refundPiasters / 100;

  const first = user.fullName?.split(' ')[0];
  const tabs = [
    { key: 'up' as const, label: 'القادمة' },
    { key: 'past' as const, label: 'السابقة' },
    ...(role === 'student' ? [{ key: 'saved' as const, label: 'المحفوظين' }] : []),
  ];

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'جلساتي' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">جلساتي</h1>
            <p className="sb-lead">
              {first ? `أهلًا ${first}.` : 'أهلًا بيك.'}{' '}
              {role === 'mentor' ? 'كل الجلسات اللي اتحجزت معاك.' : 'كل حجوزاتك في مكان واحد.'}
            </p>
          </div>
          {role === 'mentor' ? (
            <Link className="sb-btn sb-btn--secondary" href="/account/availability">
              <Icon name="calendar" />
              مواعيدي
            </Link>
          ) : (
            <Link className="sb-btn sb-btn--primary" href="/mentors">
              احجز جلسة جديدة
            </Link>
          )}
        </div>
        <div style={{ marginTop: 24 }}>
          <Tabs label="جلساتي" value={tab} onChange={switchTab} items={tabs} />
        </div>
      </PageHead>

      <section className="sb-container page-body" role="tabpanel">
        {tab === 'saved' ? (
          <SavedMentors />
        ) : failed ? (
          <div className="sb-card" role="alert">
            <EmptyState
              title="ما قدرناش نجيب جلساتك"
              description="حدّث الصفحة وجرّب تاني."
              actions={
                <button
                  type="button"
                  className="sb-btn sb-btn--primary sb-btn--sm"
                  onClick={() => {
                    setFailed(false);
                    setList(null);
                    setReloads((n) => n + 1);
                  }}
                >
                  جرّب تاني
                </button>
              }
            />
          </div>
        ) : !list ? (
          <div className="sess" aria-busy="true">
            <div className="sb-card sess-row" style={{ minHeight: 76 }} />
            <div className="sb-card sess-row" style={{ minHeight: 76 }} />
          </div>
        ) : list.length ? (
          <div className="sess">
            {list.map((b) => {
              const start = new Date(b.startsAt);
              const ended = Date.parse(b.endsAt) < now;
              const live = b.status === 'confirmed' && !ended;
              const who = role === 'mentor' ? (b.student?.name ?? 'طالب') : b.mentor.name;
              return (
                <div key={b.id} className="sb-card sess-row flip">
                  <Avatar
                    name={who}
                    verified={role === 'student'}
                    tone={2}
                    {...(role === 'student' && b.mentor.photo ? { src: b.mentor.photo } : {})}
                  />
                  <div className="g">
                    <b>
                      {role === 'student' ? (
                        <Link href={`/mentor/${b.mentor.slug}`} className="mlink">
                          {who}
                        </Link>
                      ) : (
                        who
                      )}
                    </b>
                    <span className="sb-small">
                      {b.label} · {role === 'student' ? b.mentor.major : `${b.durationMin} دقيقة`}
                    </span>
                    {role === 'mentor' && b.note ? (
                      <span className="sb-caption">سؤاله: {b.note}</span>
                    ) : null}
                  </div>
                  <div className="when">
                    <b>{formatCairoDay(start)}</b>
                    <span className="sb-caption">
                      {formatCairoTime(start)} ·{' '}
                      {role === 'mentor' ? (
                        <>
                          ليك <span className="sb-num">{b.earningEgp}</span> ج.م
                        </>
                      ) : (
                        <>
                          <span className="sb-num">{b.totalEgp}</span> ج.م
                        </>
                      )}
                    </span>
                  </div>
                  <StatusBadge b={b} now={now} />
                  <div className="acts">
                    {live ? (
                      <button
                        type="button"
                        className="sb-btn sb-btn--primary sb-btn--sm"
                        onClick={() =>
                          toast({
                            kind: 'info',
                            title: 'الجلسة لسه ما بدأتش',
                            description: 'اللينك هيشتغل قبل الميعاد بـ 10 دقايق.',
                          })
                        }
                      >
                        <Icon name="video" />
                        ادخل الجلسة
                      </button>
                    ) : null}
                    {(b.status === 'confirmed' || b.status === 'pending') &&
                    start.getTime() > now ? (
                      <button
                        type="button"
                        className="sb-btn sb-btn--ghost sb-btn--sm"
                        disabled={busy}
                        onClick={() => {
                          setReason('');
                          setCancelling(b);
                        }}
                      >
                        إلغاء
                      </button>
                    ) : null}
                    {role === 'mentor' && b.status === 'confirmed' && ended ? (
                      <>
                        <button
                          type="button"
                          className="sb-btn sb-btn--secondary sb-btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void act(() => completeBooking(b.id), 'اتسجلت الجلسة مكتملة')
                          }
                        >
                          <Icon name="check" />
                          الجلسة خلصت
                        </button>
                        <button
                          type="button"
                          className="sb-btn sb-btn--ghost sb-btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void act(() => markNoShow(b.id), 'اتسجّل إن الطالب ما حضرش')
                          }
                        >
                          الطالب ما حضرش
                        </button>
                      </>
                    ) : null}
                    {role === 'student' && b.status === 'completed' ? (
                      <Link
                        className="sb-btn sb-btn--ghost sb-btn--sm"
                        href={`/book/${b.mentor.slug}`}
                      >
                        احجز تاني
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sb-card">
            <EmptyState
              roomy
              title={
                tab === 'up'
                  ? 'مفيش جلسات قادمة'
                  : role === 'mentor'
                    ? 'جلساتك اللي خلصت هتظهر هنا'
                    : 'أول جلسة ليك هتظهر هنا'
              }
              description={
                role === 'mentor'
                  ? 'اتأكد إن مواعيدك مظبوطة عشان الطلبة يقدروا يحجزوا.'
                  : 'ابدأ بكلية بتفكر فيها، واختار حد درس فيها.'
              }
              actions={
                role === 'mentor' ? (
                  <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/account/availability">
                    مواعيدي
                  </Link>
                ) : (
                  <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/explore">
                    استكشف الكليات
                  </Link>
                )
              }
            />
          </div>
        )}
      </section>

      {cancelling ? (
        <Modal
          title="إلغاء الجلسة؟"
          onClose={() => setCancelling(null)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn sb-btn--primary"
                onClick={() => setCancelling(null)}
              >
                خليها
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                style={{ color: 'var(--error)' }}
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void act(
                    () => cancelBooking(cancelling.id, reason.trim() || undefined),
                    'اتلغت الجلسة',
                  ).then((ok) => ok && setCancelling(null))
                }
              >
                إلغاء الجلسة
              </button>
            </>
          }
        >
          <p>
            {role === 'mentor'
              ? `جلستك مع ${cancelling.student?.name ?? 'الطالب'}`
              : `جلستك مع ${cancelling.mentor.name}`}{' '}
            {formatCairoDay(new Date(cancelling.startsAt))} الساعة{' '}
            {formatCairoTime(new Date(cancelling.startsAt))}.{' '}
            {cancelling.status === 'pending'
              ? 'لسه ما دفعتش، فمفيش فلوس هترجع.'
              : role === 'mentor'
                ? `الطالب هيرجعله المبلغ كامل (${refundFor(cancelling)} ج.م) وهيوصله إشعار.`
                : refundFor(cancelling) >= cancelling.totalEgp
                  ? `لأنك بتلغي قبلها بـ ${FREE_CANCEL_HOURS} ساعة أو أكتر، هيرجعلك المبلغ كامل (${refundFor(cancelling)} ج.م).`
                  : `لأن الإلغاء قبلها بأقل من ${FREE_CANCEL_HOURS} ساعة، هيرجعلك ${refundFor(cancelling)} ج.م (نص سعر الجلسة).`}
          </p>
          <textarea
            className="sb-input"
            style={{ height: 80, padding: '12px 14px' }}
            maxLength={500}
            placeholder={role === 'mentor' ? 'سبب الإلغاء (بيوصل للطالب)' : 'سبب الإلغاء (اختياري)'}
            aria-label="سبب الإلغاء"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Modal>
      ) : null}
    </>
  );
}
