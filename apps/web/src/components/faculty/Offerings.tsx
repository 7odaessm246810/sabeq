'use client';

import { EmptyState, Segmented, cx } from '@sabeq/ui';
import { useState } from 'react';
import type { CatalogSources, FacultyOffering, UniversityType } from '@/lib/catalog';

const TYPE_LABEL: Record<UniversityType, string> = {
  public: 'حكومية',
  azhar: 'الأزهر',
  private: 'خاصة',
  national: 'أهلية',
  technological: 'تكنولوجية',
  international: 'دولية',
};

const TRACK_LABEL: Record<string, string> = {
  science_bio: 'علمي علوم',
  science_math: 'علمي رياضة',
  literary: 'أدبي',
};

type Filter = 'all' | 'public' | 'azhar' | 'private';

const year = (iso: string) => iso.slice(0, 4);
const arDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function Accreditation({ a }: { a: FacultyOffering['accreditation'] }) {
  if (a.status === 'accredited')
    return (
      <span className="sb-badge sb-badge--success">
        معتمدة من هيئة الجودة{a.expiresAt ? ` حتى ${year(a.expiresAt)}` : ''}
      </span>
    );
  if (a.status === 'conditional')
    return (
      <span className="sb-badge sb-badge--warning">
        اعتماد مشروط{a.expiresAt ? ` حتى ${year(a.expiresAt)}` : ''}
      </span>
    );
  if (a.status === 'not_accredited')
    return <span className="sb-badge sb-badge--neutral">مش معتمدة حاليًا</span>;
  return null;
}

/**
 * Every university that has this faculty, with NAQAAE accreditation and tansik cutoffs (Phase 11).
 * Not in the design handoff — built from the design system's cards and badges.
 */
export function Offerings({
  offerings,
  sources,
}: {
  offerings: readonly FacultyOffering[];
  sources: CatalogSources;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [accreditedOnly, setAccreditedOnly] = useState(false);

  const counts = {
    public: offerings.filter((o) => o.university.type === 'public').length,
    azhar: offerings.filter((o) => o.university.type === 'azhar').length,
    private: offerings.filter((o) => !['public', 'azhar'].includes(o.university.type)).length,
  };
  const list = offerings
    .filter((o) =>
      filter === 'all'
        ? true
        : filter === 'private'
          ? !['public', 'azhar'].includes(o.university.type)
          : o.university.type === filter,
    )
    .filter(
      (o) => !accreditedOnly || ['accredited', 'conditional'].includes(o.accreditation.status),
    )
    // Highest 2026 cutoff first, then the rest by university.
    .sort((a, b) => (b.cutoffs[0]?.minScore ?? 0) - (a.cutoffs[0]?.minScore ?? 0));

  return (
    <div className="offerings">
      <div className="off-filters">
        <Segmented
          label="نوع الجامعة"
          value={filter}
          onChange={setFilter}
          options={[
            ['all', `الكل (${offerings.length})`],
            ...(counts.public ? ([['public', `حكومية (${counts.public})`]] as const) : []),
            ...(counts.azhar ? ([['azhar', `الأزهر (${counts.azhar})`]] as const) : []),
            ...(counts.private ? ([['private', `خاصة وأهلية (${counts.private})`]] as const) : []),
          ]}
        />
        <label className="off-check">
          <input
            type="checkbox"
            checked={accreditedOnly}
            onChange={(e) => setAccreditedOnly(e.target.checked)}
          />
          المعتمدة من هيئة الجودة بس
        </label>
      </div>

      {list.length ? (
        <ul className="off-list">
          {list.map((o) => {
            const cutoff = o.cutoffs[0];
            return (
              <li key={o.id} className="sb-card off-item">
                <div className="off-main">
                  <b>{o.university.name}</b>
                  <span className="sb-small">
                    {o.name}
                    {o.city
                      ? ` · ${o.city}`
                      : o.university.governorate
                        ? ` · ${o.university.governorate}`
                        : ''}
                  </span>
                  <span className="off-badges">
                    <span className="sb-badge sb-badge--neutral">
                      {TYPE_LABEL[o.university.type]}
                    </span>
                    <Accreditation a={o.accreditation} />
                  </span>
                  {o.accreditation.programmes.length ? (
                    <details className="off-progs">
                      <summary className="sb-caption">
                        {o.accreditation.programmes.length} برنامج معتمد
                      </summary>
                      <ul>
                        {o.accreditation.programmes.map((p) => (
                          <li key={p.name} className="sb-caption">
                            {p.name}
                            {p.status === 'conditional' ? ' (مشروط)' : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
                <div className={cx('off-cutoff', !cutoff && 'none')}>
                  {cutoff ? (
                    <>
                      <span className="sb-caption">تنسيق {cutoff.year}</span>
                      <b className="sb-num">{cutoff.minScore}</b>
                      <span className="sb-caption">
                        من {cutoff.maxScore} · {TRACK_LABEL[cutoff.track] ?? ''}
                      </span>
                    </>
                  ) : (
                    <span className="sb-caption">الحد الأدنى مش منشور عندنا</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="sb-card">
          <EmptyState title="مفيش نتايج" description="غيّر الفلتر عشان تشوف جامعات أكتر." />
        </div>
      )}

      <p className="sb-caption off-sources">
        الاعتماد حسب جدول {sources.accreditation.name} (آخر قرار فيه{' '}
        {arDate.format(new Date(sources.accreditation.latestDecision))}). الحد الأدنى من{' '}
        {sources.cutoffs.name} ({arDate.format(new Date(sources.cutoffs.date))})، وبيتغير كل سنة.
      </p>
    </div>
  );
}
