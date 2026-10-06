'use client';

import { Avatar, EmptyState, Icon, MentorCardSkeleton, Stepper, type IconName } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { FacultyCard, MentorCard } from '@/components/cards';
import { FACULTIES, HOME_FACULTIES, HOME_MENTORS, MENTORS } from '@/lib/mock/data';
import { prefersReducedMotion } from '@/lib/motion';

/* ---------------- search ---------------- */

const INDEX: [IconName, string, string][] = [
  ['building', 'كلية الهندسة', '214 مرشد'],
  ['gear', 'هندسة الحاسبات', '62 مرشد'],
  ['gear', 'هندسة الاتصالات', '40 مرشد'],
  ['pulse', 'كلية الطب', '168 مرشد'],
  ['pill', 'كلية الصيدلة', '96 مرشد'],
  ['code', 'حاسبات ومعلومات', '132 مرشد'],
  ['chart', 'كلية التجارة', '143 مرشد'],
  ['mic', 'كلية الإعلام', '58 مرشد'],
  ['scale', 'كلية الحقوق', '64 مرشد'],
  ['building', 'جامعة القاهرة', '412 مرشد'],
  ['building', 'جامعة عين شمس', '318 مرشد'],
];
const RECENT = ['هندسة الحاسبات', 'طب عين شمس'];
const POPULAR = [
  'هندسة ولا حاسبات؟',
  'صيدلة فارم دي',
  'طب أسنان خاص',
  'إعلام القاهرة',
  'تجارة إنجليزي',
];

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const parts = text.split(q);
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 ? <mark>{q}</mark> : null}
    </Fragment>
  ));
}

/** Where a suggestion leads (prototype: mentor name → profile, faculty or department → faculty, else explore). */
function targetFor(text: string): string {
  const mentor = MENTORS.find((m) => text.includes(m.name));
  if (mentor) return `/mentor/${mentor.id}`;
  const fac = FACULTIES.find(
    (f) => text.includes(f.name) || f.depts.some(([d]) => text.includes(d.replace('هندسة ', ''))),
  );
  return fac ? `/faculty/${fac.id}` : '/explore';
}

function SearchSuggest() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const s = q.trim();
  const facHits = s ? INDEX.filter(([, t]) => t.includes(s)).slice(0, 4) : [];
  const mentorHits = s
    ? HOME_MENTORS.filter((m) => (m.name + m.faculty + m.major + m.uni).includes(s)).slice(0, 2)
    : [];
  const firstTarget = facHits[0]?.[1] ?? mentorHits[0]?.name;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // «/» focuses the search, as the keyboard hint promises.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (text: string) => router.push(targetFor(text));

  return (
    <div className="sb-search sb-reveal" ref={wrapRef} style={{ zIndex: 5 }}>
      <div className="sb-search-box">
        <span style={{ display: 'inline-flex', width: 20, height: 20 }}>
          <Icon name="search" />
        </span>
        <input
          ref={inputRef}
          value={q}
          placeholder="ابحث عن كلية، قسم، جامعة أو مرشد"
          aria-label="بحث"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="home-suggest"
          onFocus={() => setOpen(true)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              e.currentTarget.blur();
            }
            if (e.key === 'Enter') {
              if (firstTarget) go(firstTarget);
              else router.push('/explore');
            }
          }}
        />
        <span className="sb-kbd">/</span>
      </div>
      <div className={`sb-suggest${open ? ' is-open' : ''}`} id="home-suggest" role="listbox">
        {!s ? (
          <>
            <div className="sb-suggest-group">
              <div className="sb-suggest-title">بحثت مؤخرًا</div>
              {RECENT.map((t) => (
                <div
                  key={t}
                  className="sb-suggest-item"
                  role="option"
                  aria-selected={false}
                  onClick={() => go(t)}
                >
                  <span className="ico">
                    <Icon name="history" />
                  </span>
                  {t}
                </div>
              ))}
            </div>
            <div className="sb-suggest-group">
              <div className="sb-suggest-title">الأكثر بحثًا الأسبوع ده</div>
              <div className="sb-suggest-chips">
                {POPULAR.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="sb-chip sb-chip--sm"
                    onClick={() => go(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : !facHits.length && !mentorHits.length ? (
          <div className="sb-empty" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16 }}>مفيش نتايج لـ «{s}»</h3>
            <p style={{ fontSize: 14 }}>جرّب اسم الكلية من غير «كلية»، أو اختار من الكليات تحت.</p>
          </div>
        ) : (
          <>
            {facHits.length ? (
              <div className="sb-suggest-group">
                <div className="sb-suggest-title">كليات وأقسام وجامعات</div>
                {facHits.map(([ic, t, meta], i) => (
                  <div
                    key={t}
                    className="sb-suggest-item"
                    role="option"
                    aria-selected={i === 0}
                    onClick={() => go(t)}
                  >
                    <span className="ico">
                      <Icon name={ic} />
                    </span>
                    <span>{highlight(t, s)}</span>
                    <span className="meta">{meta}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {mentorHits.length ? (
              <div className="sb-suggest-group">
                <div className="sb-suggest-title">مرشدين</div>
                {mentorHits.map((m) => (
                  <div
                    key={m.id}
                    className="sb-suggest-item"
                    role="option"
                    aria-selected={false}
                    onClick={() => go(m.name)}
                  >
                    <Avatar name={m.name} size="sm" verified tone={m.tone} />
                    <span>
                      {highlight(m.name, s)}{' '}
                      <span className="sb-caption">
                        · {highlight(m.major, s)}، {m.uni}
                      </span>
                    </span>
                    <span className="meta">★ {m.rating}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- 8 · EXPLORE FACULTIES ---------------- */

const UNI_CHIPS = [
  'الكل',
  'القاهرة',
  'عين شمس',
  'الإسكندرية',
  'المنصورة',
  'أسيوط',
  'حلوان',
  'جامعات خاصة',
];

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
  const [uni, setUni] = useState('الكل');
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
          {UNI_CHIPS.map((u) => (
            <button
              key={u}
              type="button"
              className="sb-chip sb-chip--sm"
              aria-pressed={u === uni}
              onClick={() => {
                setUni(u);
                replayFlip(gridRef.current, '.sb-faculty', 30);
              }}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="fgrid" ref={gridRef}>
          {HOME_FACULTIES.map((f, i) => (
            <FacultyCard key={f.id} faculty={f} className="sb-reveal" delay={(i % 4) * 70} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
          <Link href="/explore" className="sb-btn sb-btn--secondary">
            كل الكليات والأقسام (42){' '}
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
  const [filter, setFilter] = useState('الكل');
  const [loading, setLoading] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const list =
    filter === 'الكل'
      ? HOME_MENTORS
      : HOME_MENTORS.filter((m) => (m.faculty + m.major).includes(filter));

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function pick(f: string) {
    setFilter(f);
    if (timer.current) clearTimeout(timer.current);
    const next =
      f === 'الكل' ? HOME_MENTORS : HOME_MENTORS.filter((m) => (m.faculty + m.major).includes(f));
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
            <span className="sb-caption">1,240 مرشد</span>
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
                title={`مفيش مرشدين في «${filter}» بالعرض ده`}
                description="بنضيف مرشدين جداد كل أسبوع. تقدر تسيب إيميلك ونبلغك أول ما حد ينضم."
                actions={
                  <>
                    <button type="button" className="sb-btn sb-btn--primary sb-btn--sm">
                      بلّغني
                    </button>
                    <Link href="/mentors" className="sb-btn sb-btn--secondary sb-btn--sm">
                      شوف كل المرشدين
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
