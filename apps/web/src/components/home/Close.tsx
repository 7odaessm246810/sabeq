'use client';

import { Avatar, Icon, Stars, VerifiedBadge, cx, type IconName } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ReviewCard } from '@/components/cards';
import { REVIEWS } from '@/lib/mock/data';
import { drawPath, hidePath, useInView, useMagnetic, useReveal } from '@/lib/motion';

/** Applies the scroll-reveal behaviour to every `.sb-reveal` on the landing page. */
export function RevealRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return <div ref={ref}>{children}</div>;
}

/* ---------------- 11 · TRUST ---------------- */

const BARS: [number, number][] = [
  [5, 86],
  [4, 10],
  [3, 3],
  [2, 1],
  [1, 0],
];

const HISTORY: [string, string, string, 'success' | 'primary' | 'neutral', IconName][] = [
  ['أحمد محمد', 'هندسة حاسبات', 'مكتملة', 'success', 'check'],
  ['سارة عبد الرحمن', 'طب عين شمس', 'الخميس 7:00 م', 'primary', 'calendar'],
  ['مريم خالد', 'صيدلة', 'ملغاة · تم الاسترداد', 'neutral', 'refresh'],
];

export function Trust() {
  const barsRef = useRef<HTMLDivElement>(null);
  const [barsIn, setBarsIn] = useState(false);
  useInView(barsRef, () => setBarsIn(true), 0.5);

  return (
    <section className="sb-section">
      <div className="sb-container">
        <div className="sb-sec-head sb-reveal">
          <span className="sb-eyebrow-ar">الثقة</span>
          <h2 className="sb-h1">كل حاجة واضحة قبل ما تدفع.</h2>
          <p className="sb-lead">
            مفيش وعود. فيه ملفات موثقة، تقييمات من جلسات حقيقية، ودفع آمن تقدر ترجع فيه.
          </p>
        </div>
        <div className="bento">
          <div className="sb-card bx c3 sb-reveal">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Avatar name="سارة" size="lg" tone={2} verified />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <b>سارة عبد الرحمن</b>
                <VerifiedBadge />
              </div>
            </div>
            <h3>مرشدين موثقين</h3>
            <p className="d">مستند رسمي + مطابقة هوية + مقابلة. اللي ما يعدّيش، ما بيظهرش.</p>
          </div>
          <div className="sb-card bx c3 sb-reveal" data-delay={80}>
            <h3>تقييمات من جلسات حصلت فعلًا</h3>
            <div className="rv-sum">
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}
              >
                <span className="rv-big">4.9</span>
                <Stars rating={5} />
                <span className="sb-caption">312 تقييم</span>
              </div>
              <div className="bars" ref={barsRef}>
                {BARS.map(([stars, pct]) => (
                  <div key={stars}>
                    <span>{stars}</span>
                    <i>
                      <b style={{ width: barsIn ? `${pct}%` : 0 }} />
                    </i>
                    <span>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="d">
              التقييم بيتفتح بس بعد ما الجلسة تخلص. محدش يقدر يقيّم من غير ما يحجز.
            </p>
          </div>
          <div className="sb-card bx c2 sb-reveal">
            <h3>ملف واضح</h3>
            <dl className="sb-mentor-path" style={{ margin: 0 }}>
              <dt>الكلية</dt>
              <dd>كلية الطب</dd>
              <dt>الجامعة</dt>
              <dd>عين شمس</dd>
              <dt>التخرج</dt>
              <dd>2024</dd>
            </dl>
            <p className="d">نفس البيانات، بنفس الترتيب، لكل مرشد.</p>
          </div>
          <div className="sb-card bx c2 sb-reveal" data-delay={80}>
            <h3>دفع آمن</h3>
            <div className="pay-line">
              <span>
                <Icon name="card" />
                بطاقات
              </span>
              <span>
                <Icon name="wallet" />
                محافظ
              </span>
              <span>
                <Icon name="phone" />
                فوري
              </span>
            </div>
            <div className="sb-secure">
              <Icon name="lock" />
              مدفوعات مشفّرة
            </div>
            <p className="d">إلغاء مجاني قبل الجلسة بـ 24 ساعة، والفلوس ترجع كاملة.</p>
          </div>
          <div className="sb-card bx c2 sb-reveal" data-delay={160}>
            <h3>سجل حجوزاتك</h3>
            <div className="hist">
              {HISTORY.map(([name, sub, status, kind, icon]) => (
                <div key={name}>
                  <Avatar name={name} size="sm" />
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                    <b style={{ fontSize: 14 }}>{name}</b>
                    <span className="sb-caption">{sub}</span>
                  </span>
                  <span className="when">
                    <span className={`sb-badge sb-badge--${kind}`}>
                      <Icon name={icon} />
                      {status}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 12 · TESTIMONIALS ---------------- */

export function Testimonials() {
  return (
    <section className="sb-section sb-section--subtle">
      <div className="sb-container">
        <div
          className="sb-sec-head sb-reveal sec-head-row"
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'end',
            maxWidth: 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="sb-eyebrow-ar">آراء الطلاب</span>
            <h2 className="sb-h1">بعد الجلسة، مش قبلها.</h2>
          </div>
          <span className="sb-small">كل رأي مربوط بجلسة مكتملة.</span>
        </div>
        <div className="tgrid">
          {REVIEWS.slice(0, 3).map((r, i) => (
            <ReviewCard key={r.name} review={r} className="sb-reveal" delay={i * 90} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 13 · FOR MENTORS ---------------- */

export function ForMentors() {
  return (
    <section className="sb-section" id="for-mentors">
      <div className="sb-container forM">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="sb-reveal">
          <span className="sb-eyebrow-ar">للمرشدين</span>
          <h2 className="sb-h1">
            أنت عشت الطريق...
            <br />
            <span style={{ color: 'var(--primary)' }}>ساعد حد يختاره بشكل أفضل.</span>
          </h2>
          <p className="sb-lead">
            لو خريج أو معيد أو دكتور جامعة — خبرتك هي بالظبط اللي طالب الثانوية مش لاقيه.
          </p>
          <div className="ben">
            {(
              [
                ['شارك خبرتك', 'الحاجات اللي محدش قالهالك وانت داخل.'],
                ['ساعد طلاب حقيقيين', 'جلسة واحدة ممكن تغيّر رغبة كاملة.'],
                ['ابني سمعتك', 'ملف موثق وتقييمات تفضل معاك.'],
                ['دخل من وقتك', 'انت اللي بتحدد السعر والمواعيد.'],
              ] as const
            ).map(([b, s]) => (
              <div key={b}>
                <b>{b}</b>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <Link href="/become-mentor/apply" className="sb-btn sb-btn--primary sb-btn--lg">
              كن مرشدًا
            </Link>
            <Link href="/become-mentor" className="sb-btn sb-btn--ghost sb-btn--lg">
              إزاي التوثيق بيتم؟
            </Link>
          </div>
        </div>
        <div className="sb-card dash sb-reveal" data-delay={120}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>لوحة المرشد · أكتوبر</b>
            <span className="sb-status sb-status--on">
              <span className="sb-dot" />
              متاح للحجز
            </span>
          </div>
          <div className="kpis">
            <div>
              <span>جلسات الشهر</span>
              <b>12</b>
            </div>
            <div>
              <span>الأرباح</span>
              <b>2,640</b>
            </div>
            <div>
              <span>التقييم</span>
              <b>4.9</b>
            </div>
          </div>
          <b style={{ fontSize: 14, color: 'var(--muted)' }}>طلبات الأسبوع ده</b>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(
              [
                ['ملك أشرف', 'حاسبات ولا اتصالات؟', 'الخميس 7:00 م', 2],
                ['زياد سامح', 'الإعدادي وأول ترم', 'السبت 8:00 م', 3],
              ] as const
            ).map(([name, topic, when, tone]) => (
              <div key={name} className="req">
                <Avatar name={name} size="sm" tone={tone} />
                <span className="g">
                  <b style={{ fontSize: 14 }}>{name}</b>
                  <span className="sb-caption">
                    {topic} · {when}
                  </span>
                </span>
                <span className="sb-btn sb-btn--secondary sb-btn--sm">التفاصيل</span>
                <span className="sb-btn sb-btn--primary sb-btn--sm">قبول</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 14 · FINAL CTA ---------------- */

export function FinalCta() {
  const sectionRef = useRef<HTMLElement>(null);
  const wayRef = useRef<SVGPathElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const [inView, setInView] = useState(false);

  useMagnetic(ctaRef);
  useEffect(() => hidePath(wayRef.current), []);
  useInView(
    sectionRef,
    () => {
      setInView(true);
      drawPath(wayRef.current, 1800, 100);
    },
    0.35,
  );

  return (
    <section className={cx('sb-section--night final', inView && 'is-in')} ref={sectionRef}>
      <svg className="bg" viewBox="0 0 1280 620" preserveAspectRatio="none" aria-hidden="true">
        <path className="p" d="M1320 590 C1000 590 900 500 640 530 S260 590 -40 500" />
        <path className="p" d="M1320 40 C1040 40 900 110 640 90 S260 30 -40 110" />
        <path className="w" ref={wayRef} d="M1320 590 C1000 590 900 500 640 530 S260 590 -40 500" />
      </svg>
      <div className="sb-container" style={{ position: 'relative' }}>
        <h2>
          ما تختارش مستقبلك
          <br />
          من <s>Search Result</s>.
        </h2>
        <p className="l">اتكلم مع حد عاش الطريق قبلك.</p>
        <div className="ctas">
          <Link href="/explore" className="sb-btn sb-btn--night sb-btn--lg" ref={ctaRef}>
            استكشف الكليات{' '}
            <span className="sb-arrow" style={{ display: 'inline-flex' }}>
              <Icon name="arrow" />
            </span>
          </Link>
          <Link href="/become-mentor" className="sb-btn sb-btn--night-outline sb-btn--lg">
            كن مرشدًا
          </Link>
        </div>
      </div>
    </section>
  );
}
