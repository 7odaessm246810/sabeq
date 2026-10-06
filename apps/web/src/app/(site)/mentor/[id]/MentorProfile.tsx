'use client';

import { Avatar, Icon, Modal, Stars, VerifiedBadge, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useState } from 'react';
import { Crumb } from '@/components/Crumb';
import { useDemo } from '@/lib/demo-store';
import { REVIEWS, type Mentor } from '@/lib/mock/data';

const QUICK_SLOTS = [
  ['الخميس 8 أكتوبر', '7:00 م'],
  ['الخميس 8 أكتوبر', '8:00 م'],
  ['السبت 10 أكتوبر', '5:00 م'],
] as const;

export function MentorProfile({ mentor: m }: { mentor: Mentor }) {
  const toast = useToast();
  const demo = useDemo();
  const [slot, setSlot] = useState(0);
  const [why, setWhy] = useState(false);
  const saved = Boolean(demo.saved[m.id]);
  const first = m.name.split(' ')[0];

  return (
    <section className="sb-container page-body" style={{ paddingTop: 28 }}>
      <Crumb
        items={[
          { label: 'الرئيسية', href: '/' },
          { label: 'المرشدين', href: '/mentors' },
          { label: m.name },
        ]}
      />
      <div className="prof-lay">
        <div className="col-main">
          <div className="sb-card prof-top">
            <Avatar name={m.name} size="xl" tone={m.tone} />
            <div className="pt-id">
              <h1 className="sb-h2" style={{ fontSize: 28 }}>
                {m.name}
              </h1>
              <span>
                <VerifiedBadge animate />
              </span>
              <span className="sb-small">
                {m.major} · {m.uni}
              </span>
              <div className="sb-mentor-stats">
                <span className="sb-rating">
                  <Icon name="star" />
                  <span className="sb-num">{m.rating}</span>
                </span>
                <span className="sep" />
                <span>
                  <span className="sb-num">{m.sessions}</span> جلسة
                </span>
                <span className="sep" />
                <span>
                  <Icon name="pin" size={14} /> {m.city}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="sb-btn sb-btn--secondary sb-btn--sm save-btn"
              aria-pressed={saved}
              onClick={() => {
                const now = !saved;
                demo.toggleSaved(m.id);
                toast({ kind: 'info', title: now ? 'تم حفظ المرشد' : 'اتشال من المحفوظات' });
              }}
            >
              {saved ? 'محفوظ' : 'احفظ'}
            </button>
          </div>

          <div className="sb-card block">
            <h2 className="bh">المسار الأكاديمي — موثق</h2>
            <div className="vpath">
              {(
                [
                  ['الكلية', m.faculty],
                  ['الجامعة', m.uni],
                  ['التخصص', m.major],
                  [
                    'التخرج',
                    <span key="y" className="sb-num">
                      {m.year}
                    </span>,
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                  <i>
                    <Icon name="check" />
                  </i>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="sb-btn sb-btn--link"
              style={{ fontSize: 14, marginTop: 12 }}
              onClick={() => setWhy(true)}
            >
              إزاي اتأكدنا من البيانات دي؟
            </button>
          </div>

          <div className="sb-card block">
            <h2 className="bh">عن {first}</h2>
            <p className="sb-lead" style={{ fontSize: 17 }}>
              {m.bio}
            </p>
            <h3 className="bh2">بيتكلم عن</h3>
            <div className="chips-row">
              {m.topics.map((t) => (
                <span key={t} className="sb-chip sb-chip--sm" style={{ cursor: 'default' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="sb-card block">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="bh" style={{ margin: 0 }}>
                التقييمات
              </h2>
              <span className="sb-rating">
                <Icon name="star" />
                {m.rating} <span className="sb-caption">· {m.sessions - 3} تقييم</span>
              </span>
            </div>
            <div className="rv-list">
              {REVIEWS.slice(0, 3).map((r) => (
                <div key={r.name} className="rv-item">
                  <Avatar name={r.name} size="sm" tone={r.tone} />
                  <div>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <b style={{ fontSize: 14 }}>{r.name}</b>
                      <Stars rating={r.rating} />
                      <span className="sb-caption">{r.date}</span>
                    </div>
                    <span className="sb-caption">جلسة عن: {r.topic}</span>
                    <p>{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="prof-side">
          <div className="sb-card book-box">
            <div className="sb-price" style={{ margin: 0 }}>
              <b>
                <span className="sb-num">{m.price}</span> ج.م
              </b>
              <span>جلسة 45 دقيقة · فيديو</span>
            </div>
            {m.available ? (
              <>
                <span className="sb-status sb-status--on">
                  <span className="sb-dot" />
                  {m.next}
                </span>
                <b style={{ fontSize: 14 }}>مواعيد قريبة</b>
                <div className="quick" role="radiogroup" aria-label="مواعيد قريبة">
                  {QUICK_SLOTS.map(([day, time], i) => (
                    <button
                      key={`${day}-${time}`}
                      type="button"
                      className="sb-slot"
                      aria-pressed={i === slot}
                      onClick={() => setSlot(i)}
                    >
                      <span>{day.split(' ').slice(0, 2).join(' ')}</span> · {time}
                    </button>
                  ))}
                </div>
                <Link
                  className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
                  href={`/book/${m.id}`}
                  onClick={() => {
                    const picked = QUICK_SLOTS[slot];
                    if (picked) demo.setPre({ mentorId: m.id, day: picked[0], time: picked[1] });
                  }}
                >
                  احجز الموعد ده
                </Link>
                <Link className="sb-btn sb-btn--ghost sb-btn--block" href={`/book/${m.id}`}>
                  كل المواعيد
                </Link>
              </>
            ) : (
              <>
                <span className="sb-status sb-status--off">
                  <span className="sb-dot" />
                  لا توجد مواعيد هذا الأسبوع
                </span>
                <button
                  type="button"
                  className="sb-btn sb-btn--secondary sb-btn--block"
                  onClick={() =>
                    toast({
                      kind: 'success',
                      title: 'هنبلغك',
                      description: `أول ما ${first} يفتح مواعيد.`,
                    })
                  }
                >
                  بلّغني لما يفتح مواعيد
                </button>
                <Link
                  className="sb-btn sb-btn--link"
                  href={`/mentors/${m.facId}`}
                  style={{ alignSelf: 'center', fontSize: 14 }}
                >
                  مرشدين مشابهين
                </Link>
              </>
            )}
            <div className="sb-secure">
              <Icon name="lock" />
              إلغاء مجاني قبل الجلسة بـ 24 ساعة.
            </div>
          </div>
        </aside>
      </div>

      {why ? (
        <Modal
          title="إزاي بنوثّق المرشدين؟"
          onClose={() => setWhy(false)}
          footer={
            <button type="button" className="sb-btn sb-btn--primary" onClick={() => setWhy(false)}>
              تمام
            </button>
          }
        >
          <ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 2 }}>
            <li>مستند رسمي: شهادة تخرج أو إفادة قيد.</li>
            <li>مطابقة الاسم مع بطاقة الرقم القومي.</li>
            <li>مقابلة قصيرة مع فريق سابق.</li>
          </ul>
        </Modal>
      ) : null}
    </section>
  );
}
