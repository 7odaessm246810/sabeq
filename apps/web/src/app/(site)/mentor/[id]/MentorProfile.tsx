'use client';

import { Avatar, Icon, Modal, Stars, VerifiedBadge, useToast } from '@sabeq/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Crumb } from '@/components/Crumb';
import { BookingBox } from '@/components/mentor/BookingBox';
import type { Availability } from '@/lib/availability';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDemo } from '@/lib/demo-store';
import {
  getMentorReviews,
  listSaved,
  saveMentor,
  unsaveMentor,
  type MentorProfileData,
  type MentorReview,
} from '@/lib/mentors';

const monthYear = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });

/** «احفظ»: students only; signed-out visitors log in first and come back here. */
function useSaved(slug: string) {
  const { status, user } = useAuth();
  const { setAfter } = useDemo();
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isStudent = status === 'signed-in' && user?.role === 'student';

  useEffect(() => {
    if (!isStudent) return;
    let live = true;
    listSaved()
      .then((list) => live && setSaved(list.some((m) => m.slug === slug)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [isStudent, slug]);

  async function toggle() {
    if (status !== 'signed-in') {
      setAfter(`/mentor/${slug}`);
      router.push('/login');
      return;
    }
    if (!isStudent) {
      toast({ kind: 'info', title: 'حفظ المرشدين للطلبة بس.' });
      return;
    }
    setBusy(true);
    try {
      if (saved) await unsaveMentor(slug);
      else await saveMentor(slug);
      setSaved(!saved);
      toast({ kind: 'info', title: saved ? 'اتشال من المحفوظات' : 'تم حفظ المرشد' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    } finally {
      setBusy(false);
    }
  }

  return { saved, busy, toggle };
}

export function MentorProfile({
  mentor: m,
  availability,
}: {
  mentor: MentorProfileData;
  availability: Availability | null;
}) {
  const [why, setWhy] = useState(false);
  const save = useSaved(m.slug);
  const [more, setMore] = useState<{ reviews: MentorReview[]; page: number; hasMore: boolean }>({
    reviews: [],
    page: 1,
    hasMore: m.ratingCount > m.reviews.length,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const reviews = [...m.reviews, ...more.reviews];
  function loadMore() {
    setLoadingMore(true);
    getMentorReviews(m.slug, more.page + 1)
      .then((r) =>
        setMore((x) => ({
          reviews: [...x.reviews, ...r.reviews],
          page: x.page + 1,
          hasMore: r.hasMore,
        })),
      )
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }
  const first = m.name.split(' ')[0] ?? m.name;

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
            <Avatar name={m.name} size="xl" tone={m.tone} {...(m.photo ? { src: m.photo } : {})} />
            <div className="pt-id">
              <h1 className="sb-h2" style={{ fontSize: 28 }}>
                {m.name}
              </h1>
              <span>
                <VerifiedBadge animate />
              </span>
              <span className="sb-small">
                {m.major} · {m.university.name}
              </span>
              <div className="sb-mentor-stats">
                <span className="sb-rating">
                  <Icon name="star" />
                  <span className="sb-num">{m.rating === null ? 'جديد' : m.rating.toFixed(1)}</span>
                </span>
                <span className="sep" />
                <span>
                  <span className="sb-num">{m.sessions}</span> جلسة
                </span>
                {m.city ? (
                  <>
                    <span className="sep" />
                    <span>
                      <Icon name="pin" size={14} /> {m.city}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="sb-btn sb-btn--secondary sb-btn--sm save-btn"
              aria-pressed={save.saved}
              aria-busy={save.busy}
              disabled={save.busy}
              onClick={() => void save.toggle()}
            >
              {save.saved ? 'محفوظ' : 'احفظ'}
            </button>
          </div>

          <div className="sb-card block">
            <h2 className="bh">المسار الأكاديمي — موثق</h2>
            <div className="vpath">
              {(
                [
                  ['الكلية', m.faculty.name],
                  ['الجامعة', m.university.name],
                  ['التخصص', m.department ?? m.major],
                  [
                    m.kind === 'graduate' ? 'التخرج' : 'الصفة',
                    m.kind === 'graduate' && m.graduationYear ? (
                      <span key="y" className="sb-num">
                        {m.graduationYear}
                      </span>
                    ) : (
                      m.kindLabel
                    ),
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
            {m.bio ? (
              <p className="sb-lead" style={{ fontSize: 17, whiteSpace: 'pre-line' }}>
                {m.bio}
              </p>
            ) : (
              <p className="sb-small">{first} لسه ما كتبش نبذة عن نفسه.</p>
            )}
            {m.topics.length ? (
              <>
                <h3 className="bh2">بيتكلم عن</h3>
                <div className="chips-row">
                  {m.topics.map((t) => (
                    <span key={t} className="sb-chip sb-chip--sm" style={{ cursor: 'default' }}>
                      {t}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="sb-card block">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="bh" style={{ margin: 0 }}>
                التقييمات
              </h2>
              {m.rating !== null ? (
                <span className="sb-rating">
                  <Icon name="star" />
                  {m.rating.toFixed(1)} <span className="sb-caption">· {m.ratingCount} تقييم</span>
                </span>
              ) : null}
            </div>
            {reviews.length ? (
              <div className="rv-list">
                {reviews.map((r, i) => (
                  <div key={r.id} className="rv-item">
                    <Avatar name={r.name} size="sm" tone={((i % 3) + 1) as 1 | 2 | 3} />
                    <div>
                      <div
                        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <b style={{ fontSize: 14 }}>{r.name}</b>
                        <Stars rating={r.rating} />
                        <span className="sb-caption">{monthYear.format(new Date(r.date))}</span>
                      </div>
                      {r.topic ? <span className="sb-caption">جلسة عن: {r.topic}</span> : null}
                      {r.text ? <p>{r.text}</p> : null}
                    </div>
                  </div>
                ))}
                {more.hasMore ? (
                  <button
                    type="button"
                    className="sb-btn sb-btn--ghost sb-btn--sm"
                    style={{ alignSelf: 'center' }}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    onClick={loadMore}
                  >
                    اعرض تقييمات أكتر
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="sb-small" style={{ marginTop: 12 }}>
                لسه مفيش تقييمات. التقييمات بتيجي من طلبة حجزوا جلسات فعلًا مع {first}.
              </p>
            )}
          </div>
        </div>

        <aside className="prof-side">
          <BookingBox
            mentor={m}
            availability={availability}
            saved={save.saved}
            onSave={() => void (save.saved ? undefined : save.toggle())}
          />
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
            <li>مستند رسمي: شهادة تخرج أو إفادة قيد أو ما يثبت التعيين.</li>
            <li>مطابقة الاسم مع بطاقة الرقم القومي.</li>
            <li>فريق سابق بيراجع كل طلب بنفسه قبل ما الملف يظهر.</li>
          </ul>
        </Modal>
      ) : null}
    </section>
  );
}
