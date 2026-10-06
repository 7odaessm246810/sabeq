'use client';

import {
  Avatar,
  Banner,
  FieldError,
  Icon,
  Stepper,
  SuccessRing,
  cx,
  useToast,
  type IconName,
} from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Crumb } from '@/components/Crumb';
import { useDemo } from '@/lib/demo-store';
import type { Mentor } from '@/lib/mock/data';

const STEPS = ['الجلسة', 'اليوم', 'الوقت', 'الدفع', 'التأكيد'];
/** Service fee in EGP shown in the design summary. */
const FEE = 15;

const DAYS: [string, number, number][] = [
  ['الثلاثاء', 6, 0],
  ['الأربعاء', 7, 0],
  ['الخميس', 8, 4],
  ['الجمعة', 9, 2],
  ['السبت', 10, 0],
  ['الأحد', 11, 3],
  ['الاثنين', 12, 0],
  ['الثلاثاء', 13, 5],
  ['الأربعاء', 14, 2],
];

const TIMES: [string, boolean][] = [
  ['4:00 م', true],
  ['5:00 م', false],
  ['6:30 م', true],
  ['7:00 م', true],
  ['8:00 م', true],
  ['9:30 م', false],
];

const PAY_METHODS: [IconName, string, string][] = [
  ['card', 'بطاقة بنكية', 'فيزا، ماستركارد، ميزة'],
  ['wallet', 'محفظة إلكترونية', 'فودافون كاش، اتصالات كاش، أورنج كاش'],
  ['phone', 'فوري', 'ادفع في أي منفذ خلال 24 ساعة'],
];

type SessionType = [name: string, duration: string, description: string, price: number];

function sessionTypes(price: number): [SessionType, SessionType, SessionType] {
  return [
    [
      'استشارة عن الكلية',
      '45 دقيقة · فيديو',
      'أسئلتك عن الدراسة، الدكاترة، الحياة جوه الكلية.',
      price,
    ],
    [
      'مقارنة بين قسمين',
      '60 دقيقة · فيديو',
      'لو محتار بين قسمين أو جامعتين.',
      Math.round((price * 1.3) / 10) * 10,
    ],
    [
      'مكالمة سريعة',
      '20 دقيقة · صوت',
      'سؤال أو اتنين محددين.',
      Math.round((price * 0.5) / 10) * 10,
    ],
  ];
}

/** Radio cards: Enter / Space select (Accessibility → Semantics). */
function radioKeys(select: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  };
}

export function BookingFlow({ mentor: m }: { mentor: Mentor }) {
  const toast = useToast();
  const demo = useDemo();
  const types = sessionTypes(m.price);
  const first = m.name.split(' ')[0] ?? m.name;

  const [step, setStep] = useState(0);
  const [type, setType] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pay, setPay] = useState(0);
  const [account, setAccount] = useState('4242 4242 4242 4242');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simulateFail, setSimulateFail] = useState(false);
  const [failed, setFailed] = useState(false);
  const accountRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A slot picked on the profile («احجز الموعد ده») pre-fills day and time.
  const { pre, setPre } = demo;
  useEffect(() => {
    if (pre && pre.mentorId === m.id) {
      // One-time hand-off from the profile page.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDay(pre.day);
      setTime(pre.time);
      setPre(null);
    }
  }, [pre, setPre, m.id]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const t = types[type] ?? types[0];
  const total = t[3] + FEE;

  function next() {
    setStep((s) => (s === 0 && day && time ? 3 : s + 1));
  }
  function back() {
    setStep((s) => s - 1);
  }

  function choosePay(i: number) {
    setPay(i);
    setAccountError(null);
    setAccount(i === 0 ? '4242 4242 4242 4242' : '');
  }

  function submitPayment() {
    if (pay !== 2 && account.replace(/\D/g, '').length < 11) {
      setAccountError(pay === 0 ? 'رقم البطاقة ناقص.' : 'اكتب رقم المحفظة: 11 رقم يبدأ بـ 01.');
      accountRef.current?.focus();
      return;
    }
    setBusy(true);
    timer.current = setTimeout(() => {
      setBusy(false);
      if (simulateFail) {
        setFailed(true);
        return;
      }
      setFailed(false);
      demo.addSession({
        id: `s${Date.now()}`,
        mentorId: m.id,
        type: t[0],
        day: day ?? '',
        time: time ?? '',
        price: total,
        status: 'upcoming',
      });
      if (!demo.user) demo.signIn('ملك أشرف');
      setStep(4);
      toast({ kind: 'success', title: 'تم حجز جلستك', description: 'هيوصلك تأكيد على الموبايل.' });
    }, 1000);
  }

  const row = (k: string, v: React.ReactNode) => (
    <div className="sb-summary-row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );

  const navBack =
    step === 0 ? (
      <Link className="sb-btn sb-btn--ghost" href={`/mentor/${m.id}`}>
        <Icon name="chevR" />
        الملف
      </Link>
    ) : (
      <button type="button" className="sb-btn sb-btn--ghost" onClick={back}>
        <Icon name="chevR" />
        رجوع
      </button>
    );

  const nextButton = (label: string, disabled = false) => (
    <div className="nav-b">
      {navBack}
      <button
        type="button"
        className="sb-btn sb-btn--primary sb-btn--lg"
        disabled={disabled}
        onClick={next}
      >
        {label}{' '}
        <span className="sb-arrow i18">
          <Icon name="arrow" />
        </span>
      </button>
    </div>
  );

  return (
    <section className="sb-container page-body" style={{ maxWidth: 1080, paddingTop: 28 }}>
      <Crumb
        items={[
          { label: 'المرشدين', href: '/mentors' },
          { label: m.name, href: `/mentor/${m.id}` },
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
                  {types.map(([name, dur, desc, price], i) => (
                    <div
                      key={name}
                      className="opt"
                      role="radio"
                      tabIndex={0}
                      aria-checked={type === i}
                      onClick={() => setType(i)}
                      onKeyDown={radioKeys(() => setType(i))}
                    >
                      <span className="sb-radio" style={{ marginTop: 3 }} />
                      <span className="g">
                        <b>{name}</b>
                        <span className="sb-small">{desc}</span>
                        <span className="sb-caption">{dur}</span>
                      </span>
                      <span className="pr">
                        <span className="sb-num">{price}</span> ج.م
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
                    style={{ height: 88, padding: '12px 14px' }}
                    placeholder="مثلًا: الفرق بين حاسبات واتصالات لو بحب البرمجة"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                {nextButton(day && time ? 'كمّل' : 'اختار اليوم')}
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  اختار اليوم
                </h2>
                <span className="sb-small">
                  مواعيد {first} في الأسبوعين الجايين · بتوقيت القاهرة
                </span>
                <div className="days">
                  {DAYS.map(([name, date, count]) => {
                    const label = `${name} ${date} أكتوبر`;
                    return (
                      <button
                        key={label}
                        type="button"
                        className="day"
                        disabled={!count}
                        aria-pressed={day === label}
                        aria-label={`${label}، ${count ? `${count} مواعيد` : 'مفيش مواعيد'}`}
                        onClick={() => {
                          setDay(label);
                          setTime(null);
                        }}
                      >
                        <span>{name}</span>
                        <b>{date}</b>
                        <i>{count ? `${count} مواعيد` : 'مفيش'}</i>
                      </button>
                    );
                  })}
                </div>
                <Banner kind="info" title="الحجز بيتأكد فورًا بعد الدفع.">
                  وهيوصلك لينك الجلسة قبلها بساعة.
                </Banner>
                {nextButton('اختار الوقت', !day)}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  اختار الوقت
                </h2>
                <span className="sb-small">
                  {day} · {t[1]}
                </span>
                <div className="sb-slots">
                  {TIMES.map(([tm, ok]) => (
                    <button
                      key={tm}
                      type="button"
                      className="sb-slot"
                      disabled={!ok}
                      aria-pressed={time === tm}
                      onClick={() => setTime(tm)}
                    >
                      {tm}
                    </button>
                  ))}
                </div>
                <span className="sb-badge sb-badge--warning" style={{ width: 'max-content' }}>
                  <Icon name="clock" />
                  فاضل 4 مواعيد بس اليوم ده
                </span>
                {nextButton('كمّل للدفع', !time)}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h2 className="sb-h2" style={{ fontSize: 26 }}>
                  الدفع
                </h2>
                {failed ? (
                  <Banner kind="error" title="الدفع ما تمش">
                    البنك رفض العملية، وما اتخصمش أي مبلغ. جرّب بطاقة تانية أو محفظة.
                  </Banner>
                ) : null}
                <div role="radiogroup" aria-label="طريقة الدفع" className="opts">
                  {PAY_METHODS.map(([icon, label, sub], i) => (
                    <div
                      key={label}
                      className="sb-paymethod"
                      role="radio"
                      tabIndex={0}
                      aria-checked={pay === i}
                      onClick={() => choosePay(i)}
                      onKeyDown={radioKeys(() => choosePay(i))}
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
                {pay === 2 ? (
                  <Banner kind="info" title="هتاخد كود فوري بعد التأكيد.">
                    الحجز بيتأكد أول ما تدفع في أي منفذ خلال 24 ساعة.
                  </Banner>
                ) : (
                  <>
                    <div className={cx('sb-field', accountError && 'sb-field--error')}>
                      <label className="sb-label" htmlFor="cn">
                        {pay === 0 ? 'رقم البطاقة' : 'رقم المحفظة'}
                      </label>
                      <input
                        ref={accountRef}
                        className="sb-input"
                        id="cn"
                        inputMode="numeric"
                        autoComplete={pay === 0 ? 'cc-number' : 'tel'}
                        dir="ltr"
                        style={{ textAlign: 'right' }}
                        placeholder={pay === 0 ? '0000 0000 0000 0000' : '01x xxxx xxxx'}
                        value={account}
                        aria-invalid={Boolean(accountError)}
                        aria-describedby={
                          accountError ? 'cn-err' : pay === 1 ? 'cn-hint' : undefined
                        }
                        onChange={(e) => {
                          setAccount(e.target.value);
                          setAccountError(null);
                        }}
                      />
                      {pay === 1 ? (
                        <span className="sb-hint" id="cn-hint">
                          هيوصلك طلب تأكيد على الموبايل.
                        </span>
                      ) : null}
                      {accountError ? <FieldError id="cn-err">{accountError}</FieldError> : null}
                    </div>
                    {pay === 0 ? (
                      <div className="cardf">
                        <div className="sb-field">
                          <label className="sb-label" htmlFor="ce">
                            تاريخ الانتهاء
                          </label>
                          <input
                            className="sb-input"
                            id="ce"
                            dir="ltr"
                            autoComplete="cc-exp"
                            style={{ textAlign: 'right' }}
                            defaultValue="08 / 29"
                          />
                        </div>
                        <div className="sb-field">
                          <label className="sb-label" htmlFor="cv">
                            CVV
                          </label>
                          <input
                            className="sb-input"
                            id="cv"
                            dir="ltr"
                            autoComplete="cc-csc"
                            style={{ textAlign: 'right' }}
                            defaultValue="123"
                            maxLength={4}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                <div className="sb-secure">
                  <Icon name="lock" />
                  الدفع مشفّر. مش هنخصم أي مبلغ قبل ما تأكد.
                </div>
                <div className="nav-b">
                  <button type="button" className="sb-btn sb-btn--ghost" onClick={back}>
                    <Icon name="chevR" />
                    رجوع
                  </button>
                  <button
                    type="button"
                    className="sb-btn sb-btn--primary sb-btn--lg"
                    aria-busy={busy}
                    onClick={submitPayment}
                  >
                    ادفع {total} ج.م وأكّد الحجز
                  </button>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <div className="done-ok">
                <SuccessRing />
                <h2 className="sb-h2" style={{ fontSize: 28 }}>
                  تم حجز جلستك
                </h2>
                <p className="sb-lead" style={{ maxWidth: 460 }}>
                  جلستك مع {first} يوم {day} الساعة {time}. هيوصلك اللينك على الموبايل والإيميل
                  قبلها بساعة.
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
                    onClick={() => toast({ kind: 'success', title: 'اتضافت للتقويم' })}
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
              <Avatar name={m.name} verified tone={m.tone} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <b>{m.name}</b>
                <span className="sb-caption">
                  {m.major} · {m.uni}
                </span>
              </div>
            </div>
            <hr />
            {row('مع مين', m.name)}
            {row('هتحجز إيه', t[0])}
            {row('المدة', t[1])}
            {row(
              'إمتى',
              day ? (
                `${day}${time ? ` · ${time}` : ''}`
              ) : (
                <span className="sb-caption">لسه ما اخترتش</span>
              ),
            )}
            <hr />
            {row('سعر الجلسة', <span className="sb-num">{t[3]}.00</span>)}
            {row('رسوم الخدمة', <span className="sb-num">{FEE}.00</span>)}
            <hr />
            <div className="sb-summary-total">
              <span>بكام</span>
              <b>
                <span className="sb-num">{total}</span> ج.م
              </b>
            </div>
            <span className="sb-caption">إلغاء مجاني حتى 24 ساعة قبل الجلسة.</span>
          </div>
          <div className="demo">
            <span>للعرض:</span>
            <button
              type="button"
              className="sb-chip sb-chip--sm"
              aria-pressed={simulateFail}
              onClick={() => setSimulateFail((v) => !v)}
            >
              جرّب حالة فشل الدفع
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
