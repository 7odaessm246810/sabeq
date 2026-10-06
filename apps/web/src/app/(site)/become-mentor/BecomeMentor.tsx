'use client';

import { Icon } from '@sabeq/ui';
import { PLATFORM } from '@sabeq/types';
import Link from 'next/link';
import { useState } from 'react';
import { Crumb } from '@/components/Crumb';

/** Mentor share after the platform commission (ADR-0009: 10%). The prototype showed 15%. */
const MENTOR_SHARE = 1 - PLATFORM.commissionBps / 10_000;
const COMMISSION_PCT = PLATFORM.commissionBps / 100;

const STEPS = [
  ['01', 'قدّم', 'بياناتك ودراستك في 5 دقايق.'],
  ['02', 'وثّق', 'ارفع مستند رسمي + بطاقة.'],
  ['03', 'مقابلة قصيرة', '15 دقيقة مع فريق سابق.'],
  ['04', 'ابدأ', 'حدد سعرك ومواعيدك واستقبل طلبات.'],
] as const;

const FAQ = [
  ['لازم أكون اتخرجت؟', 'لأ. طلاب سنة تالتة فما فوق ينفع يقدموا، طالما معاهم إفادة قيد.'],
  ['أقدر أحدد السعر بنفسي؟', 'أيوه، من 100 لـ 500 ج.م للجلسة، وتقدر تغيّره في أي وقت.'],
  ['الفلوس بتوصلني إزاي؟', 'تحويل بنكي أو InstaPay أو فودافون كاش كل أسبوعين.'],
  ['لو الطالب ما حضرش؟', 'بتاخد أجر الجلسة كامل لو ما حضرش من غير إلغاء.'],
] as const;

export function BecomeMentor() {
  const [price, setPrice] = useState(250);
  const [sessions, setSessions] = useState(8);
  const income = Math.round(price * sessions * MENTOR_SHARE);

  return (
    <>
      <section className="bm-hero">
        <div className="sb-container bm-in">
          <div className="bm-copy">
            <Crumb items={[{ label: 'الرئيسية', href: '/' }, { label: 'كن مرشدًا' }]} />
            <h1 className="sb-display" style={{ fontSize: 52 }}>
              أنت عشت الطريق.
              <br />
              <span style={{ color: 'var(--primary)' }}>ساعد حد يختاره صح.</span>
            </h1>
            <p className="sb-lead">
              لو طالب في سنة تالتة أو أكتر أو خريج، خبرتك هي بالظبط اللي طالب الثانوية مش لاقيه. انت
              بتحدد السعر والمواعيد.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link className="sb-btn sb-btn--primary sb-btn--lg" href="/become-mentor/apply">
                قدّم دلوقتي
              </Link>
              <Link className="sb-btn sb-btn--ghost sb-btn--lg" href="#how-to">
                إزاي التوثيق بيتم؟
              </Link>
            </div>
          </div>
          <div className="sb-card calc">
            <b>احسب دخلك المتوقع</b>
            <div className="sb-field">
              <label className="sb-label" htmlFor="cp">
                سعر الجلسة: <span className="sb-num">{price}</span> ج.م
              </label>
              <input
                type="range"
                id="cp"
                min={100}
                max={500}
                step={10}
                value={price}
                style={{ accentColor: 'var(--primary)' }}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="sb-field">
              <label className="sb-label" htmlFor="cs">
                جلسات في الشهر: <span className="sb-num">{sessions}</span>
              </label>
              <input
                type="range"
                id="cs"
                min={1}
                max={30}
                value={sessions}
                style={{ accentColor: 'var(--primary)' }}
                onChange={(e) => setSessions(Number(e.target.value))}
              />
            </div>
            <div className="calc-out" aria-live="polite">
              <span className="sb-small">دخلك في الشهر تقريبًا</span>
              <b>
                <span className="sb-num">{income.toLocaleString('en-US')}</span> ج.م
              </b>
              <span className="sb-caption">بعد عمولة المنصة {COMMISSION_PCT}%.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sb-section sb-section--subtle" style={{ padding: '96px 0' }} id="how-to">
        <div className="sb-container">
          <div className="sb-sec-head">
            <span className="sb-eyebrow-ar">إزاي تبقى مرشد</span>
            <h2 className="sb-h1">أربع خطوات، وملفك يبقى موثق.</h2>
          </div>
          <div className="bm-steps">
            {STEPS.map(([n, t, d]) => (
              <div key={n} className="sb-card bm-step">
                <span className="sb-eyebrow">{n}</span>
                <b>{t}</b>
                <span className="sb-small">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sb-section" style={{ padding: '96px 0' }}>
        <div className="sb-container faq">
          <div className="sb-sec-head">
            <span className="sb-eyebrow-ar">أسئلة</span>
            <h2 className="sb-h1">قبل ما تقدّم</h2>
          </div>
          {FAQ.map(([q, a], i) => (
            <details key={q} className="sb-card qa" open={i === 0}>
              <summary>
                {q}
                <span className="i18">
                  <Icon name="chevron" />
                </span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
