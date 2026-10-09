'use client';

import { EmptyState, Icon } from '@sabeq/ui';
import Link from 'next/link';
import { useState } from 'react';
import { Select } from '@/components/form';
import type { FacultyOffering } from '@/lib/catalog';

/**
 * Departments differ from one university to the next, so they are shown per faculty, with the page
 * the list came from (Phase 11). Cards are the handoff's department cards.
 */
export function Departments({
  offerings,
  facultyId,
}: {
  offerings: readonly FacultyOffering[];
  facultyId: string;
}) {
  const withDepts = offerings.filter((o) => o.departments.length);
  const [selected, setSelected] = useState(withDepts[0]?.id ?? '');
  const current = withDepts.find((o) => o.id === selected) ?? withDepts[0];

  if (!current)
    return (
      <div className="sb-card">
        <EmptyState
          roomy
          title="الأقسام لسه بنجمعها"
          description="بننشر أقسام كل كلية لما نلاقي لها مصدر نقدر نرجع له."
        />
      </div>
    );

  return (
    <div className="offerings">
      <div className="off-filters">
        <div className="dept-pick">
          <label className="sb-small" htmlFor="dept-uni">
            الجامعة
          </label>
          <Select
            id="dept-uni"
            value={current.id}
            error={undefined}
            placeholder="اختار الجامعة"
            options={withDepts.map((o) => [
              o.id,
              withDepts.filter((x) => x.university.slug === o.university.slug).length > 1
                ? `${o.university.name} — ${o.name}`
                : o.university.name,
            ])}
            onChange={(v) => v && setSelected(v)}
          />
        </div>
        <span className="sb-caption">
          أقسام <span className="sb-num">{withDepts.length}</span> من{' '}
          <span className="sb-num">{offerings.length}</span> كلية منشورة لحد دلوقتي
        </span>
      </div>

      <div className="dept-grid">
        {current.departments.map(({ name, mentorCount }) => (
          <Link
            key={name}
            className="sb-card sb-card--interactive dept"
            href={`/mentors/${facultyId}`}
          >
            <b>{name}</b>
            <span className="sb-small">
              <span className="sb-num">{mentorCount}</span> مرشد موثق
            </span>
            <span className="i18" style={{ color: 'var(--primary)' }}>
              <Icon name="arrow" />
            </span>
          </Link>
        ))}
      </div>

      {current.departmentsSource ? (
        <p className="sb-caption off-sources">
          المصدر:{' '}
          <a href={current.departmentsSource} target="_blank" rel="noopener noreferrer">
            صفحة {current.name} ({current.university.name}) على ويكيبيديا
          </a>
          . الأقسام بتتغير، فراجع موقع الكلية قبل ما تقرر.
        </p>
      ) : null}
    </div>
  );
}
