'use client';

import { EmptyState, Icon, MentorCardSkeleton, Modal, Segmented } from '@sabeq/ui';
import { useEffect, useRef, useState } from 'react';
import { MentorCard } from '@/components/cards';
import { PageHead } from '@/components/PageHead';
import { FACULTIES, MENTORS, UNIVERSITIES, getFaculty, type Mentor } from '@/lib/mock/data';

type Sort = 'fit' | 'rating' | 'price' | 'sessions';

interface Filters {
  fac: string;
  unis: Record<string, boolean>;
  rating: number;
  price: number;
  avail: boolean;
}

const DEFAULT: Filters = { fac: 'all', unis: {}, rating: 0, price: 500, avail: false };

const SORTERS: Record<Sort, (a: Mentor, b: Mentor) => number> = {
  fit: (a, b) => Number(b.available) - Number(a.available) || Number(b.rating) - Number(a.rating),
  rating: (a, b) => Number(b.rating) - Number(a.rating),
  price: (a, b) => a.price - b.price,
  sessions: (a, b) => b.sessions - a.sessions,
};

function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: string;
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
}: {
  f: Filters;
  set: (patch: Partial<Filters>) => void;
  reset: () => void;
}) {
  // Slider shows the dragged value immediately and commits on release; follow external resets.
  const [priceDraft, setPriceDraft] = useState(f.price);
  const [committed, setCommitted] = useState(f.price);
  if (committed !== f.price) {
    setCommitted(f.price);
    setPriceDraft(f.price);
  }

  return (
    <>
      <div className="fg">
        <h4>الكلية</h4>
        <div className="fchips">
          {[['all', 'الكل'] as const, ...FACULTIES.map((x) => [x.id, x.name] as const)].map(
            ([id, name]) => (
              <button
                key={id}
                type="button"
                className="sb-chip sb-chip--sm"
                aria-pressed={f.fac === id}
                onClick={() => set({ fac: id })}
              >
                {name}
                {id !== 'all' ? (
                  <>
                    {' '}
                    <span className="count">{MENTORS.filter((m) => m.facId === id).length}</span>
                  </>
                ) : null}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="fg">
        <h4>الجامعة</h4>
        {UNIVERSITIES.map((u) => (
          <Checkbox
            key={u}
            checked={Boolean(f.unis[u])}
            onToggle={() => set({ unis: { ...f.unis, [u]: !f.unis[u] } })}
          >
            {u}
          </Checkbox>
        ))}
      </div>
      <div className="fg">
        <h4>التقييم</h4>
        <Segmented
          label="أقل تقييم"
          value={f.rating}
          onChange={(rating) => set({ rating })}
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
          min={150}
          max={500}
          step={10}
          value={priceDraft}
          aria-label="أقصى سعر"
          style={{ width: '100%', accentColor: 'var(--primary)' }}
          onChange={(e) => setPriceDraft(Number(e.target.value))}
          onPointerUp={() => set({ price: priceDraft })}
          onKeyUp={() => set({ price: priceDraft })}
        />
        <div className="rv">
          <span>150 ج.م</span>
          <b>حتى {priceDraft} ج.م</b>
        </div>
      </div>
      <div className="fg">
        <Checkbox checked={f.avail} onToggle={() => set({ avail: !f.avail })}>
          متاح الأسبوع ده
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

export function MentorsClient({ facultyId }: { facultyId?: string }) {
  const [f, setF] = useState<Filters>({ ...DEFAULT, fac: facultyId ?? 'all' });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('fit');
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Any filter change shows a short skeleton before the result (Motion → Filters); sorting is instant.
  function refresh() {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLoading(false), 320);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const set = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    refresh();
  };
  const reset = () => {
    setF(DEFAULT);
    setQ('');
    refresh();
  };

  const selectedUnis = Object.keys(f.unis).filter((k) => f.unis[k]);
  const s = q.trim();
  const list = MENTORS.filter(
    (m) =>
      (f.fac === 'all' || m.facId === f.fac) &&
      (!selectedUnis.length || selectedUnis.includes(m.uni)) &&
      Number(m.rating) >= f.rating &&
      m.price <= f.price &&
      (!f.avail || m.available) &&
      (!s || (m.name + m.major + m.uni + m.faculty).includes(s)),
  ).sort(SORTERS[sort]);

  const fac = getFaculty(f.fac);

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'المرشدين' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">{fac ? `مرشدين درسوا ${fac.name}` : 'كل المرشدين'}</h1>
            <p className="sb-lead">كل الملفات موثقة. الأسعار لجلسة كاملة.</p>
          </div>
          <div className="sb-search" style={{ width: 'min(420px,100%)' }}>
            <div className="sb-search-box" style={{ height: 48 }}>
              <span className="i20">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  refresh();
                }}
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
            <FilterPanel f={f} set={set} reset={reset} />
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
                {list.length} مرشد
              </span>
              <div className="sb-select-wrap" style={{ width: 200, marginInlineStart: 'auto' }}>
                <select
                  className="sb-input sb-select"
                  style={{ height: 40, fontSize: 14 }}
                  aria-label="الترتيب"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                >
                  <option value="fit">الأنسب لك</option>
                  <option value="rating">الأعلى تقييمًا</option>
                  <option value="price">الأقل سعرًا</option>
                  <option value="sessions">الأكثر جلسات</option>
                </select>
                <span>
                  <Icon name="chevron" />
                </span>
              </div>
            </div>
            {loading ? (
              <div className="mgrid-site" aria-busy="true">
                <MentorCardSkeleton />
                <MentorCardSkeleton />
                <MentorCardSkeleton />
              </div>
            ) : list.length ? (
              <div className="mgrid-site">
                {list.map((m, i) => (
                  <MentorCard
                    key={`${sort}-${m.id}`}
                    mentor={m}
                    className="flip"
                    style={{ animationDelay: `${i * 40}ms` }}
                  />
                ))}
              </div>
            ) : (
              <div className="sb-card">
                <EmptyState
                  roomy
                  title="مفيش مرشدين بالفلاتر دي"
                  description="الفلاتر مع بعض ضيّقت النتايج. جرّب تشيل فلتر الجامعة أو تزوّد السعر."
                  actions={
                    <button
                      type="button"
                      className="sb-btn sb-btn--primary sb-btn--sm"
                      onClick={reset}
                    >
                      مسح كل الفلاتر
                    </button>
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
              اعرض {list.length} مرشد
            </button>
          }
        >
          <FilterPanel f={f} set={set} reset={reset} />
        </Modal>
      ) : null}
    </>
  );
}
