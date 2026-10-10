'use client';

import { Avatar, EmptyState, Icon, MentorCardSkeleton, Stepper } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FacultyCard, MentorCard } from '@/components/cards';
import { HOME_MENTORS } from '@/lib/mock/data';
import { useHomeMentors } from './HomeMentors';
import { SearchSuggest } from './SearchSuggest';
import { prefersReducedMotion } from '@/lib/motion';

/* ---------------- 8 · EXPLORE FACULTIES ---------------- */

/** [label, university slug] — the fields offered at that university. */
const UNI_CHIPS = [
  ['الكل', ''],
  ['القاهرة', 'cairo'],
  ['عين شمس', 'ain-shams'],
  ['الإسكندرية', 'alexandria'],
  ['المنصورة', 'mansoura'],
  ['أسيوط', 'assiut'],
  ['العاصمة', 'capital'],
  ['الأزهر', 'azhar'],
] as const;

/** Re-plays the small «flip» entrance on each card without touching React-managed classes. */
function replayFlip(container: HTMLElement | null, selector: string, stagger: number) {
  if (!container || prefersReducedMotion()) return;
  container.querySelectorAll<HTMLElement>(selector).forEach((el, i) => {
    el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: 240,
        delay: i * stagger,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'backwards',
      },
    );
  });
}

export function ExploreSection() {
  const { kinds } = useHomeMentors();
  const [uni, setUni] = useState('');
  const shown = kinds.filter((f) => !uni || f.universities.includes(uni)).slice(0, 8);
  const gridRef = useRef<HTMLDivElement>(null);

  return (
    <section className="sb-section" id="explore">
      <div className="sb-container">
        <div className="ex-top">
          <div className="sb-sec-head sb-reveal" style={{ margin: 0 }}>
            <span className="sb-eyebrow-ar">استكشف الكليات</span>
            <h2 className="sb-h1">
              ابدأ من الكلية اللي
              <br />
              بتفكر فيها.
            </h2>
            <p className="sb-lead">أو دوّر على قسم، جامعة، أو حتى اسم مرشد.</p>
          </div>
          <SearchSuggest />
        </div>
        <div className="uni-row sb-reveal">
          <span className="sb-small" style={{ marginInlineEnd: 4 }}>
            الجامعة:
          </span>
          {UNI_CHIPS.map(([label, slug]) => (
            <button
              key={label}
              type="button"
              className="sb-chip sb-chip--sm"
              aria-pressed={slug === uni}
              onClick={() => {
                setUni(slug);
                replayFlip(gridRef.current, '.sb-faculty', 30);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="fgrid" ref={gridRef}>
          {shown.map((f, i) => (
            <FacultyCard key={f.id} faculty={f} className="sb-reveal" delay={(i % 4) * 70} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
          <Link
            href={uni ? `/explore?university=${uni}` : '/explore'}
            className="sb-btn sb-btn--secondary"
          >
            كل الكليات ({kinds.length}){' '}
            <span className="sb-arrow" style={{ display: 'inline-flex' }}>
              <Icon name="arrow" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 9 · MENTOR DISCOVERY ---------------- */

const MENTOR_FILTERS = ['الكل', 'هندسة', 'طب', 'صيدلة', 'حاسبات', 'تجارة', 'إعلام'];

export function MentorsSection() {
  const { mentors, total } = useHomeMentors();
  const [filter, setFilter] = useState('الكل');
  const [loading, setLoading] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const list =
    filter === 'الكل' ? mentors : mentors.filter((m) => (m.faculty + m.major).includes(filter));

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function pick(f: string) {
    setFilter(f);
    if (timer.current) clearTimeout(timer.current);
    const next = f === 'الكل' ? mentors : mentors.filter((m) => (m.faculty + m.major).includes(f));
    if (f === 'الكل' || !next.length) {
      setLoading(0);
      return;
    }
    // Short skeleton, then the results (Motion → Filters).
    setLoading(Math.min(3, next.length));
    timer.current = setTimeout(() => setLoading(0), 450);
  }

  return (
    <section className="sb-section sb-section--subtle">
      <div className="sb-container">
        <div className="sb-sec-head sb-reveal">
          <span className="sb-eyebrow-ar">المرشدين</span>
          <h2 className="sb-h1">ناس حقيقية، بملفات واضحة.</h2>
          <p className="sb-lead">
            كل ملف فيه الجامعة، الكلية، التخصص، سنة التخرج، التقييم، والسعر — قبل ما تضغط أي زرار.
          </p>
        </div>
        <div className="disc-bar sb-reveal">
          <div className="l">
            {MENTOR_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="sb-chip sb-chip--sm"
                aria-pressed={f === filter}
                onClick={() => pick(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {total ? (
              <span className="sb-caption">
                <span className="sb-num">{total.toLocaleString('en-US')}</span> مرشد موثق
              </span>
            ) : null}
            <Link href="/mentors" className="sb-btn sb-btn--secondary sb-btn--sm">
              <Icon name="filter" />
              كل الفلاتر
            </Link>
          </div>
        </div>
        <div className="mgrid" aria-busy={loading > 0}>
          {loading ? (
            Array.from({ length: loading }, (_, i) => <MentorCardSkeleton key={i} />)
          ) : list.length ? (
            list.map((m, i) => (
              <MentorCard
                key={`${filter}-${m.id}`}
                mentor={m}
                className="flip"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))
          ) : (
            <div className="sb-card" style={{ gridColumn: '1/-1' }}>
              <EmptyState
                title={
                  filter === 'الكل' ? 'أول المرشدين في الطريق' : `مفيش مرشدين في «${filter}» لسه`
                }
                description="كل مرشد بيتراجع بمستنداته قبل ما يظهر هنا. لو درست الكلية دي، انضم وساعد اللي جايين."
                actions={
                  <>
                    <Link href="/become-mentor" className="sb-btn sb-btn--primary sb-btn--sm">
                      انضم كمرشد
                    </Link>
                    <Link href="/explore" className="sb-btn sb-btn--secondary sb-btn--sm">
                      استكشف الكليات
                    </Link>
                  </>
                }
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
          <Link href="/mentors" className="sb-btn sb-btn--primary">
            شوف كل المرشدين{' '}
            <span className="sb-arrow" style={{ display: 'inline-flex' }}>
              <Icon name="arrow" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 10 · BOOKING WIDGET ---------------- */

const DOW = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const DAY_NAMES = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const HAS_SLOTS = [8, 9, 11, 13, 15, 16, 20, 22, 23, 27, 29];
const TIMES = ['4:00 م', '5:00 م', '6:30 م', '7:00 م', '8:00 م', '9:30 م'];
const STEPS = ['الجلسة', 'اليوم', 'الوقت', 'الدفع', 'التأكيد'];

export function BookingWidget() {
  const router = useRouter();
  const mentor = HOME_MENTORS[0];
  const [day, setDay] = useState(8);
  const [time, setTime] = useState<string | null>(null);
  const label = `${DAY_NAMES[(day + 4) % 7]} ${day} أكتوبر`;

  if (!mentor) return null;

  return (
    <section className="sb-section">
      <div className="sb-container book">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="sb-reveal">
          <span className="sb-eyebrow-ar">الحجز</span>
          <h2 className="sb-h1">
            تحجز في دقيقة،
            <br />
            وانت عارف كل حاجة.
          </h2>
          <p className="sb-lead">في كل خطوة من الحجز، الأربع أسئلة دول متجاوبين قدامك:</p>
          <div className="know">
            {(
              [
                ['مع مين', 'اسمه، كليته، وتوثيقه.'],
                ['هتحجز إيه', 'نوع الجلسة ومدتها.'],
                ['إمتى', 'اليوم والساعة بتوقيت القاهرة.'],
                ['بكام', 'السعر النهائي، من غير مفاجآت.'],
              ] as const
            ).map(([q, a]) => (
              <div key={q}>
                <span className="q" aria-hidden="true">
                  ؟
                </span>
                <span>
                  <b>{q}</b> — {a}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="sb-card book-ui sb-reveal">
          <div className="book-head">
            <Avatar name={mentor.name} verified />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
              <b>{mentor.name}</b>
              <span className="sb-caption">
                {mentor.major} · {mentor.uni} · {mentor.year}
              </span>
            </div>
            <span className="sb-badge sb-badge--neutral" style={{ marginInlineStart: 'auto' }}>
              جلسة 45 دقيقة · فيديو
            </span>
          </div>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
            <Stepper steps={STEPS} current={time ? 3 : 2} />
          </div>
          <div className="book-body">
            <div>
              <div className="sb-cal">
                <div className="sb-cal-head">
                  <b style={{ fontSize: 15 }}>أكتوبر 2026</b>
                  <span className="sb-caption">بتوقيت القاهرة</span>
                </div>
                <div className="sb-cal-grid" style={{ gap: 2 }}>
                  {DOW.map((d) => (
                    <div key={d} className="sb-cal-dow">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={`blank-${i}`} />
                  ))}
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = i + 1;
                    const has = HAS_SLOTS.includes(d);
                    const disabled = d < 6 || (!has && d % 3 === 0);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`sb-cal-day${has ? ' has-slots' : ''}`}
                        style={{ height: 36, fontSize: 13 }}
                        disabled={disabled}
                        aria-pressed={d === day}
                        aria-label={`${DAY_NAMES[(d + 4) % 7]} ${d} أكتوبر${has ? '، فيه مواعيد' : ''}`}
                        onClick={() => {
                          setDay(d);
                          setTime(null);
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <b style={{ fontSize: 15 }}>{label}</b>
              <div className="sb-slots" style={{ gridTemplateColumns: '1fr 1fr' }} key={day}>
                {TIMES.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className="sb-slot flip"
                    style={{ animationDelay: `${i * 35}ms` }}
                    disabled={(i + day) % 4 === 1}
                    aria-pressed={t === time}
                    onClick={() => setTime(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div
                className="sb-summary"
                style={{
                  padding: 0,
                  gap: 8,
                  marginTop: 'auto',
                  borderTop: '1px dashed var(--border)',
                  paddingTop: 12,
                }}
              >
                <div className="sb-summary-row">
                  <span>إمتى</span>
                  <b>{time ? `${label} · ${time}` : label}</b>
                </div>
                <div className="sb-summary-row">
                  <span>بكام</span>
                  <b>
                    <span className="sb-num">265</span> ج.م{' '}
                    <span className="sb-caption">شامل الرسوم</span>
                  </b>
                </div>
              </div>
              <button
                type="button"
                className="sb-btn sb-btn--primary sb-btn--block"
                disabled={!time}
                onClick={() => router.push(`/book/${mentor.id}`)}
              >
                {time ? 'كمّل للدفع — 265 ج.م' : 'اختر وقتًا أولًا'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
