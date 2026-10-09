'use client';

import { FACULTY_CATEGORY_LABELS, UNIVERSITY_TYPE_LABELS } from '@sabeq/types';
import { EmptyState, Icon, Segmented } from '@sabeq/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FacultyCard } from '@/components/cards';
import { ResultCard } from '@/components/faculty/ResultCard';
import { Select } from '@/components/form';
import { PageHead } from '@/components/PageHead';
import {
  searchFaculties,
  searchQuery,
  type ApiCategory,
  type ExploreFaculty,
  type FacultyHit,
  type SearchParams,
  type SearchResponse,
} from '@/lib/catalog';

type Filters = Omit<SearchParams, 'page'>;

const CATEGORY_OF: Record<string, ApiCategory> = {
  طبي: 'medical',
  هندسي: 'engineering',
  علمي: 'science',
  أدبي: 'literary',
  فني: 'arts',
};

const isEmpty = (f: Filters) =>
  !f.q?.trim() && !f.governorate && !f.university && !f.category && !f.type;

/**
 * Faculty search (Phase 11c). Students can type straight away («هندسة القاهرة») or narrow step by
 * step — governorate, university, field — in any order; each list only offers what still has
 * results. With nothing chosen, the page shows the fields to browse (the handoff's faculty grid).
 * Filters live in the URL, so a search can be shared or reopened.
 */
export function ExploreClient({
  kinds,
  initial,
  initialFilters,
}: {
  kinds: readonly ExploreFaculty[];
  initial: SearchResponse;
  initialFilters: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [data, setData] = useState(initial);
  const [hits, setHits] = useState<FacultyHit[]>(initial.results);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);

  // Refetch page 1 whenever the filters change (typing waits a moment), and mirror them in the URL.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => {
        const qs = searchQuery(filters);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        setLoading(true);
        searchFaculties(filters, ctrl.signal)
          .then((res) => {
            setData(res);
            setHits(res.results);
            setPage(1);
            setFailed(false);
          })
          .catch((err: unknown) => {
            if ((err as Error).name !== 'AbortError') setFailed(true);
          })
          .finally(() => setLoading(false));
      },
      filters.q !== undefined ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [filters, pathname, router]);

  function set<K extends keyof Filters>(key: K, value: Filters[K] | '') {
    setFilters((f) => {
      const next: Filters = { ...f, [key]: value === '' ? undefined : value };
      // A university outside the chosen governorate would leave nothing to show.
      if (key === 'governorate') next.university = undefined;
      return next;
    });
  }

  async function more() {
    setLoading(true);
    try {
      const res = await searchFaculties({ ...filters, page: page + 1 });
      setHits((h) => [...h, ...res.results]);
      setPage(page + 1);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const browsing = isEmpty(filters);
  const { facets } = data;
  const uniName = facets.universities.find((u) => u.slug === filters.university)?.name;
  const active: [keyof Filters, string][] = [];
  if (filters.governorate) active.push(['governorate', filters.governorate]);
  if (filters.university) active.push(['university', uniName ?? filters.university]);
  if (filters.type) active.push(['type', UNIVERSITY_TYPE_LABELS[filters.type]]);
  if (filters.category) active.push(['category', FACULTY_CATEGORY_LABELS[filters.category]]);
  const catLabel = filters.category ? FACULTY_CATEGORY_LABELS[filters.category] : 'الكل';
  const catCount = new Map(facets.categories.map((c) => [c.category, c.count]));

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'استكشف الكليات' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">استكشف الكليات</h1>
            <p className="sb-lead">
              دوّر على الكلية باسمها، أو اختار المحافظة والجامعة والمجال — بالترتيب اللي يريحك.
            </p>
          </div>
        </div>

        <div className="sb-search exp-search">
          <div className="sb-search-box">
            <span className="i20">
              <Icon name="search" />
            </span>
            <input
              value={filters.q ?? ''}
              onChange={(e) => set('q', e.target.value)}
              placeholder="مثلًا: هندسة القاهرة، طب أسيوط، ألسن عين شمس"
              aria-label="ابحث باسم الكلية أو الجامعة"
              type="search"
              enterKeyHint="search"
            />
          </div>
        </div>

        <div className="exp-steps" role="group" aria-label="اختار خطوة بخطوة">
          <div className="exp-step">
            <label className="sb-small" htmlFor="exp-gov">
              <span className="exp-n">1</span> المحافظة
            </label>
            <Select
              id="exp-gov"
              value={filters.governorate ?? ''}
              error={undefined}
              placeholder="كل المحافظات"
              options={facets.governorates.map((g) => [g.name, `${g.name} (${g.count})`] as const)}
              onChange={(v) => set('governorate', v)}
            />
          </div>
          <div className="exp-step">
            <label className="sb-small" htmlFor="exp-uni">
              <span className="exp-n">2</span> الجامعة
            </label>
            <Select
              id="exp-uni"
              value={filters.university ?? ''}
              error={undefined}
              placeholder={`كل الجامعات (${facets.universities.length})`}
              options={facets.universities.map((u) => [u.slug, `${u.name} (${u.count})`] as const)}
              onChange={(v) => set('university', v)}
            />
          </div>
          <div className="exp-step">
            <label className="sb-small" htmlFor="exp-type">
              نوع الجامعة
            </label>
            <Select
              id="exp-type"
              value={filters.type ?? ''}
              error={undefined}
              placeholder="كل الأنواع"
              options={facets.types.map(
                (t) => [t.type, `${UNIVERSITY_TYPE_LABELS[t.type]} (${t.count})`] as const,
              )}
              onChange={(v) => set('type', v as Filters['type'])}
            />
          </div>
        </div>

        <div className="ph-filters">
          <span className="sb-small exp-step-label">
            <span className="exp-n">3</span> المجال
          </span>
          <Segmented
            label="المجال"
            value={catLabel}
            onChange={(v) => set('category', v === 'الكل' ? '' : CATEGORY_OF[v])}
            options={[
              ['الكل', 'الكل'] as const,
              ...Object.entries(CATEGORY_OF)
                .filter(([, c]) => catCount.has(c) || filters.category === c)
                .map(([label, c]) => [label, `${label} (${catCount.get(c) ?? 0})`] as const),
            ]}
          />
        </div>

        {active.length ? (
          <div className="exp-active" aria-label="الاختيارات الحالية">
            {active.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="sb-chip sb-chip--sm"
                aria-label={`شيل ${label}`}
                onClick={() => set(key, '')}
              >
                {label}
                <span className="i16" aria-hidden="true">
                  <Icon name="x" />
                </span>
              </button>
            ))}
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm"
              onClick={() => setFilters({})}
            >
              امسح الكل
            </button>
          </div>
        ) : null}
      </PageHead>

      <section className="sb-container page-body" aria-busy={loading}>
        {failed ? (
          <div className="sb-card" role="alert">
            <EmptyState title="البحث مش شغال دلوقتي" description="جرّب تاني بعد شوية." />
          </div>
        ) : browsing ? (
          <>
            <div className="exp-head">
              <h2 className="sb-h3">تصفّح حسب المجال</h2>
              <span className="sb-small">
                <span className="sb-num">{data.total}</span> كلية في{' '}
                <span className="sb-num">{facets.universities.length}</span> جامعة
              </span>
            </div>
            <div className="fgrid-site">
              {kinds.map((f) => (
                <FacultyCard key={f.id} faculty={f} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="exp-head" aria-live="polite">
              <h2 className="sb-h3">
                {data.total ? (
                  <>
                    لقينا <span className="sb-num">{data.total}</span> كلية
                  </>
                ) : (
                  'مفيش نتايج'
                )}
              </h2>
            </div>
            {hits.length ? (
              <>
                <div className="res-grid">
                  {hits.map((h) => (
                    <ResultCard key={h.id} hit={h} />
                  ))}
                </div>
                {hits.length < data.total ? (
                  <div className="exp-more">
                    <button
                      type="button"
                      className="sb-btn sb-btn--secondary"
                      aria-busy={loading}
                      disabled={loading}
                      onClick={() => void more()}
                    >
                      اعرض كليات أكتر ({data.total - hits.length})
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="sb-card">
                <EmptyState
                  roomy
                  title="مفيش كلية بالشكل ده"
                  description="جرّب كلمة واحدة بس (زي «هندسة») أو شيل اختيار من فوق."
                  actions={
                    <button
                      type="button"
                      className="sb-btn sb-btn--primary sb-btn--sm"
                      onClick={() => setFilters({})}
                    >
                      امسح البحث
                    </button>
                  }
                />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
