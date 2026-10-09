'use client';

import { EmptyState, Icon, Segmented } from '@sabeq/ui';
import { useState } from 'react';
import { FacultyCard } from '@/components/cards';
import { PageHead } from '@/components/PageHead';
import type { ExploreFaculty, UniversityOption } from '@/lib/catalog';
import type { FacultyCategory } from '@/lib/mock/data';

const CATS = ['الكل', 'طبي', 'هندسي', 'علمي', 'أدبي', 'فني'] as const;
type Cat = (typeof CATS)[number];

const ALL_UNIS = '';

/** Faculties from the catalog API (Phase 11); filters run in the browser — the list is small. */
export function ExploreClient({
  faculties,
  universities,
}: {
  faculties: readonly ExploreFaculty[];
  universities: readonly UniversityOption[];
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('الكل');
  const [uni, setUni] = useState(ALL_UNIS);
  const uniChips = [
    [ALL_UNIS, 'كل الجامعات'] as const,
    ...universities.map((u) => [u.slug, u.name.replace('جامعة ', '')] as const),
  ];

  const s = q.trim();
  const list = faculties.filter(
    (f) =>
      (cat === 'الكل' || f.cat === (cat as FacultyCategory)) &&
      (uni === ALL_UNIS || f.universities.includes(uni)) &&
      (!s || (f.full + f.desc + f.depts.map(([d]) => d).join(' ')).includes(s)),
  );

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'استكشف الكليات' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">استكشف الكليات</h1>
            <p className="sb-lead">اختار الكلية اللي بتفكر فيها، وشوف مين درس فيها فعلًا.</p>
          </div>
          <div className="sb-search" style={{ width: 'min(460px,100%)' }}>
            <div className="sb-search-box">
              <span className="i20">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث عن كلية أو قسم"
                aria-label="ابحث عن كلية أو قسم"
                type="search"
              />
            </div>
          </div>
        </div>
        <div className="ph-filters">
          <Segmented
            label="نوع الكلية"
            value={cat}
            onChange={setCat}
            options={CATS.map((c) => [c, c] as const)}
          />
          <div className="hscroll-row" role="group" aria-label="الجامعة">
            <span className="sb-small">الجامعة:</span>
            {uniChips.map(([slug, label]) => (
              <button
                key={slug || 'all'}
                type="button"
                className="sb-chip sb-chip--sm"
                aria-pressed={slug === uni}
                onClick={() => setUni(slug)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </PageHead>
      <section className="sb-container page-body">
        <div className="fgrid-site" aria-live="polite">
          {list.length ? (
            list.map((f) => (
              <FacultyCard key={`${cat}-${s}-${uni}-${f.id}`} faculty={f} className="flip" />
            ))
          ) : (
            <div className="sb-card" style={{ gridColumn: '1/-1' }}>
              <EmptyState
                roomy
                title="مفيش كلية بالاسم ده"
                description="جرّب تكتب اسم القسم بدل الكلية، أو اختار «الكل» من فوق."
                actions={
                  <button
                    type="button"
                    className="sb-btn sb-btn--primary sb-btn--sm"
                    onClick={() => {
                      setQ('');
                      setCat('الكل');
                      setUni(ALL_UNIS);
                    }}
                  >
                    مسح البحث
                  </button>
                }
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
