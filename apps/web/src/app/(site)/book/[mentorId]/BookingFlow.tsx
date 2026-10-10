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
import { calendarFile, createBooking, devPay, type Booking } from '@/lib/bookings';
import { useDemo } from '@/lib/demo-store';
import type { MentorProfileData } from '@/lib/mentors';

const STEPS = ['الجلسة', 'اليوم', 'الوقت', 'الدفع', 'التأكيد'];
const FEE = STUDENT_FEE_PIASTERS / 100;
const DESCRIPTIONS: Record<SessionKind, string> = {
  consultation: 'أسئلتك عن الدراسة، الدكاترة، الحياة جوه الكلية.',
  comparison: 'لو محتار بين قسمين أو جامعتين.',
  quick_call: 'سؤال أو اتنين محددين.',
};
const PAY_METHODS: [IconName, string, string][] = [
  ['card', 'بطاقة بنكية', 'فيزا، ماستركارد، ميزة'],
  ['wallet', 'محفظة إلكترونية', 'فودافون كاش، اتصالات كاش، أورنج كاش'],
  ['phone', 'فوري', 'ادفع في أي منفذ خلال 24 ساعة'],
];

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
 * Booking (Phase 15 — design «06-booking»): session type → day → time → payment → confirmed, with
 * the mentor's real slots. Going to payment holds the slot for BOOKING_HOLD_MINUTES. Until Paymob
 * (Phase 16) only local development can confirm, with a clearly marked test payment.
 */
export function BookingFlow({
  mentor: m,
  initial,
  devPayments,
}: {
  mentor: MentorProfileData;
  initial: { kind: SessionKind; at: string | null; availability: Availability | null };
  devPayments: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const auth = useAuth();
  const demo = useDemo();
  const first = m.name.split(' ')[0] ?? m.name;

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<SessionKind>(initial.kind);
  const [availability, setAvailability] = useState(initial.availability);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState<string | null>(
    initial.at ? cairoDate(new Date(initial.at)) : null,
  );
  const [time, setTime] = useState<string | null>(initial.at);
  const [note, setNote] = useState('');
  const [pay, setPay] = useState(0);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  const offering = m.offerings.find((o) => o.kind === kind) ?? m.offerings[0];
  const total = (offering?.priceEgp ?? 0) + FEE;
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

  // Hold countdown on the payment step.
  useEffect(() => {
    if (!booking?.holdExpiresAt || booking.status !== 'pending') return;
    const end = Date.parse(booking.holdExpiresAt);
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [booking]);

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
    if (!devPayments) {
      setStep(3);
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

  async function confirmTestPayment() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      setBooking(await devPay(booking.id));
      setStep(4);
      toast({
        kind: 'success',
        title: 'تم حجز جلستك',
        description: `مع ${first} — هتلاقيها في «جلساتي».`,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
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

            {step === 3 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  الدفع
                </h2>
                {booking && booking.status === 'pending' ? (
                  <span className="sb-badge sb-badge--warning" style={{ width: 'max-content' }}>
                    <Icon name="clock" />
                    الموعد محجوز ليك {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}{' '}
                    دقيقة
                  </span>
                ) : null}
                {error ? <Banner kind="error" title={error} /> : null}
                <div role="radiogroup" aria-label="طريقة الدفع" className="opts">
                  {PAY_METHODS.map(([icon, label, sub], i) => (
                    <div
                      key={label}
                      className="sb-paymethod"
                      role="radio"
                      tabIndex={0}
                      aria-checked={pay === i}
                      onClick={() => setPay(i)}
                      onKeyDown={radioKeys(() => setPay(i))}
                    >
                      <span className="sb-radio" />
                      <span className="lbl">
                        {label}
                        <span className="sub">{sub}</span>
                      </span>
                      <span className="i22">
                        <Icon name={icon} />
                      </span>
                    </div>
                  ))}
                </div>
                {devPayments ? (
                  <Banner kind="info" title="دفع تجريبي — على جهاز التطوير بس">
                    الدفع الحقيقي (Paymob) بيتوصّل في المرحلة الجاية. الزرار ده بيأكّد الحجز من غير
                    أي فلوس، ومش موجود في الموقع الحقيقي.
                  </Banner>
                ) : (
                  <Banner kind="info" title="الدفع أونلاين بيفتح قريب جدًا">
                    لسه مش بنقبل دفع. احفظ {first} من ملفه وارجعله أول ما الحجز يفتح.
                  </Banner>
                )}
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
                    disabled={!devPayments || !booking || busy || left === 0}
                    onClick={() => void confirmTestPayment()}
                  >
                    ادفع {total} ج.م وأكّد الحجز{devPayments ? ' (تجريبي)' : ''}
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
            {row('سعر الجلسة', <span className="sb-num">{offering?.priceEgp}.00</span>)}
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
