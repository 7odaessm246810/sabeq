'use client';

import { Avatar, AvatarGroup, Icon, VerifiedBadge, cx } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { drawPath, hidePath, useMagnetic, useParallax } from '@/lib/motion';

const PATHS = [
  'M470 300 C400 300 390 120 290 120',
  'M470 300 C400 300 370 300 290 300',
  'M470 300 C400 300 390 480 290 480',
] as const;

const CHIPS = ['طب', 'هندسة', 'إعلام'] as const;

const CARDS = [
  {
    name: 'سارة عبد الرحمن',
    path: 'طب عين شمس · دفعة 2024',
    quote: '«سنة تالتة هي اللي بتفرز. الحفظ لوحده مش هيكفي — لازم تعرف ده من دلوقتي.»',
    outcome: '48 جلسة · ★ 5.0',
    tone: 2,
    top: 120,
    mentorId: 2,
  },
  {
    name: 'أحمد محمد',
    path: 'هندسة القاهرة · حاسبات · 2025',
    quote:
      '«الإعدادي صعب مش عشان المواد، عشان أول مرة محدش بيتابعك. ودي حاجات كنت أتمنى أعرفها قبل ما أدخل.»',
    outcome: '32 جلسة · ★ 4.9',
    tone: 1,
    top: 300,
    mentorId: 1,
  },
  {
    name: 'نور إبراهيم',
    path: 'إعلام القاهرة · صحافة رقمية · 2024',
    quote: '«الكلية بتديك الأساس، والشغل الحقيقي بيبدأ من التدريب في سنة تانية.»',
    outcome: '26 جلسة · ★ 4.8',
    tone: 3,
    top: 480,
    mentorId: 6,
  },
] as const;

const PROOF_AVATARS = ['أحمد محمد', 'سارة عبد', 'يوسف حسن', 'مريم خالد'];

/** Hero: «you» → three faculties → the people who walked each path (Landing01Hero). */
export function Hero() {
  const [active, setActive] = useState(1);
  const [go, setGo] = useState(false);
  /** Bumps to replay the one-time verified animation on the active card. */
  const [badgeRun, setBadgeRun] = useState(0);
  const [chipPos, setChipPos] = useState<{ x: number; y: number }[] | null>(null);

  const vizRef = useRef<HTMLDivElement>(null);
  const pathsLayer = useRef<SVGSVGElement>(null);
  const chipsLayer = useRef<HTMLDivElement>(null);
  const cardsLayer = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const walkRef = useRef<SVGPathElement>(null);
  const underlineRef = useRef<SVGPathElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const firstRun = useRef(true);

  useMagnetic(ctaRef);
  const layers = useMemo(
    () => [
      { ref: pathsLayer, depth: 6 },
      { ref: chipsLayer, depth: 10 },
      { ref: cardsLayer, depth: 16 },
    ],
    [],
  );
  useParallax(vizRef, layers);

  // Chips sit 42% along their path, like the prototype.
  useEffect(() => {
    const pts = pathRefs.current.map((p) => {
      if (!p) return { x: 0, y: 0 };
      const pt = p.getPointAtLength(p.getTotalLength() * 0.42);
      return { x: pt.x, y: pt.y };
    });
    // Measured from the rendered SVG, so it has to happen after mount.

    setChipPos(pts);
  }, []);

  // Intro: content rises in, the active path and the headline underline draw once.
  useEffect(() => {
    hidePath(walkRef.current);
    hidePath(underlineRef.current);
    const raf = requestAnimationFrame(() => {
      setGo(true);
      drawPath(walkRef.current, 1400, 500);
      drawPath(underlineRef.current, 900, 900);
    });
    const t = setTimeout(() => setBadgeRun((n) => n + 1), 1300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  // Switching path: redraw the walk along the new route and replay the badge.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    drawPath(walkRef.current, 700);
  }, [active]);

  function activate(i: number) {
    if (i === active) return;
    setActive(i);
    setBadgeRun((n) => n + 1);
  }

  return (
    <section className={cx('hero', go && 'go')}>
      <div className="hero-grid" aria-hidden="true" />
      <div className="sb-container hero-in">
        <div className="hero-copy">
          <span className="sb-pill in" style={{ transitionDelay: '80ms' }}>
            <span className="tag">تنسيق 2026</span>لطلاب الثانوية قبل ما يكتبوا الرغبات
          </span>
          <h1 className="sb-display in" style={{ transitionDelay: '160ms' }}>
            قبل ما تختار مستقبلك، اسأل حد{' '}
            <span className="sb-hl">
              عاش الطريق
              <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                <path ref={underlineRef} d="M198 9 C140 3 70 13 2 6" />
              </svg>
            </span>{' '}
            قبلك.
          </h1>
          <p className="sb-lead in" style={{ maxWidth: 520, transitionDelay: '260ms' }}>
            سابق بيوصلك بطلاب وخريجين موثقين درسوا فعلًا في الكلية اللي بتفكر فيها. احجز جلسة، واسمع
            التجربة من جوه.
          </p>
          <div className="hero-ctas in" style={{ transitionDelay: '360ms' }}>
            <Link href="/explore" className="sb-btn sb-btn--primary sb-btn--lg" ref={ctaRef}>
              استكشف الكليات{' '}
              <span className="sb-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
            <Link href="/become-mentor" className="sb-btn sb-btn--secondary sb-btn--lg">
              أنا خريج — عايز أبقى مرشد
            </Link>
          </div>
          <div className="hero-proof in" style={{ transitionDelay: '460ms' }}>
            <AvatarGroup>
              {PROOF_AVATARS.map((n, i) => (
                <Avatar key={n} name={n} size="sm" tone={((i % 3) + 1) as 1 | 2 | 3} />
              ))}
            </AvatarGroup>
            <span className="sb-small">
              مرشدين موثقين من جامعات حكومية وخاصة في{' '}
              <b style={{ color: 'var(--ink)' }}>القاهرة، الإسكندرية، المنصورة، وأسيوط</b>
            </span>
          </div>
        </div>

        <div
          className="viz"
          ref={vizRef}
          role="img"
          aria-label="رسم توضيحي: أنت، ثلاث كليات، وثلاثة أشخاص سبقوك في كل طريق"
        >
          <svg className="paths layer" viewBox="0 0 600 600" aria-hidden="true" ref={pathsLayer}>
            {PATHS.map((d, i) => (
              <path
                key={d}
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                className={cx('path', i === active && 'on')}
                d={d}
              />
            ))}
            <path className="walk" ref={walkRef} d={PATHS[active]} />
          </svg>
          <div className="layer" ref={chipsLayer} style={{ position: 'absolute', inset: 0 }}>
            {[120, 300, 480].map((top, i) => (
              <div
                key={top}
                className={cx('end-dot', i === active && 'on')}
                style={{ right: 310, top }}
              />
            ))}
            {CHIPS.map((label, i) => (
              <div
                key={label}
                className="fac"
                style={
                  chipPos?.[i]
                    ? { left: chipPos[i].x, top: chipPos[i].y }
                    : { visibility: 'hidden' }
                }
              >
                <button
                  type="button"
                  className="sb-chip"
                  aria-pressed={i === active}
                  onMouseEnter={() => activate(i)}
                  onFocus={() => activate(i)}
                  onClick={() => activate(i)}
                >
                  {label}
                </button>
              </div>
            ))}
            <div className="you-wrap">
              <div className="you in" style={{ transitionDelay: '200ms' }}>
                <span className="you-dot" />
                <b style={{ fontSize: 15 }}>أنت</b>
                <span className="sb-caption">
                  ثانوية عامة
                  <br />
                  علمي رياضة · 92%
                </span>
              </div>
            </div>
          </div>
          <div className="layer" ref={cardsLayer} style={{ position: 'absolute', inset: 0 }}>
            {CARDS.map((c, i) => (
              <div
                key={c.name}
                className={cx('sb-card mcard in', i === active && 'on')}
                style={{ top: c.top, transitionDelay: `${700 + i * 120}ms` }}
                tabIndex={0}
                role="button"
                aria-label={c.name}
                aria-pressed={i === active}
                onMouseEnter={() => activate(i)}
                onFocus={() => activate(i)}
                onClick={() => activate(i)}
              >
                <div className="row">
                  <Avatar name={c.name} size="sm" tone={c.tone} />
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                    <span className="nm">
                      {c.name}{' '}
                      <span className="vb">
                        <VerifiedBadge
                          iconOnly
                          animate={i === active && badgeRun > 0}
                          key={i === active ? badgeRun : 'idle'}
                        />
                      </span>
                    </span>
                    <span className="sb-caption">{c.path}</span>
                  </div>
                </div>
                <div className="quote">{c.quote}</div>
                <div className="outcome">
                  <span>{c.outcome}</span>
                  <Link
                    href={`/mentor/${c.mentorId}`}
                    className="sb-btn sb-btn--link"
                    style={{ fontSize: 13 }}
                  >
                    احجز جلسة
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="lbl-dir" aria-hidden="true">
            <span>أنت</span>
            <span>اختياراتك</span>
            <span>الناس اللي سبقوك</span>
          </div>
        </div>
      </div>
    </section>
  );
}
