'use client';

import { Avatar, EmptyState, Icon, Modal, Tabs, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SavedMentors } from '@/components/mentor/SavedMentors';
import { PageHead } from '@/components/PageHead';
import { useDemo, type DemoSession } from '@/lib/demo-store';
import { getMentor } from '@/lib/mock/data';

type Tab = 'up' | 'past' | 'saved';

function StatusBadge({ status }: { status: DemoSession['status'] }) {
  if (status === 'upcoming')
    return (
      <span className="sb-badge sb-badge--primary">
        <Icon name="calendar" />
        قادمة
      </span>
    );
  if (status === 'done')
    return (
      <span className="sb-badge sb-badge--success">
        <Icon name="check" />
        مكتملة
      </span>
    );
  return (
    <span className="sb-badge sb-badge--neutral">
      <Icon name="refresh" />
      ملغاة · تم الاسترداد
    </span>
  );
}

function RateModal({ onClose, onSend }: { onClose: () => void; onSend: () => void }) {
  const [rating, setRating] = useState(0);
  return (
    <Modal
      title="الجلسة كانت مفيدة؟"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="sb-btn sb-btn--primary"
            disabled={!rating}
            onClick={onSend}
          >
            ابعت التقييم
          </button>
          <button type="button" className="sb-btn sb-btn--ghost" onClick={onClose}>
            بعدين
          </button>
        </>
      }
    >
      <div className="rate" role="radiogroup" aria-label="التقييم">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === rating}
            aria-label={`${n} من 5`}
            className={n <= rating ? 'on' : undefined}
            onClick={() => setRating(n)}
          >
            <Icon name="star" />
          </button>
        ))}
      </div>
      <textarea
        className="sb-input"
        style={{ height: 96, padding: '12px 14px', marginTop: 14 }}
        placeholder="إيه أكتر حاجة فادتك؟ (اختياري)"
        aria-label="تعليقك على الجلسة"
      />
    </Modal>
  );
}

export function SessionsClient() {
  const router = useRouter();
  const toast = useToast();
  const demo = useDemo();
  const [tab, setTab] = useState<Tab>('up');
  const [cancelling, setCancelling] = useState<DemoSession | null>(null);
  const [rating, setRating] = useState<DemoSession | null>(null);

  // Personal page: signed-out visitors go to login and come back here after (UX Flows).
  const { ready, user, setAfter } = demo;
  useEffect(() => {
    if (ready && !user) {
      setAfter('/sessions');
      router.replace('/login');
    }
  }, [ready, user, setAfter, router]);

  if (!ready || !user) return <div className="page-body" aria-busy="true" />;

  const sessions = demo.sessions.filter((s) =>
    tab === 'up' ? s.status === 'upcoming' : s.status !== 'upcoming',
  );

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'جلساتي' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">جلساتي</h1>
            <p className="sb-lead">
              {user.name ? `أهلًا ${user.name.split(' ')[0]}.` : 'أهلًا بيك.'} كل حجوزاتك في مكان
              واحد.
            </p>
          </div>
          <Link className="sb-btn sb-btn--primary" href="/mentors">
            احجز جلسة جديدة
          </Link>
        </div>
        <div style={{ marginTop: 24 }}>
          <Tabs
            label="جلساتي"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'up', label: 'القادمة' },
              { key: 'past', label: 'السابقة' },
              { key: 'saved', label: 'المحفوظين' },
            ]}
          />
        </div>
      </PageHead>

      <section className="sb-container page-body" role="tabpanel">
        {tab === 'saved' ? (
          <SavedMentors />
        ) : sessions.length ? (
          <div className="sess">
            {sessions.map((s) => {
              const m = getMentor(s.mentorId);
              if (!m) return null;
              return (
                <div key={s.id} className="sb-card sess-row flip">
                  <Avatar name={m.name} verified tone={m.tone} />
                  <div className="g">
                    <b>
                      <Link href={`/mentor/${m.id}`} className="mlink">
                        {m.name}
                      </Link>
                    </b>
                    <span className="sb-small">
                      {s.type} · {m.major}
                    </span>
                  </div>
                  <div className="when">
                    <b>{s.day}</b>
                    <span className="sb-caption">
                      {s.time} · <span className="sb-num">{s.price}</span> ج.م
                    </span>
                  </div>
                  <StatusBadge status={s.status} />
                  <div className="acts">
                    {s.status === 'upcoming' ? (
                      <>
                        <button
                          type="button"
                          className="sb-btn sb-btn--primary sb-btn--sm"
                          onClick={() =>
                            toast({
                              kind: 'info',
                              title: 'الجلسة لسه ما بدأتش',
                              description: 'اللينك هيشتغل قبل الميعاد بـ 10 دقايق.',
                            })
                          }
                        >
                          <Icon name="video" />
                          ادخل الجلسة
                        </button>
                        <button
                          type="button"
                          className="sb-btn sb-btn--ghost sb-btn--sm"
                          onClick={() => setCancelling(s)}
                        >
                          إلغاء
                        </button>
                      </>
                    ) : null}
                    {s.status === 'done' ? (
                      <>
                        {s.rated ? (
                          <span className="sb-caption">شكرًا على تقييمك</span>
                        ) : (
                          <button
                            type="button"
                            className="sb-btn sb-btn--secondary sb-btn--sm"
                            onClick={() => setRating(s)}
                          >
                            <Icon name="star" />
                            قيّم الجلسة
                          </button>
                        )}
                        <Link className="sb-btn sb-btn--ghost sb-btn--sm" href={`/book/${m.id}`}>
                          احجز تاني
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sb-card">
            <EmptyState
              roomy
              title={tab === 'up' ? 'مفيش جلسات قادمة' : 'أول جلسة ليك هتظهر هنا'}
              description="ابدأ بكلية بتفكر فيها، واختار حد درس فيها."
              actions={
                <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/explore">
                  استكشف الكليات
                </Link>
              }
            />
          </div>
        )}
      </section>

      {cancelling ? (
        <Modal
          title="إلغاء الجلسة؟"
          onClose={() => setCancelling(null)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn sb-btn--primary"
                onClick={() => setCancelling(null)}
              >
                خليها
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                style={{ color: 'var(--error)' }}
                onClick={() => {
                  demo.updateSession(cancelling.id, { status: 'cancelled' });
                  setCancelling(null);
                  toast({
                    kind: 'success',
                    title: 'اتلغت الجلسة',
                    description: 'المبلغ هيرجع خلال 5 أيام عمل.',
                  });
                }}
              >
                إلغاء الجلسة
              </button>
            </>
          }
        >
          <p>
            جلستك مع {getMentor(cancelling.mentorId)?.name} يوم {cancelling.day} الساعة{' '}
            {cancelling.time}. لأنك بتلغي قبلها بأكتر من 24 ساعة، هيرجعلك المبلغ كامل خلال 5 أيام
            عمل.
          </p>
        </Modal>
      ) : null}

      {rating ? (
        <RateModal
          onClose={() => setRating(null)}
          onSend={() => {
            demo.updateSession(rating.id, { rated: true });
            setRating(null);
            toast({
              kind: 'success',
              title: 'شكرًا!',
              description: 'تقييمك بيساعد طلاب تانيين يختاروا.',
            });
          }}
        />
      ) : null}
    </>
  );
}
