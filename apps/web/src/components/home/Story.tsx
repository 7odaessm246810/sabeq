'use client';

import { Avatar, Icon, Segmented, VerifiedBadge, cx, type IconName } from '@sabeq/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion, useInView } from '@/lib/motion';

/* ---------------- 3 · PROBLEM ---------------- */

const TRIES: { icon: IconName; title: string; ui: ReactNode; verdict: ReactNode }[] = [
  {
    icon: 'google',
    title: 'Google',
    ui: (
      <>
        <div className="res">About 12,400,000 results (0.42s)</div>
        {[90, 70, 85, 60, 80].map((w) => (
          <div key={w} className="ln" style={{ width: `${w}%` }} />
        ))}
      </>
    ),
    verdict: (
      <>
        <b>ملايين النتايج.</b> ولا واحدة عن يومك في الكلية.
      </>
    ),
  },
  {
    icon: 'play',
    title: 'YouTube',
    ui: (
      <>
        <div
          style={{
            aspectRatio: '16/8',
            borderRadius: 8,
            background: 'var(--surface-sunken)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--muted)',
          }}
        >
          18:42
        </div>
        <div style={{ fontWeight: 600 }}>أحسن 10 كليات في مصر 2026</div>
        <div className="sb-caption">1.2 مليون مشاهدة</div>
      </>
    ),
    verdict: (
      <>
        <b>آراء عامة.</b> من حد ما درسش الكلية غالبًا.
      </>
    ),
  },
  {
    icon: 'people',
    title: 'جروبات السوشيال',
    ui: (
      <>
        <div className="bub">هندسة دي أكبر غلطة في حياتي</div>
        <div className="bub">لا هندسة تحفة متسمعش كلامه</div>
        <div className="bub">حد يعرف تنسيق حاسبات؟</div>
      </>
    ),
    verdict: (
      <>
        <b>كلام متضارب.</b> مش عارف تصدق مين.
      </>
    ),
  },
  {
    icon: 'ai',
    title: 'الذكاء الاصطناعي',
    ui: (
      <>
        <div className="bub me">أدخل هندسة ولا حاسبات؟</div>
        <div className="bub">
          يعتمد على اهتماماتك. الهندسة توفر أساسًا قويًا في... بينما الحاسبات...
        </div>
      </>
    ),
    verdict: (
      <>
        <b>إجابة مرتبة.</b> لكنها عامة ومش متجربة.
      </>
    ),
  },
  {
    icon: 'user',
    title: 'الأهل والأصحاب',
    ui: (
      <>
        <div className="bub">ادخل طب، مفيش أحسن منه</div>
        <div className="bub">ابن خالتك دخل تجارة واشتغل في بنك</div>
      </>
    ),
    verdict: (
      <>
        <b>نية حلوة.</b> بس تجربة حد تاني في وقت تاني.
      </>
    ),
  },
];

export function Problem() {
  return (
    <section className="sb-section" id="problem">
      <div className="sb-container">
        <div className="sb-reveal" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span className="sb-eyebrow-ar">المشكلة</span>
          <p className="q-big">
            «خلصت الثانوية<span className="dots">...</span> دلوقتي أدخل كلية إيه؟»
          </p>
          <p className="sb-lead" style={{ maxWidth: 620 }}>
            كل سنة، مئات الآلاف من الطلاب بيسألوا نفس السؤال، وبيدوّروا في نفس الأماكن.
          </p>
        </div>
        <div className="tries">
          {TRIES.map((t, i) => (
            <div key={t.title} className="try sb-reveal" data-delay={i * 90}>
              <div className="sb-card try-ui">
                <div className="try-h">
                  <span className="ic">
                    <Icon name={t.icon} />
                  </span>
                  {t.title}
                </div>
                {t.ui}
              </div>
              <div className="try-v">{t.verdict}</div>
            </div>
          ))}
        </div>
        <div className="verdict sb-reveal">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="sb-small">اللي الطالب بيلاقيه</span>
            <p className="sb-h1">
              <span className="strike">نقص في المعلومات</span>
            </p>
          </div>
          <div className="vline" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="sb-small">المشكلة الحقيقية</span>
            <p className="sb-h1">
              نقص في <span style={{ color: 'var(--primary)' }}>التجربة الحقيقية</span>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 4 · GENERIC vs REAL ---------------- */

type CompareKey = 'eng' | 'med' | 'com';

const COMPARE: Record<
  CompareKey,
  {
    url: string;
    title: string;
    text: string;
    title2: string;
    mentor: { name: string; path: string; quote: string };
  }
> = {
  eng: {
    url: 'www.example-guide.com › كليات › هندسة',
    title: 'كلية الهندسة: مدة الدراسة والأقسام والتنسيق',
    text: 'مدة الدراسة بكلية الهندسة خمس سنوات تشمل سنة إعدادية، وتضم أقسام الهندسة المدنية والمعمارية والكهربائية والميكانيكية...',
    title2: 'أفضل أقسام كلية الهندسة وفرص العمل',
    mentor: {
      name: 'أحمد محمد',
      path: 'هندسة القاهرة · حاسبات · 2025',
      quote:
        '«أنا درست هنا. الإعدادي صعب مش عشان المواد، عشان أول مرة محدش بيتابعك. ولو بتحب البرمجة، حاسبات مش الوحيد — اتصالات فيها برمجة كتير وتنسيقها أقل. دي الحاجات اللي كنت أتمنى أعرفها قبل ما أدخل.»',
    },
  },
  med: {
    url: 'www.example-guide.com › كليات › طب',
    title: 'كلية الطب البشري: سنوات الدراسة ونظام الامتياز',
    text: 'تبلغ مدة الدراسة في كلية الطب خمس سنوات يليها عامان امتياز وفق النظام الجديد، وتشمل المواد الأساسية والإكلينيكية...',
    title2: 'مرتبات الأطباء بعد التخرج في مصر',
    mentor: {
      name: 'سارة عبد الرحمن',
      path: 'طب عين شمس · امتياز · 2024',
      quote:
        '«محدش قالي إن أول سنتين أغلبهم حفظ ومعامل، وإن الإكلينيكي الحقيقي بيبدأ متأخر. لو مستني تلبس البالطو وتشوف مرضى من أول يوم، هتتصدم. ولو نفَسك طويل، هتحبها.»',
    },
  },
  com: {
    url: 'www.example-guide.com › كليات › تجارة',
    title: 'كلية التجارة: الشعب وشروط الالتحاق',
    text: 'تضم كلية التجارة شعب المحاسبة وإدارة الأعمال والاقتصاد، بالإضافة إلى برامج باللغة الإنجليزية بمصروفات...',
    title2: 'هل كلية التجارة لها مستقبل؟',
    mentor: {
      name: 'عمر طارق',
      path: 'تجارة القاهرة · محاسبة إنجليزي · 2022',
      quote:
        '«الفرق الحقيقي مش بين الشعب، بين اللي بيشتغل وهو بيدرس واللي لأ. أنا اتدربت في مكتب مراجعة من سنة تانية، وده اللي جابلي أول شغل — مش التقدير.»',
    },
  },
};

const WAVE = Array.from({ length: 34 }, (_, i) => 4 + Math.round(Math.abs(Math.sin(i * 1.7)) * 14));

export function Compare() {
  const [key, setKey] = useState<CompareKey>('eng');
  const [shown, setShown] = useState<CompareKey>('eng');
  const [fading, setFading] = useState(false);
  const [realIn, setRealIn] = useState(false);
  const realRef = useRef<HTMLDivElement>(null);

  useInView(realRef, () => setTimeout(() => setRealIn(true), 250), 0.3);

  // Fade out, swap content, fade back in (180ms, like the prototype).
  useEffect(() => {
    if (key === shown) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFading(true);
    const t = setTimeout(() => {
      setShown(key);
      setFading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [key, shown]);

  const d = COMPARE[shown];

  return (
    <section className="sb-section sb-section--subtle">
      <div className="sb-container">
        <div className="sb-sec-head sb-reveal">
          <span className="sb-eyebrow-ar">ليه المعلومات العادية مش كفاية؟</span>
          <h2 className="sb-h1">
            جوجل بيقولك الكلية فيها إيه.
            <br />
            الخريج بيقولك هتعيشها إزاي.
          </h2>
        </div>
        <div
          className="sb-reveal"
          style={{
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Segmented
            label="اختار الكلية"
            value={key}
            onChange={setKey}
            options={[
              ['eng', 'الهندسة'],
              ['med', 'الطب'],
              ['com', 'التجارة'],
            ]}
          />
          <span className="sb-caption">نفس السؤال، مصدرين مختلفين</span>
        </div>
        <div className="cmp sb-reveal">
          <div className="cmp-side cmp-g">
            <span className="cmp-tag">
              <Icon name="globe" />
              معلومات عامة
            </span>
            <div className={cx('snip swap', fading && 'out')}>
              <span className="u">{d.url}</span>
              <span className="t">{d.title}</span>
              <p>{d.text}</p>
            </div>
            <div className={cx('snip swap', fading && 'out')} style={{ opacity: fading ? 0 : 0.6 }}>
              <span className="u">{d.url}</span>
              <span className="t">{d.title2}</span>
              <div className="ln" style={{ width: '80%' }} />
            </div>
            <p className="sb-small" style={{ marginTop: 'auto' }}>
              صحيحة. مفيدة. لكن متشابهة في كل مكان — ومش بتجاوب على سؤالك أنت.
            </p>
          </div>
          <div className={cx('cmp-side cmp-in', realIn && 'is-in')} ref={realRef}>
            <span className="cmp-tag" style={{ color: 'var(--primary)' }}>
              <Icon name="sparkReal" />
              تجربة حقيقية
            </span>
            <div className={cx('real-msg swap', fading && 'out')}>
              <Avatar name={d.mentor.name} verified tone={2} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="real-meta">
                  <b style={{ color: 'var(--ink)', fontSize: 15 }}>{d.mentor.name}</b>
                  <VerifiedBadge />
                  <span>{d.mentor.path}</span>
                </div>
                <div className="real-bub">{d.mentor.quote}</div>
              </div>
            </div>
            <div className="voice" aria-label="رسالة صوتية مدتها دقيقتين و14 ثانية">
              <span className="play">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <rect x="3" y="5.5" width="18" height="13" rx="3.5" />
                  <path d="m10.5 9.5 4 2.5-4 2.5z" />
                </svg>
              </span>
              <span className="wave" aria-hidden="true">
                {WAVE.map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </span>
              <span className="sb-num sb-caption">2:14</span>
            </div>
            <div className="cmp-foot">
              <span className="sb-badge sb-badge--neutral">من جوه الكلية</span>
              <span className="sb-badge sb-badge--neutral">عن قسم بعينه</span>
              <span className="sb-badge sb-badge--neutral">بالحلو والوحش</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 5 · SOLUTION ---------------- */

const JOURNEY = [
  ['طالب', 'لسه مخلص ثانوية', 1060, 150],
  ['يختار الكلية', 'اللي بيفكر فيها', 880, 70],
  ['يلاقي خريجين موثقين', 'درسوا فيها فعلًا', 655, 230],
  ['يختار الشخص المناسب', 'حسب القسم والتقييم', 425, 70],
  ['يحجز جلسة ويتكلم معاه', 'في الموعد اللي يناسبه', 195, 230],
  ['قرار أفضل', 'مبني على تجربة حقيقية', 80, 150],
] as const;

const JOURNEY_D =
  'M1060 150 C980 150 980 70 880 70 S750 230 655 230 S520 70 425 70 S290 230 195 230 S110 150 80 150';

export function Solution() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const p = fillRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = prefersReducedMotion() ? '0' : String(len);
  }, []);

  useInView(
    wrapRef,
    () => {
      const p = fillRef.current;
      if (!p) return;
      const len = p.getTotalLength();
      const dur = prefersReducedMotion() ? 1 : 2600;
      const nodes = nodeRefs.current;
      let t0: number | null = null;
      const step = (ts: number) => {
        t0 ??= ts;
        const t = Math.min(1, (ts - t0) / dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        p.style.strokeDashoffset = String(len * (1 - e));
        nodes.forEach((n, i) => {
          if (n && e >= i / (nodes.length - 1) - 0.02) n.classList.add('on');
        });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    0.4,
  );

  return (
    <section className="sb-section">
      <div className="sb-container">
        <div className="sb-sec-head sb-sec-head--center sb-reveal">
          <span className="sb-eyebrow-ar">الحل</span>
          <h2 className="sb-h1">
            أنت مش محتاج Search Result جديد.
            <br />
            أنت محتاج <span style={{ color: 'var(--primary)' }}>شخص عاش التجربة.</span>
          </h2>
          <p className="sb-lead">سابق بيختصر المسافة بينك وبين الشخص اللي سبقك في نفس الطريق.</p>
        </div>
        <div className="journey" ref={wrapRef}>
          <svg viewBox="0 0 1136 300" preserveAspectRatio="none" aria-hidden="true">
            <path className="track" d={JOURNEY_D} />
            <path className="fill" ref={fillRef} d={JOURNEY_D} />
          </svg>
          {JOURNEY.map(([title, sub, x, y], i) => {
            const last = i === JOURNEY.length - 1;
            const up = y < 150 || last;
            return (
              <div
                key={title}
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                className={cx('jn', last && 'last', up && 'up')}
                style={{ left: x, top: y }}
              >
                <span className="d" />
                <span className="t">
                  <b>{title}</b>
                  <span>{sub}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
