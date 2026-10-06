'use client';

import { EmptyState, Icon, Tabs, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useState } from 'react';
import { MentorCard, ReviewCard } from '@/components/cards';
import { PageHead } from '@/components/PageHead';
import { MENTORS, REVIEWS, type Faculty } from '@/lib/mock/data';

type Tab = 'about' | 'depts' | 'mentors' | 'reviews';

export function FacultyClient({ faculty: f }: { faculty: Faculty }) {
  const [tab, setTab] = useState<Tab>('about');
  const toast = useToast();
  const mentors = MENTORS.filter((m) => m.facId === f.id);

  return (
    <>
      <PageHead
        className="fac-head"
        crumbs={[
          { label: 'الرئيسية', href: '/' },
          { label: 'استكشف الكليات', href: '/explore' },
          { label: f.full },
        ]}
      >
        <div className="ph-row">
          <div className="fac-title">
            <span className="sb-faculty-ico big">
              <Icon name={f.icon} />
            </span>
            <div>
              <h1 className="sb-h1">{f.full}</h1>
              <p className="sb-lead">{f.desc}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="sb-btn sb-btn--primary sb-btn--lg" href={`/mentors/${f.id}`}>
              كلّم حد درس هنا{' '}
              <span className="sb-arrow i18">
                <Icon name="arrow" />
              </span>
            </Link>
          </div>
        </div>
        <div className="fac-stats">
          <div>
            <b className="sb-num">{f.years}</b>
            <span>سنين دراسة</span>
          </div>
          <div>
            <b className="sb-num">{f.depts.length}</b>
            <span>أقسام/مسارات</span>
          </div>
          <div>
            <b className="sb-num">{f.mentors}</b>
            <span>مرشد موثق</span>
          </div>
          <div>
            <b className="sb-num">4.8</b>
            <span>متوسط تقييم الجلسات</span>
          </div>
        </div>
        <div style={{ marginTop: 28 }}>
          <Tabs
            label="أقسام صفحة الكلية"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'about', label: 'عن الكلية' },
              { key: 'depts', label: 'الأقسام' },
              {
                key: 'mentors',
                label: (
                  <>
                    المرشدين <span className="sb-caption sb-num">{mentors.length}</span>
                  </>
                ),
              },
              { key: 'reviews', label: 'آراء الطلاب' },
            ]}
          />
        </div>
      </PageHead>

      <section className="sb-container page-body" role="tabpanel">
        <div className="flip" key={tab}>
          {tab === 'about' ? (
            <div className="about-grid">
              <div className="col-main">
                <h2 className="sb-h2" style={{ fontSize: 24 }}>
                  الدراسة باختصار
                </h2>
                <p className="sb-lead" style={{ marginTop: 8 }}>
                  {f.about}
                </p>
                <div className="gen-real">
                  <div className="sb-card gr-g">
                    <span className="cmp-tag2">
                      <Icon name="globe" />
                      اللي هتلاقيه على النت
                    </span>
                    <p>{f.generic}</p>
                  </div>
                  <div className="sb-card gr-r">
                    <span className="cmp-tag2" style={{ color: 'var(--primary)' }}>
                      <Icon name="sparkReal" />
                      اللي الخريجين بيقولوه
                    </span>
                    {f.real.map((r) => (
                      <blockquote key={r}>{r}</blockquote>
                    ))}
                  </div>
                </div>
              </div>
              <aside className="sb-card side-cta">
                <b>محتار لسه؟</b>
                <p className="sb-small">جلسة 45 دقيقة مع حد درس {f.name} بتوفر عليك شهور تفكير.</p>
                {mentors[0] ? <MentorCard mentor={mentors[0]} compact /> : null}
                <Link className="sb-btn sb-btn--primary sb-btn--block" href={`/mentors/${f.id}`}>
                  شوف كل المرشدين
                </Link>
              </aside>
            </div>
          ) : null}

          {tab === 'depts' ? (
            <div className="dept-grid">
              {f.depts.map(([name, count]) => (
                <Link
                  key={name}
                  className="sb-card sb-card--interactive dept"
                  href={`/mentors/${f.id}`}
                >
                  <b>{name}</b>
                  <span className="sb-small">
                    <span className="sb-num">{count}</span> مرشد موثق
                  </span>
                  <span className="i18" style={{ color: 'var(--primary)' }}>
                    <Icon name="arrow" />
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {tab === 'mentors' ? (
            mentors.length ? (
              <div className="mgrid-site">
                {mentors.map((m) => (
                  <MentorCard key={m.id} mentor={m} />
                ))}
              </div>
            ) : (
              <div className="sb-card">
                <EmptyState
                  roomy
                  title="لسه مفيش مرشدين هنا"
                  description="بنضيف مرشدين جداد كل أسبوع."
                  actions={
                    <button
                      type="button"
                      className="sb-btn sb-btn--primary sb-btn--sm"
                      onClick={() =>
                        toast({
                          kind: 'success',
                          title: 'تمام، هنبلغك',
                          description: `أول ما مرشد من ${f.name} ينضم.`,
                        })
                      }
                    >
                      بلّغني لما حد ينضم
                    </button>
                  }
                />
              </div>
            )
          ) : null}

          {tab === 'reviews' ? (
            <div className="tgrid-site">
              {REVIEWS.slice(0, 4).map((r) => (
                <ReviewCard key={r.name} review={r} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
