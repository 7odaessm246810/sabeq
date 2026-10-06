'use client';

import { Avatar, Icon, VerifiedBadge, cx, type IconName } from '@sabeq/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MentorCard } from '@/components/cards';
import { HOME_MENTORS } from '@/lib/mock/data';
import { useInView } from '@/lib/motion';

const STEPS = [
  ['اختر الكلية', 'حدد الكلية أو القسم اللي بتفكر فيه.'],
  ['استكشف الخريجين', 'شوف الناس اللي درسوا فيها فعلًا.'],
  ['اختر الشخص المناسب', 'حسب التخصص، الخبرة، والتقييم.'],
  ['احجز جلسة', 'اختار اليوم والوقت اللي يناسبك.'],
  ['اتكلم معاه', 'اسأله عن تجربته الحقيقية — من غير تجميل.'],
  ['اتخذ قرارك', 'على أساس تجربة حقيقية، مش Search Result.'],
] as const;

const SELECTED = { borderColor: 'var(--primary)', boxShadow: 'inset 0 0 0 1px var(--primary)' };

/** The six mini product screens shown next to the steps (real UI, not illustrations — README §1). */
function buildScenes(): ReactNode[] {
  const m = HOME_MENTORS;
  return [
    <>
      <div className="sb-search-box" style={{ height: 48 }}>
        <span style={{ width: 20, height: 20, display: 'inline-flex' }}>
          <Icon name="search" />
        </span>
        <input value="هندسة" aria-label="بحث" readOnly tabIndex={-1} />
      </div>
      <div className="sb-small">كليات وأقسام</div>
      {(
        [
          ['كلية الهندسة — جامعة القاهرة', 214, 'building'],
          ['هندسة الحاسبات', 62, 'gear'],
          ['هندسة الاتصالات والإلكترونيات', 40, 'gear'],
        ] as const
      ).map(([t, n, ic], i) => (
        <div key={t} className="row-m" style={i === 0 ? SELECTED : undefined}>
          <span className="sb-faculty-ico" style={{ width: 36, height: 36 }}>
            <Icon name={ic} />
          </span>
          <span className="grow">
            <b style={{ fontSize: 15 }}>{t}</b>
            <span className="sb-caption">{n} مرشد موثق</span>
          </span>
        </div>
      ))}
    </>,
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>هندسة القاهرة</b>
        <span className="sb-caption">214 مرشد</span>
      </div>
      {m.slice(0, 4).map((x) => (
        <div key={x.id} className="row-m">
          <Avatar name={x.name} verified tone={x.tone} />
          <span className="grow">
            <b style={{ fontSize: 15 }}>{x.name}</b>
            <span className="sb-caption">
              {x.major} · {x.year}
            </span>
          </span>
          <span className="sb-rating" style={{ fontSize: 14 }}>
            <Icon name="star" />
            {x.rating}
          </span>
        </div>
      ))}
    </>,
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(
          [
            ['حاسبات', true],
            ['تخرج 2024+', true],
            ['تقييم 4.5+', false],
            ['أقل من 300 ج.م', false],
          ] as const
        ).map(([t, on]) => (
          <span
            key={t}
            className="sb-chip sb-chip--sm"
            aria-pressed={on}
            style={{ cursor: 'default' }}
          >
            {t}
          </span>
        ))}
      </div>
      {m[0] ? <MentorCard mentor={m[0]} /> : null}
    </>,
    <>
      <div className="sb-steps" style={{ marginBottom: 6 }}>
        <span className="sb-step is-done">
          <span className="sb-step-dot">
            <Icon name="check" />
          </span>
          <span className="sb-step-line" />
        </span>
        <span className="sb-step is-current">
          <span className="sb-step-dot">02</span>
          <span className="sb-step-label">اليوم والوقت</span>
          <span className="sb-step-line" />
        </span>
        <span className="sb-step">
          <span className="sb-step-dot">03</span>
        </span>
      </div>
      <b>الخميس 8 أكتوبر</b>
      <div className="sb-slots">
        {(
          [
            ['4:00 م', 0],
            ['5:00 م', -1],
            ['7:00 م', 1],
            ['8:00 م', 0],
            ['9:30 م', 0],
          ] as const
        ).map(([t, s]) => (
          <span
            key={t}
            className="sb-slot"
            aria-pressed={s === 1}
            aria-disabled={s === -1}
            style={{
              display: 'grid',
              placeItems: 'center',
              ...(s === -1
                ? {
                    background: 'var(--surface-sunken)',
                    borderColor: 'transparent',
                    color: 'var(--muted)',
                    textDecoration: 'line-through',
                  }
                : null),
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="sb-card sb-summary" style={{ padding: 14, marginTop: 'auto' }}>
        <div className="sb-summary-row">
          <span>مع</span>
          <b>أحمد محمد</b>
        </div>
        <div className="sb-summary-row">
          <span>جلسة 45 دقيقة · فيديو</span>
          <b>
            <span className="sb-num">250</span> ج.م
          </b>
        </div>
      </div>
      <span className="sb-btn sb-btn--primary sb-btn--block">كمّل للدفع</span>
    </>,
    <>
      <div className="call">
        <div className="tile">
          <Avatar name="أحمد" size="xl" />
          <span className="who">أحمد محمد</span>
        </div>
        <div className="tile">
          <Avatar name="ملك" size="xl" tone={2} />
          <span className="who">أنت</span>
        </div>
      </div>
      <div className="qs">
        <b style={{ fontSize: 13, color: 'var(--muted)' }}>أسئلتك للجلسة</b>
        {(
          [
            ['الإعدادي فعلًا صعب كده؟', true],
            ['حاسبات ولا اتصالات لو بحب البرمجة؟', true],
            ['بتذاكر إزاي وانت بتشتغل؟', false],
          ] as const
        ).map(([q, ok]) => (
          <label key={q}>
            <span className={cx('box', ok && 'ok')}>{ok ? <Icon name="check" /> : null}</span>
            {q}
          </label>
        ))}
      </div>
      <div className="ctl" aria-hidden="true">
        <span>
          <Icon name="mic" />
        </span>
        <span>
          <Icon name="video" />
        </span>
        <span className="end">
          <Icon name="x" />
        </span>
      </div>
    </>,
    <>
      <b>ملاحظاتي بعد الجلسة</b>
      <div
        className="row-m"
        style={{
          background: 'var(--accent-soft)',
          borderColor: 'transparent',
          fontSize: 14,
          lineHeight: 1.8,
        }}
      >
        «اتصالات فيها برمجة أكتر ما كنت فاكر، وتنسيقها أقرب ليا. هسأل حد من اتصالات كمان.»
      </div>
      <b style={{ marginTop: 6 }}>رغباتي — بعد التعديل</b>
      <div className="rank">
        <div className="top">
          <span className="k">01</span>هندسة القاهرة — اتصالات
        </div>
        <div>
          <span className="k">02</span>هندسة القاهرة — حاسبات
        </div>
        <div>
          <span className="k">03</span>حاسبات ومعلومات — عين شمس
        </div>
      </div>
    </>,
  ];
}

export function HowItWorks() {
  const [cur, setCur] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const scenes = buildScenes();

  useEffect(() => {
    const el = itemRefs.current[cur];
    // The progress bar follows the active step's offset — measured after render.

    if (el) setBarHeight(el.offsetTop);
  }, [cur]);

  // Scrolling through the list activates the step in the middle of the viewport.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCur(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    itemRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="sb-section sb-section--subtle" id="how">
      <div className="sb-container">
        <div className="sb-sec-head sb-reveal">
          <span className="sb-eyebrow-ar">كيف تعمل سابق؟</span>
          <h2 className="sb-h1">
            ست خطوات من الحيرة
            <br />
            لقرار انت مقتنع بيه.
          </h2>
        </div>
        <div className="how">
          <ol className="steps">
            <span className="bar" style={{ height: barHeight }} />
            {STEPS.map(([title, text], i) => (
              <li
                key={title}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className={cx('st', i === cur && 'on', i < cur && 'done')}
                data-i={i}
                tabIndex={0}
                aria-current={i === cur ? 'step' : undefined}
                onMouseEnter={() => setCur(i)}
                onFocus={() => setCur(i)}
                onClick={() => setCur(i)}
              >
                <span className="n">0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="stage sb-reveal" aria-live="polite">
            <div className="stage-bar">
              <i />
              <i />
              <i />
              <span className="url">sabeq.app</span>
            </div>
            {scenes.map((scene, i) => (
              <div
                key={i}
                className={cx('scene', i === cur && 'on')}
                aria-hidden={i !== cur}
                inert={i !== cur}
              >
                {scene}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- VERIFICATION ---------------- */

const VSTEPS: [IconName, string, string][] = [
  ['cap', 'مستند رسمي', 'شهادة تخرج أو كارنيه/إفادة قيد سارية.'],
  ['shield', 'مطابقة الهوية', 'الاسم مطابق لبطاقة الرقم القومي.'],
  ['chat', 'مقابلة قصيرة', 'فريق سابق بيتكلم معاه قبل ما يتنشر ملفه.'],
];

export function Verification() {
  const profRef = useRef<HTMLDivElement>(null);
  const [badge, setBadge] = useState(false);
  useInView(profRef, () => setBadge(true), 0.5);

  return (
    <section className="sb-section">
      <div className="sb-container ver">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="sb-reveal">
          <span className="sb-eyebrow-ar">التوثيق</span>
          <h2 className="sb-h1">
            مش أي حد.
            <br />
            شخص اتأكدنا إنه درس هناك فعلًا.
          </h2>
          <p className="sb-lead">
            كل مرشد على سابق بيعدّي على تحقق قبل ما يظهر للطلاب. علامة <VerifiedBadge /> معناها إننا
            راجعنا الجامعة والكلية والتخصص وسنة التخرج.
          </p>
          <div className="vsteps">
            {VSTEPS.map(([ic, t, d]) => (
              <div key={t} className="vs">
                <span className="ic">
                  <Icon name={ic} />
                </span>
                <div>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="sb-card prof sb-reveal"
          ref={profRef}
          style={{ boxShadow: 'var(--shadow-3)' }}
        >
          <div className="prof-head">
            <Avatar name="أحمد محمد" size="xl" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b style={{ fontSize: 22 }}>أحمد محمد</b>
              <span style={{ minHeight: 24 }}>{badge ? <VerifiedBadge animate /> : null}</span>
            </div>
          </div>
          <div className="vf">
            {(
              [
                ['الجامعة', 'جامعة القاهرة'],
                ['الكلية', 'كلية الهندسة'],
                ['التخصص', 'هندسة الحاسبات'],
                ['سنة التخرج', '2025'],
              ] as const
            ).map(([k, v], i) => (
              <div key={k}>
                <span>{k}</span>
                <b>{v}</b>
                <i className="ck" style={{ transitionDelay: `${300 + i * 150}ms` }}>
                  <Icon name="check" />
                </i>
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border)',
              paddingTop: 16,
            }}
          >
            <span className="sb-small">
              <span className="sb-rating">
                <Icon name="star" />
                4.9
              </span>{' '}
              · 32 جلسة مكتملة
            </span>
            <span className="sb-caption">آخر تحقق: سبتمبر 2026</span>
          </div>
        </div>
      </div>
    </section>
  );
}
