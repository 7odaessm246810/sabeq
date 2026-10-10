'use client';

import { EmptyState, Icon, MentorCardSkeleton, Modal, Segmented } from '@sabeq/ui';
import { useEffect, useRef, useState } from 'react';
import { MentorCard } from '@/components/cards';
import { PageHead } from '@/components/PageHead';
import {
  mentorQuery,
  searchMentors,
  toMentorView,
  type MentorCardData,
  type MentorFilters,
  type MentorList,
} from '@/lib/mentors';

type Sort = NonNullable<MentorFilters['sort']>;
type Facets = NonNullable<MentorList['facets']>;

const PAGE_SIZE = 12;
const PRICE = { min: 100, max: 500 } as const;
/** Universities shown before «كل الجامعات». */
const UNIS_SHOWN = 6;

function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="ck"
      role="checkbox"
      tabIndex={0}
      aria-checked={checked}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="box">{checked ? <Icon name="check" /> : null}</span>
      {children}
    </div>
  );
}

function FilterPanel({
  f,
  set,
  reset,
  facets,
}: {
  f: MentorFilters;
  set: (patch: Partial<MentorFilters>) => void;
  reset: () => void;
  facets: Facets;
}) {
  // Slider shows the dragged value immediately and commits on release; follow external resets.
  const current = f.maxPrice ?? PRICE.max;
  const [priceDraft, setPriceDraft] = useState(current);
  const [committed, setCommitted] = useState(current);
  if (committed !== current) {
    setCommitted(current);
    setPriceDraft(current);
  }
  const [allUnis, setAllUnis] = useState(false);
  const picked = f.universities ?? [];
  const unis = allUnis
    ? facets.universities
    : facets.universities.filter((u, i) => i < UNIS_SHOWN || picked.includes(u.slug));
  const commitPrice = () => set({ maxPrice: priceDraft >= PRICE.max ? undefined : priceDraft });

  return (
    <>
      <div className="fg">
        <h4>الكلية</h4>
        <div className="fchips">
          <button
            type="button"
            className="sb-chip sb-chip--sm"
            aria-pressed={!f.field}
            onClick={() => set({ field: undefined })}
          >
            الكل
          </button>
          {facets.fields.map((x) => (
            <button
              key={x.slug}
              type="button"
              className="sb-chip sb-chip--sm"
              aria-pressed={f.field === x.slug}
              onClick={() => set({ field: x.slug })}
            >
              {x.name} <span className="count">{x.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="fg">
        <h4>الجامعة</h4>
        {unis.map((u) => (
          <Checkbox
            key={u.slug}
            checked={picked.includes(u.slug)}
            onToggle={() =>
              set({
                universities: picked.includes(u.slug)
                  ? picked.filter((x) => x !== u.slug)
                  : [...picked, u.slug],
              })
            }
          >
            {u.name} <span className="sb-caption sb-num">({u.count})</span>
          </Checkbox>
        ))}
        {facets.universities.length > UNIS_SHOWN ? (
          <button
            type="button"
            className="sb-btn sb-btn--link"
            style={{ fontSize: 14, alignSelf: 'flex-start' }}
            onClick={() => setAllUnis(!allUnis)}
          >
            {allUnis ? 'اعرض أقل' : `كل الجامعات (${facets.universities.length})`}
          </button>
        ) : null}
      </div>
      <div className="fg">
        <h4>التقييم</h4>
        <Segmented
          label="أقل تقييم"
          value={f.minRating ?? 0}
          onChange={(rating) => set({ minRating: rating || undefined })}
          options={[
            [0, 'الكل'],
            [4.7, '4.7+'],
            [4.9, '4.9+'],
          ]}
        />
      </div>
      <div className="fg">
        <h4>السعر للجلسة</h4>
        <input
          type="range"
          min={PRICE.min}
          max={PRICE.max}
          step={10}
          value={priceDraft}
          aria-label="أقصى سعر"
          style={{ width: '100%', accentColor: 'var(--primary)' }}
          onChange={(e) => setPriceDraft(Number(e.target.value))}
          onPointerUp={commitPrice}
          onKeyUp={commitPrice}
        />
        <div className="rv">
          <span>{PRICE.min} ج.م</span>
          <b>حتى {priceDraft} ج.م</b>
        </div>
      </div>
      <div className="fg">
        {/* «متاح الأسبوع ده» in the design; real open slots arrive with scheduling (Phase 14). */}
        <Checkbox
          checked={Boolean(f.available)}
          onToggle={() => set({ available: !f.available || undefined })}
        >
          بياخد حجوزات دلوقتي
        </Checkbox>
      </div>
      <button
        type="button"
        className="sb-btn sb-btn--link"
        style={{ fontSize: 14, alignSelf: 'flex-start' }}
        onClick={reset}
      >
        مسح كل الفلاتر
      </button>
    </>
  );
}

/**
 * Mentor discovery (Phase 13): every filter, the search box and the sort run on the API, which
 * also counts each option so the panel only offers choices with results. Filters live in the URL.
 */
export function MentorsClient({
  initial,
  initialFilters,
  fieldName,
}: {
  initial: MentorList;
  initialFilters: MentorFilters;
  /** Name of the field this page was opened for (/mentors/eng), for the heading. */
  fieldName?: string | undefined;
}) {
  const [f, setF] = useState<MentorFilters>(initialFilters);
  const [data, setData] = useState(initial);
  const [cards, setCards] = useState<MentorCardData[]>(initial.results);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const first = useRef(true);

  // Refetch page 1 on every change (typing waits 150 ms — Motion → Search); mirror it in the URL
  // without a navigation, so the page keeps its state.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const qs = mentorQuery(f);
      window.history.replaceState(null, '', qs ? `/mentors?${qs}` : '/mentors');
      setLoading(true);
      searchMentors(f, 1, PAGE_SIZE, ctrl.signal)
        .then((res) => {
          setData(res);
          setCards(res.results);
          setPage(1);
          setFailed(false);
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [f]);

  const set = (patch: Partial<MentorFilters>) => setF((prev) => ({ ...prev, ...patch }));
  const reset = () => setF({});

  async function loadMore() {
    setMore(true);
    try {
      const res = await searchMentors(f, page + 1, PAGE_SIZE);
      setCards((c) => [...c, ...res.results]);
      setPage(page + 1);
    } catch {
      setFailed(true);
    } finally {
      setMore(false);
    }
  }

  const facets: Facets = data.facets ?? { fields: [], universities: [], price: null };
  const field =
    facets.fields.find((x) => x.slug === f.field)?.name ?? (f.field ? fieldName : undefined);

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'المرشدين' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">{field ? `مرشدين درسوا ${field}` : 'كل المرشدين'}</h1>
            <p className="sb-lead">كل الملفات موثقة. الأسعار لجلسة كاملة.</p>
          </div>
          <div className="sb-search" style={{ width: 'min(420px,100%)' }}>
            <div className="sb-search-box" style={{ height: 48 }}>
              <span className="i20">
                <Icon name="search" />
              </span>
              <input
                value={f.q ?? ''}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="اسم مرشد، قسم، أو جامعة"
                aria-label="بحث في المرشدين"
                type="search"
              />
            </div>
          </div>
        </div>
      </PageHead>
      <section className="sb-container page-body">
        <div className="disc-lay">
          <aside className="filters" aria-label="الفلاتر">
            <FilterPanel f={f} set={set} reset={reset} facets={facets} />
          </aside>
          <div>
            <div className="disc-top">
              <button
                type="button"
                className="sb-btn sb-btn--secondary sb-btn--sm only-m"
                onClick={() => setSheet(true)}
              >
                <Icon name="filter" />
                الفلاتر
              </button>
              <span className="sb-caption" aria-live="polite">
                <span className="sb-num">{data.total}</span> مرشد
              </span>
              <div className="sb-select-wrap" style={{ width: 200, marginInlineStart: 'auto' }}>
                <select
                  className="sb-input sb-select"
                  style={{ height: 40, fontSize: 14 }}
                  aria-label="الترتيب"
                  value={f.sort ?? 'recommended'}
                  onChange={(e) => set({ sort: e.target.value as Sort })}
                >
                  <option value="recommended">الأنسب لك</option>
                  <option value="rating">الأعلى تقييمًا</option>
                  <option value="price_asc">الأقل سعرًا</option>
                  <option value="sessions">الأكثر جلسات</option>
                </select>
                <span>
                  <Icon name="chevron" />
                </span>
              </div>
            </div>
            {failed ? (
              <div className="sb-card" role="alert">
                <EmptyState
                  title="ما قدرناش نجيب المرشدين"
                  description="فلاترك محفوظة. جرّب تاني بعد شوية."
                  actions={
                    <button
                      type="button"
                      className="sb-btn sb-btn--primary sb-btn--sm"
                      onClick={() => setF({ ...f })}
                    >
                      جرّب تاني
                    </button>
                  }
                />
              </div>
            ) : loading ? (
              <div className="mgrid-site" aria-busy="true">
                <MentorCardSkeleton />
                <MentorCardSkeleton />
                <MentorCardSkeleton />
              </div>
            ) : cards.length ? (
              <>
                <div className="mgrid-site">
                  {cards.map((m, i) => (
                    <MentorCard
                      key={m.slug}
                      mentor={toMentorView(m)}
                      className="flip"
                      style={{ animationDelay: `${(i % PAGE_SIZE) * 50}ms` }}
                    />
                  ))}
                </div>
                {cards.length < data.total ? (
                  <div className="exp-more">
                    <button
                      type="button"
                      className="sb-btn sb-btn--secondary"
                      aria-busy={more}
                      disabled={more}
                      onClick={() => void loadMore()}
                    >
                      اعرض مرشدين أكتر ({data.total - cards.length})
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="sb-card">
                <EmptyState
                  roomy
                  title={
                    data.total === 0 && !mentorQuery(f)
                      ? 'لسه مفيش مرشدين'
                      : 'مفيش مرشدين بالفلاتر دي'
                  }
                  description={
                    mentorQuery(f)
                      ? 'الفلاتر مع بعض ضيّقت النتايج. جرّب تشيل فلتر الجامعة أو تزوّد السعر.'
                      : 'كل مرشد بيتراجع بمستنداته قبل ما يظهر هنا. أول المرشدين في الطريق.'
                  }
                  actions={
                    mentorQuery(f) ? (
                      <button
                        type="button"
                        className="sb-btn sb-btn--primary sb-btn--sm"
                        onClick={reset}
                      >
                        مسح كل الفلاتر
                      </button>
                    ) : undefined
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>
      {sheet ? (
        <Modal
          sheet
          title="الفلاتر"
          onClose={() => setSheet(false)}
          footer={
            <button
              type="button"
              className="sb-btn sb-btn--primary sb-btn--block sb-btn--lg"
              onClick={() => setSheet(false)}
            >
              اعرض {data.total} مرشد
            </button>
          }
        >
          <FilterPanel f={f} set={set} reset={reset} facets={facets} />
        </Modal>
      ) : null}
    </>
  );
}
