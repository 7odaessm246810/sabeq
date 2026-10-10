'use client';

import {
  BOOKING_HOLD_MINUTES,
  FREE_CANCEL_HOURS,
  STUDENT_FEE_PIASTERS,
  type SessionKind,
} from '@sabeq/types';
import { cairoDate, formatCairoDay, formatCairoTime, weekdayOf, WEEKDAY_NAMES } from '@sabeq/utils';
import { Avatar, Banner, Icon, Stepper, SuccessRing, useToast, type IconName } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Crumb } from '@/components/Crumb';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getAvailability, type Availability } from '@/lib/availability';
import {
  calendarFile,
  createBooking,
  getBooking,
  paymentMethods,
  startPayment,
  type Booking,
  type PayMethod,
} from '@/lib/bookings';
import { useDemo } from '@/lib/demo-store';
import type { MentorProfileData } from '@/lib/mentors';

const STEPS = ['الجلسة', 'اليوم', 'الوقت', 'الدفع', 'التأكيد'];
const FEE = STUDENT_FEE_PIASTERS / 100;
const DESCRIPTIONS: Record<SessionKind, string> = {
  consultation: 'أسئلتك عن الدراسة، الدكاترة، الحياة جوه الكلية.',
  comparison: 'لو محتار بين قسمين أو جامعتين.',
  quick_call: 'سؤال أو اتنين محددين.',
};
const PAY_METHODS: [PayMethod, IconName, string, string][] = [
  ['card', 'card', 'بطاقة بنكية', 'فيزا، ماستركارد، ميزة'],
  ['wallet', 'wallet', 'محفظة إلكترونية', 'فودافون كاش، اتصالات كاش، أورنج كاش'],
  ['kiosk', 'phone', 'منافذ أمان ومصاري', 'ادفع كاش في أي منفذ خلال 24 ساعة'],
];
/** What the student does after choosing — the details are typed on Paymob's page, not ours. */
const PAY_NOTES: Record<PayMethod, [string, string]> = {
  card: [
    'هتكمّل على صفحة الدفع الآمنة بتاعة Paymob.',
    'بتكتب بيانات البطاقة هناك، وسابق ما بيشوفهاش.',
  ],
  wallet: ['هتكتب رقم المحفظة على صفحة Paymob.', 'وهيوصلك طلب تأكيد على الموبايل.'],
  kiosk: [
    'هتاخد كود دفع بعد التأكيد.',
    'الحجز بيتأكد أول ما تدفع في أي منفذ أمان أو مصاري خلال 24 ساعة.',
  ],
};
/** Kiosk payments take up to a day, so they're offered only for sessions this far ahead (API rule). */
const KIOSK_MIN_LEAD_MS = 48 * 3_600_000;
const POLL_MS = 2000;
const POLL_TRIES = 20;

/** After checkout: waiting for the bank, paid by kiosk code, or the slot was lost meanwhile. */
type Phase = 'pay' | 'checking' | 'slow' | 'kiosk' | 'lost';

/** Radio cards: Enter / Space select (Accessibility → Semantics). */
function radioKeys(select: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  };
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة في الاتصال. جرّب تاني.';

/**
 * Booking (Phases 15–16 — design «06-booking»): session type → day → time → payment → confirmed,
 * with the mentor's real slots. Going to payment holds the slot for BOOKING_HOLD_MINUTES; paying
 * happens on the gateway's page, which sends the student back to `/book/…/done` — rendered by this
 * same flow with `returning`, waiting for the API to hear from the gateway (the browser coming back
 * proves nothing).
 */
export function BookingFlow({
  mentor: m,
  initial,
  returning,
}: {
  mentor: MentorProfileData;
  initial: { kind: SessionKind; at: string | null; availability: Availability | null };
  /** The booking just paid for (the gateway's return page). */
  returning?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const auth = useAuth();
  const demo = useDemo();
  const first = m.name.split(' ')[0] ?? m.name;

  const [step, setStep] = useState(returning ? 3 : 0);
  const [kind, setKind] = useState<SessionKind>(initial.kind);
  const [availability, setAvailability] = useState(initial.availability);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState<string | null>(
    initial.at ? cairoDate(new Date(initial.at)) : null,
  );
  const [time, setTime] = useState<string | null>(initial.at);
  const [note, setNote] = useState('');
  const [pay, setPay] = useState<PayMethod>('card');
  const [methods, setMethods] = useState<{ methods: PayMethod[]; mode: string } | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>(returning ? 'checking' : 'pay');
  const [poll, setPoll] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [kioskOk, setKioskOk] = useState(false);

  const offering = m.offerings.find((o) => o.kind === kind) ?? m.offerings[0];
  const price = booking?.priceEgp ?? offering?.priceEgp ?? 0;
  const total = booking?.totalEgp ?? price + FEE;
  const days = availability?.days ?? [];
  const daySlots = days.find((d) => d.date === day)?.slots ?? [];

  // Changing the session type changes which slots fit.
  function chooseKind(k: SessionKind) {
    if (k === kind) return;
    setKind(k);
    setLoadingSlots(true);
    getAvailability(m.slug, k)
      .then((a) => {
        setAvailability(a);
        const all = a.days.flatMap((d) => d.slots);
        if (time && !all.includes(time)) {
          setTime(null);
          setDay(null);
        }
      })
      .catch(() => setAvailability(null))
      .finally(() => setLoadingSlots(false));
  }

  useEffect(() => {
    if (step !== 3 || methods) return;
    paymentMethods()
      .then(setMethods)
      .catch(() => setMethods({ methods: ['card', 'wallet'], mode: 'paymob' }));
  }, [step, methods]);

  // Hold countdown on the payment step; kiosk is offered only for sessions far enough ahead.
  useEffect(() => {
    if (!booking?.holdExpiresAt || booking.status !== 'pending') return;
    const end = Date.parse(booking.holdExpiresAt);
    const starts = Date.parse(booking.startsAt);
    const tick = () => {
      setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
      setKioskOk(starts - Date.now() >= KIOSK_MIN_LEAD_MS);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [booking]);

  // Back from checkout: wait for the gateway's confirmation to reach the API.
  useEffect(() => {
    if (!returning) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const b = await getBooking(returning);
        if (stopped) return;
        setBooking(b);
        setKind(b.kind);
        setTime(b.startsAt);
        setDay(cairoDate(new Date(b.startsAt)));
        if (b.status === 'confirmed' || b.status === 'completed') {
          setPhase('pay');
          setStep(4);
        } else if (b.status !== 'pending') {
          setPhase('lost');
        } else if (b.payment?.status === 'failed') {
          setFailed(true);
          setPay(b.payment.method === 'kiosk' ? 'card' : b.payment.method);
          setPhase('pay');
        } else if (b.payment?.method === 'kiosk' && b.payment.kioskReference) {
          setPhase('kiosk');
        } else if (++tries < POLL_TRIES) {
          timer = setTimeout(() => void check(), POLL_MS);
        } else {
          setPhase('slow');
        }
      } catch (err) {
        if (stopped) return;
        setError(errorText(err));
        setPhase('lost');
      }
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [returning, poll]);

  useEffect(() => {
    if (returning && step === 4)
      toast({
        kind: 'success',
        title: 'تم حجز جلستك',
        description: `مع ${first} — هتلاقيها في «جلساتي».`,
      });
  }, [returning, step, first, toast]);

  async function goToPayment() {
    if (!time) return;
    setError(null);
    if (auth.status !== 'signed-in') {
      const qs = new URLSearchParams({ kind, at: time }).toString();
      demo.setAfter(`/book/${m.slug}?${qs}`);
      router.push('/login');
      return;
    }
    if (auth.user?.role === 'student' && auth.user.needsProfile) {
      // The mentor sees the student's name with the booking: ask for it, then come back here.
      demo.setAfter(`/book/${m.slug}?${new URLSearchParams({ kind, at: time }).toString()}`);
      router.push('/welcome');
      return;
    }
    if (auth.user?.role !== 'student') {
      setError('الحجز للطلبة بس. ادخل بحساب طالب عشان تحجز.');
      return;
    }
    if (booking?.status === 'pending' && booking.startsAt === time && booking.kind === kind) {
      setStep(3); // still holding this one
      return;
    }
    setBusy(true);
    try {
      const b = await createBooking({
        mentorSlug: m.slug,
        kind,
        startsAt: time,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setBooking(b);
      setStep(3);
    } catch (err) {
      setError(errorText(err));
      // The slot may be gone: show what's left and suggest the nearest two.
      const fresh = await getAvailability(m.slug, kind).catch(() => null);
      if (fresh) setAvailability(fresh);
      setTime(null);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function payNow() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    setFailed(false);
    try {
      const { redirectUrl } = await startPayment(booking.id, pay);
      window.location.assign(redirectUrl); // the gateway's page; busy until the browser leaves
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  function addToCalendar() {
    if (!booking) return;
    const url = URL.createObjectURL(calendarFile(booking));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sabeq-session.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  const row = (k: string, v: React.ReactNode) => (
    <div className="sb-summary-row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
  const back = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };
  const navBack =
    step === 0 ? (
      <Link className="sb-btn sb-btn--ghost" href={`/mentor/${m.slug}`}>
        <Icon name="chevR" />
        الملف
      </Link>
    ) : (
      <button type="button" className="sb-btn sb-btn--ghost" onClick={back} disabled={busy}>
        <Icon name="chevR" />
        رجوع
      </button>
    );
  const nextButton = (label: string, onClick: () => void, disabled = false) => (
    <div className="nav-b">
      {navBack}
      <button
        type="button"
        className="sb-btn sb-btn--primary sb-btn--lg"
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={onClick}
      >
        {label}{' '}
        <span className="sb-arrow i18">
          <Icon name="arrow" />
        </span>
      </button>
    </div>
  );
  const when = time
    ? `${formatCairoDay(new Date(time))} · ${formatCairoTime(new Date(time))}`
    : null;
  const suggestions = days.flatMap((d) => d.slots).slice(0, 2);

  return (
    <section className="sb-container page-body" style={{ maxWidth: 1080, paddingTop: 28 }}>
      <Crumb
        items={[
          { label: 'المرشدين', href: '/mentors' },
          { label: m.name, href: `/mentor/${m.slug}` },
          { label: 'حجز جلسة' },
        ]}
      />
      <div style={{ marginTop: 20 }}>
        <Stepper steps={STEPS} current={step} />
      </div>
      <div className="bk-wrap">
        <div className="sb-card bk-panel">
          <div className="view" key={step}>
            {step === 0 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  نوع الجلسة
                </h2>
                <div role="radiogroup" aria-label="نوع الجلسة" className="opts">
                  {m.offerings.map((o) => (
                    <div
                      key={o.kind}
                      className="opt"
                      role="radio"
                      tabIndex={0}
                      aria-checked={kind === o.kind}
                      onClick={() => chooseKind(o.kind)}
                      onKeyDown={radioKeys(() => chooseKind(o.kind))}
                    >
                      <span className="sb-radio" style={{ marginTop: 3 }} />
                      <span className="g">
                        <b>{o.label}</b>
                        <span className="sb-small">{DESCRIPTIONS[o.kind]}</span>
                        <span className="sb-caption">
                          {o.durationMin} دقيقة · {o.medium === 'video' ? 'فيديو' : 'صوت'}
                        </span>
                      </span>
                      <span className="pr">
                        <span className="sb-num">{o.priceEgp}</span> ج.م
                      </span>
                    </div>
                  ))}
                </div>
                <div className="sb-field">
                  <label className="sb-label" htmlFor="nq">
                    عايز تسأله عن إيه؟ <span className="sb-caption">(اختياري — بيساعده يحضّر)</span>
                  </label>
                  <textarea
                    className="sb-input"
                    id="nq"
                    maxLength={1000}
                    style={{ height: 88, padding: '12px 14px' }}
                    placeholder="مثلًا: الفرق بين حاسبات واتصالات لو بحب البرمجة"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                {nextButton(
                  time ? 'كمّل' : 'اختار اليوم',
                  () => setStep(time ? 3 - 1 : 1),
                  loadingSlots,
                )}
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  اختار اليوم
                </h2>
                <span className="sb-small">مواعيد {first} في الأسابيع الجاية · بتوقيت القاهرة</span>
                {days.some((d) => d.slots.length) ? (
                  <div className="days">
                    {days.slice(0, 14).map((d) => {
                      const [, , dd] = d.date.split('-');
                      const count = d.slots.length;
                      const name = WEEKDAY_NAMES[weekdayOf(d.date)];
                      return (
                        <button
                          key={d.date}
                          type="button"
                          className="day"
                          disabled={!count}
                          aria-pressed={day === d.date}
                          aria-label={`${name} ${Number(dd)}، ${count ? `${count} مواعيد` : 'مفيش مواعيد'}`}
                          onClick={() => {
                            setDay(d.date);
                            setTime(null);
                          }}
                        >
                          <span>{name}</span>
                          <b>{Number(dd)}</b>
                          <i>{count ? `${count} مواعيد` : 'مفيش'}</i>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Banner kind="warning" title={`مفيش مواعيد لـ ${first} دلوقتي`}>
                    جرّب نوع جلسة تاني، أو{' '}
                    <Link href={`/mentors/${m.field.slug}`}>مرشدين مشابهين</Link>.
                  </Banner>
                )}
                <Banner kind="info" title="الحجز بيتأكد فورًا بعد الدفع.">
                  وهتلاقي لينك الجلسة في «جلساتي» قبلها.
                </Banner>
                {nextButton('اختار الوقت', () => setStep(2), !day)}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  اختار الوقت
                </h2>
                {error ? (
                  <Banner kind="error" title={error}>
                    {suggestions.length ? (
                      <>
                        أقرب مواعيد متاحة:{' '}
                        {suggestions.map((s, i) => (
                          <button
                            key={s}
                            type="button"
                            className="sb-btn sb-btn--link"
                            style={{ fontSize: 14 }}
                            onClick={() => {
                              setDay(cairoDate(new Date(s)));
                              setTime(s);
                              setError(null);
                            }}
                          >
                            {formatCairoDay(new Date(s))} {formatCairoTime(new Date(s))}
                            {i === 0 && suggestions.length > 1 ? '،' : ''}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </Banner>
                ) : null}
                <span className="sb-small">
                  {day ? `${formatCairoDay(new Date(daySlots[0] ?? `${day}T12:00:00Z`))} · ` : ''}
                  {offering?.durationMin} دقيقة
                </span>
                <div className="sb-slots">
                  {daySlots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="sb-slot"
                      aria-pressed={time === s}
                      onClick={() => setTime(s)}
                    >
                      {formatCairoTime(new Date(s))}
                    </button>
                  ))}
                </div>
                {daySlots.length && daySlots.length <= 4 ? (
                  <span className="sb-badge sb-badge--warning" style={{ width: 'max-content' }}>
                    <Icon name="clock" />
                    فاضل {daySlots.length} مواعيد بس اليوم ده
                  </span>
                ) : null}
                {nextButton('كمّل للدفع', () => void goToPayment(), !time)}
              </>
            ) : null}

            {step === 3 && phase === 'checking' ? (
              <div className="done-ok" aria-live="polite" aria-busy="true">
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  بنتأكد من الدفع…
                </h2>
                <p className="sb-lead" style={{ maxWidth: 460 }}>
                  بنستنى تأكيد العملية من البنك. ده بياخد ثواني — ما تقفلش الصفحة.
                </p>
              </div>
            ) : null}

            {step === 3 && phase === 'slow' ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  لسه مستنيين تأكيد البنك
                </h2>
                <Banner kind="info" title="التأكيد اتأخر شوية.">
                  لو الفلوس اتخصمت، الحجز هيتأكد لوحده أول ما البنك يرد، وهتلاقيه في «جلساتي». ولو
                  ما اتأكدش، أي مبلغ اتخصم بيرجع.
                </Banner>
                <div className="nav-b">
                  <Link className="sb-btn sb-btn--ghost" href="/sessions">
                    جلساتي
                  </Link>
                  <button
                    type="button"
                    className="sb-btn sb-btn--primary sb-btn--lg"
                    onClick={() => {
                      setPhase('checking');
                      setPoll((p) => p + 1);
                    }}
                  >
                    شوف تاني
                  </button>
                </div>
              </>
            ) : null}

            {step === 3 && phase === 'lost' ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  الموعد ده ما بقاش محجوز ليك
                </h2>
                {booking?.status === 'refunded' ? (
                  <Banner kind="warning" title="الدفع وصل بعد ما الموعد راح لحد تاني.">
                    رجّعنالك المبلغ كله ({booking.totalEgp} ج.م) على نفس طريقة الدفع.
                  </Banner>
                ) : (
                  <Banner kind="error" title={error ?? 'وقت حجز الموعد خلص قبل ما الدفع يكمل.'}>
                    ما اتخصمش أي مبلغ. اختار موعد تاني من مواعيد {first}.
                  </Banner>
                )}
                <div className="nav-b">
                  <Link className="sb-btn sb-btn--ghost" href={`/mentor/${m.slug}`}>
                    <Icon name="chevR" />
                    الملف
                  </Link>
                  <Link className="sb-btn sb-btn--primary sb-btn--lg" href={`/book/${m.slug}`}>
                    اختار موعد تاني
                  </Link>
                </div>
              </>
            ) : null}

            {step === 3 && phase === 'kiosk' && booking?.payment?.kioskReference ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  ادفع في أي منفذ أمان أو مصاري
                </h2>
                <div className="sb-card" style={{ padding: 20, textAlign: 'center' }}>
                  <span className="sb-caption">كود الدفع</span>
                  <b
                    className="sb-num"
                    style={{ display: 'block', fontSize: 32, letterSpacing: 2 }}
                  >
                    {booking.payment.kioskReference}
                  </b>
                  <span className="sb-small">
                    المبلغ <span className="sb-num">{booking.totalEgp}</span> ج.م
                  </span>
                </div>
                <Banner kind="info" title="قول للموظف إنك عايز تدفع لـ Paymob بالكود ده.">
                  {booking.holdExpiresAt
                    ? `الموعد محجوز ليك لحد ${formatCairoDay(new Date(booking.holdExpiresAt))} الساعة ${formatCairoTime(new Date(booking.holdExpiresAt))}. `
                    : ''}
                  الحجز بيتأكد أول ما تدفع، وهتلاقيه في «جلساتي».
                </Banner>
                <div className="nav-b">
                  <Link className="sb-btn sb-btn--ghost" href={`/mentor/${m.slug}`}>
                    <Icon name="chevR" />
                    الملف
                  </Link>
                  <Link className="sb-btn sb-btn--primary sb-btn--lg" href="/sessions">
                    روح لجلساتي
                  </Link>
                </div>
              </>
            ) : null}

            {step === 3 && phase === 'pay' ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  الدفع
                </h2>
                {booking?.status === 'pending' && left !== null && left > 0 && left < 3600 ? (
                  <span className="sb-badge sb-badge--warning" style={{ width: 'max-content' }}>
                    <Icon name="clock" />
                    الموعد محجوز ليك {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}{' '}
                    دقيقة
                  </span>
                ) : null}
                {failed ? (
                  <Banner kind="error" title="الدفع ما تمش">
                    البنك رفض العملية، وما اتخصمش أي مبلغ. جرّب بطاقة تانية أو محفظة.
                  </Banner>
                ) : null}
                {booking?.status === 'pending' && left === 0 ? (
                  <Banner kind="warning" title="وقت حجز الموعد خلص.">
                    <button
                      type="button"
                      className="sb-btn sb-btn--link"
                      style={{ fontSize: 14 }}
                      onClick={() => {
                        setBooking(null);
                        setTime(null);
                        setStep(2);
                      }}
                    >
                      اختار الموعد تاني
                    </button>
                  </Banner>
                ) : null}
                {error ? <Banner kind="error" title={error} /> : null}
                <div role="radiogroup" aria-label="طريقة الدفع" className="opts">
                  {PAY_METHODS.map(([method, icon, label, sub]) => {
                    const off =
                      !methods?.methods.includes(method) || (method === 'kiosk' && !kioskOk);
                    return (
                      <div
                        key={method}
                        className="sb-paymethod"
                        role="radio"
                        tabIndex={off ? -1 : 0}
                        aria-checked={pay === method}
                        aria-disabled={off}
                        style={off ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        onClick={() => (off ? undefined : setPay(method))}
                        onKeyDown={radioKeys(() => (off ? undefined : setPay(method)))}
                      >
                        <span className="sb-radio" />
                        <span className="lbl">
                          {label}
                          <span className="sub">
                            {method === 'kiosk' && methods?.methods.includes('kiosk') && !kioskOk
                              ? 'متاح بس للجلسات اللي بعد يومين أو أكتر'
                              : sub}
                          </span>
                        </span>
                        <span className="i22">
                          <Icon name={icon} />
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Banner kind="info" title={PAY_NOTES[pay][0]}>
                  {PAY_NOTES[pay][1]}
                </Banner>
                {methods?.mode === 'fake' ? (
                  <Banner kind="warning" title="وضع تجربة — على جهاز التطوير بس">
                    هتروح لصفحة دفع تجريبية بدل Paymob، ومفيش أي فلوس حقيقية.
                  </Banner>
                ) : null}
                <div className="sb-secure">
                  <Icon name="lock" />
                  الدفع مشفّر. مش هنخصم أي مبلغ قبل ما تأكد.
                </div>
                <div className="nav-b">
                  <button
                    type="button"
                    className="sb-btn sb-btn--ghost"
                    onClick={back}
                    disabled={busy}
                  >
                    <Icon name="chevR" />
                    رجوع
                  </button>
                  <button
                    type="button"
                    className="sb-btn sb-btn--primary sb-btn--lg"
                    aria-busy={busy}
                    disabled={
                      !booking ||
                      busy ||
                      left === 0 ||
                      !methods?.methods.includes(pay) ||
                      (pay === 'kiosk' && !kioskOk)
                    }
                    onClick={() => void payNow()}
                  >
                    ادفع {total} ج.م وأكّد الحجز
                  </button>
                </div>
              </>
            ) : null}

            {step === 4 && booking ? (
              <div className="done-ok">
                <SuccessRing />
                <h2 className="sb-h2" style={{ fontSize: 28 }}>
                  تم حجز جلستك
                </h2>
                <p className="sb-lead" style={{ maxWidth: 460 }}>
                  جلستك مع {first} {formatCairoDay(new Date(booking.startsAt))} الساعة{' '}
                  {formatCairoTime(new Date(booking.startsAt))}. لينك الجلسة هيظهر في «جلساتي»
                  قبلها.
                </p>
                <div
                  style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}
                >
                  <Link className="sb-btn sb-btn--primary" href="/sessions">
                    روح لجلساتي
                  </Link>
                  <button
                    type="button"
                    className="sb-btn sb-btn--secondary"
                    onClick={addToCalendar}
                  >
                    أضف للتقويم
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="bk-side">
          <div className="sb-card sb-summary">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Avatar name={m.name} verified tone={m.tone} {...(m.photo ? { src: m.photo } : {})} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <b>{m.name}</b>
                <span className="sb-caption">
                  {m.major} · {m.university.name}
                </span>
              </div>
            </div>
            <hr />
            {row('مع مين', m.name)}
            {row('هتحجز إيه', offering?.label)}
            {row(
              'المدة',
              `${offering?.durationMin ?? ''} دقيقة · ${offering?.medium === 'audio' ? 'صوت' : 'فيديو'}`,
            )}
            {row('إمتى', when ?? <span className="sb-caption">لسه ما اخترتش</span>)}
            <hr />
            {row('سعر الجلسة', <span className="sb-num">{price}.00</span>)}
            {row('رسوم الخدمة', <span className="sb-num">{FEE}.00</span>)}
            <hr />
            <div className="sb-summary-total">
              <span>بكام</span>
              <b>
                <span className="sb-num">{total}</span> ج.م
              </b>
            </div>
            <span className="sb-caption">
              إلغاء مجاني حتى {FREE_CANCEL_HOURS} ساعة قبل الجلسة. الموعد بيتحجز ليك{' '}
              {BOOKING_HOLD_MINUTES} دقايق وانت بتدفع.
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
