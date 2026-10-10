'use client';

import { NO_SHOW_GRACE_MINUTES } from '@sabeq/types';
import { formatCairoDay, formatCairoTime } from '@sabeq/utils';
import { Avatar, Banner, EmptyState, Icon, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Crumb } from '@/components/Crumb';
import { ApiError } from '@/lib/api';
import { completeBooking, getBooking, joinSession, markNoShow, type Booking } from '@/lib/bookings';
import { useSignedIn } from '@/lib/use-signed-in';

const REFRESH_MS = 15_000;
const MIN = 60_000;

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة في الاتصال. جرّب تاني.';

/**
 * The session room (Phase 17 — UX Flows «Session → فيديو/صوت + قائمة أسئلته»): the video call
 * (Daily, embedded) beside the session details and the student's questions. Joining is allowed
 * from 10 minutes before the start; the room asks the API, which records who came.
 */
export function SessionRoom({ id }: { id: string }) {
  const user = useSignedIn(`/sessions/${id}`);
  const toast = useToast();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [room, setRoom] = useState<{ url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** «Now» as of the last refresh: rendering must stay pure. */
  const [now, setNow] = useState(0);

  const signedIn = Boolean(user);
  // The booking (status, who has come in), refreshed while the page is open.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const load = () =>
      getBooking(id)
        .then((b) => {
          if (!live) return;
          setNow(Date.now());
          setBooking(b);
        })
        .catch((err: unknown) => live && setError(errorText(err)));
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [signedIn, id]);

  // Join as soon as the room is open (once).
  const open =
    booking?.status === 'confirmed' &&
    now >= Date.parse(booking.session.opensAt) &&
    now <= Date.parse(booking.session.closesAt);
  const joined = room !== null;
  useEffect(() => {
    if (!open || joined) return;
    let live = true;
    joinSession(id)
      .then((r) => live && setRoom({ url: r.url }))
      .catch((err: unknown) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [open, joined, id]);

  if (!user) return <div className="page-body" aria-busy="true" />;
  const isMentor = user.role === 'mentor';

  async function act(work: () => Promise<Booking>, done: string) {
    setBusy(true);
    try {
      await work();
      toast({ kind: 'success', title: done });
      router.push('/sessions');
    } catch (err) {
      toast({ kind: 'error', title: errorText(err) });
      setBusy(false);
    }
  }

  if (!booking)
    return (
      <section className="sb-container page-body" style={{ maxWidth: 720, paddingTop: 48 }}>
        {error ? (
          <div className="sb-card" role="alert">
            <EmptyState
              title="ما قدرناش نفتح الجلسة"
              description={error}
              actions={
                <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/sessions">
                  جلساتي
                </Link>
              }
            />
          </div>
        ) : (
          <div className="sb-card" style={{ minHeight: 320 }} aria-busy="true" />
        )}
      </section>
    );

  const b = booking;
  const start = new Date(b.startsAt);
  const other = isMentor ? (b.student?.name ?? 'الطالب') : b.mentor.name;
  const first = other.split(' ')[0] ?? other;
  const otherJoined = isMentor ? b.session.studentJoined : b.session.mentorJoined;
  const ended = now > Date.parse(b.endsAt);
  const minutesLeft = Math.max(0, Math.ceil((Date.parse(b.endsAt) - now) / MIN));
  const canMarkAbsent =
    isMentor &&
    b.status === 'confirmed' &&
    b.session.mentorJoined &&
    !b.session.studentJoined &&
    now >= start.getTime() + NO_SHOW_GRACE_MINUTES * MIN;

  let stage: React.ReactNode;
  if (b.status !== 'confirmed') {
    stage = (
      <div className="room-msg">
        <h2 className="sb-h2" style={{ fontSize: 24 }}>
          {b.status === 'completed' || b.status === 'no_show' ? 'الجلسة خلصت' : 'الجلسة دي اتلغت'}
        </h2>
        {b.cancelReason ? <p className="sb-small">{b.cancelReason}</p> : null}
        {b.refundEgp ? (
          <p className="sb-small">
            {isMentor ? 'رجعنا للطالب' : 'هترجعلك'} <span className="sb-num">{b.refundEgp}</span>{' '}
            ج.م.
          </p>
        ) : null}
        <Link className="sb-btn sb-btn--primary" href="/sessions">
          جلساتي
        </Link>
      </div>
    );
  } else if (now < Date.parse(b.session.opensAt)) {
    stage = (
      <div className="room-msg">
        <Icon name="clock" />
        <h2 className="sb-h2" style={{ fontSize: 24 }}>
          الجلسة لسه ما فتحتش
        </h2>
        <p className="sb-small">
          بتفتح الساعة {formatCairoTime(new Date(b.session.opensAt))}، قبل معادها بـ 10 دقايق. سيب
          الصفحة مفتوحة وهتدخل لوحدك.
        </p>
      </div>
    );
  } else if (now > Date.parse(b.session.closesAt)) {
    stage = (
      <div className="room-msg">
        <h2 className="sb-h2" style={{ fontSize: 24 }}>
          وقت الجلسة خلص
        </h2>
        <Link className="sb-btn sb-btn--primary" href="/sessions">
          جلساتي
        </Link>
      </div>
    );
  } else if (error && !room) {
    stage = (
      <div className="room-msg" role="alert">
        <h2 className="sb-h2" style={{ fontSize: 24 }}>
          ما قدرناش نفتح الجلسة
        </h2>
        <p className="sb-small">{error}</p>
        <button
          type="button"
          className="sb-btn sb-btn--primary"
          onClick={() => {
            setError(null);
            setRoom(null);
            joinSession(id)
              .then((r) => setRoom({ url: r.url }))
              .catch((err: unknown) => setError(errorText(err)));
          }}
        >
          جرّب تاني
        </button>
      </div>
    );
  } else if (!room) {
    stage = <div className="room-msg" aria-busy="true" />;
  } else if (room.url) {
    stage = (
      <iframe
        className="room-frame"
        src={room.url}
        title={`جلستك مع ${other}`}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
      />
    );
  } else {
    stage = (
      <div className="room-msg">
        <span className="sb-badge sb-badge--warning">
          <Icon name="alert" />
          غرفة تجريبية — على جهاز التطوير بس
        </span>
        <h2 className="sb-h2" style={{ fontSize: 24 }}>
          إنت في الجلسة
        </h2>
        <p className="sb-small">
          مفيش فيديو هنا. لما حساب Daily يتفعّل، الفيديو والصوت هيظهروا في المكان ده.
        </p>
      </div>
    );
  }

  return (
    <section className="sb-container page-body" style={{ maxWidth: 1200, paddingTop: 28 }}>
      <Crumb items={[{ label: 'جلساتي', href: '/sessions' }, { label: `جلستك مع ${first}` }]} />
      <div className="bk-wrap room-wrap">
        <div className="room-stage">{stage}</div>

        <aside className="bk-side">
          <div className="sb-card sb-summary">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Avatar
                name={other}
                verified={!isMentor}
                tone={2}
                {...(!isMentor && b.mentor.photo ? { src: b.mentor.photo } : {})}
              />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <b>{other}</b>
                <span className="sb-caption">
                  {isMentor
                    ? `${b.label} · ${b.durationMin} دقيقة`
                    : `${b.mentor.major} · ${b.mentor.university}`}
                </span>
              </div>
            </div>
            <hr />
            <div className="sb-summary-row">
              <span>إمتى</span>
              <b>
                {formatCairoDay(start)} · {formatCairoTime(start)}
              </b>
            </div>
            <div className="sb-summary-row">
              <span>المدة</span>
              <b>
                {b.durationMin} دقيقة · {b.medium === 'audio' ? 'صوت' : 'فيديو'}
              </b>
            </div>
            {b.status === 'confirmed' && now >= start.getTime() && !ended ? (
              <div className="sb-summary-row">
                <span>فاضل</span>
                <b>
                  <span className="sb-num">{minutesLeft}</span> دقيقة
                </b>
              </div>
            ) : null}
            {b.status === 'confirmed' ? (
              <span
                className={`sb-badge ${otherJoined ? 'sb-badge--success' : 'sb-badge--neutral'}`}
                style={{ width: 'max-content' }}
              >
                <Icon name={otherJoined ? 'check' : 'clock'} />
                {otherJoined ? `${first} دخل الجلسة` : `${first} لسه ما دخلش`}
              </span>
            ) : null}
            <hr />
            <b>{isMentor ? 'أسئلة الطالب' : 'أسئلتك للجلسة'}</b>
            <p className="sb-small" style={{ margin: 0, whiteSpace: 'pre-line' }}>
              {b.note ??
                (isMentor ? 'الطالب ما كتبش أسئلة قبل الجلسة.' : 'ما كتبتش أسئلة قبل الجلسة.')}
            </p>
          </div>

          {!isMentor && b.status === 'confirmed' ? (
            <Banner kind="info" title={`لو ${first} ما دخلش خلال ${NO_SHOW_GRACE_MINUTES} دقيقة`}>
              الجلسة بتتلغي لوحدها وفلوسك بترجعلك كاملة.
            </Banner>
          ) : null}

          {isMentor && b.status === 'confirmed' && (ended || canMarkAbsent) ? (
            <div
              className="sb-card"
              style={{ padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}
            >
              {ended && b.session.mentorJoined ? (
                <button
                  type="button"
                  className="sb-btn sb-btn--secondary sb-btn--sm"
                  disabled={busy}
                  onClick={() => void act(() => completeBooking(b.id), 'اتسجلت الجلسة مكتملة')}
                >
                  <Icon name="check" />
                  الجلسة خلصت
                </button>
              ) : null}
              {canMarkAbsent ? (
                <button
                  type="button"
                  className="sb-btn sb-btn--ghost sb-btn--sm"
                  disabled={busy}
                  onClick={() => void act(() => markNoShow(b.id), 'اتسجّل إن الطالب ما حضرش')}
                >
                  الطالب ما حضرش
                </button>
              ) : null}
            </div>
          ) : null}

          <Link className="sb-btn sb-btn--ghost" href="/sessions" style={{ marginTop: 12 }}>
            <Icon name="chevR" />
            اخرج من الجلسة
          </Link>
        </aside>
      </div>
    </section>
  );
}
