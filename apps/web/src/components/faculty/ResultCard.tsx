import { UNIVERSITY_TYPE_LABELS } from '@sabeq/types';
import { Icon, OrgLogo, type IconName } from '@sabeq/ui';
import Link from 'next/link';
import type { FacultyHit } from '@/lib/catalog';

const TRACK: Record<string, string> = {
  science_bio: 'علمي علوم',
  science_math: 'علمي رياضة',
  literary: 'أدبي',
};

/**
 * One faculty at one university in the search results (Phase 11c — not in the handoff; built from
 * the design system's card, badges and the faculty card's arrow).
 */
export function ResultCard({ hit: f }: { hit: FacultyHit }) {
  const place = [f.city, f.governorate].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <Link href={`/college/${f.id}`} className="sb-card sb-card--interactive res-card">
      <span className="res-top">
        <OrgLogo src={f.logo} name={f.university.name} icon={f.kind.icon as IconName} size={52} />
        <span className="res-names">
          <b>{f.name}</b>
          <span className="sb-small">{f.university.name}</span>
        </span>
      </span>
      <span className="res-badges">
        <span className="sb-badge sb-badge--neutral">
          {UNIVERSITY_TYPE_LABELS[f.university.type]}
        </span>
        {f.accreditation.status === 'accredited' ? (
          <span className="sb-badge sb-badge--success">معتمدة من الجودة</span>
        ) : f.accreditation.status === 'conditional' ? (
          <span className="sb-badge sb-badge--warning">اعتماد مشروط</span>
        ) : null}
      </span>
      <span className="res-meta">
        <span className="sb-small">
          {place.length ? (
            <>
              <span className="i16" aria-hidden="true">
                <Icon name="pin" />
              </span>
              {place.join('، ')}
            </>
          ) : (
            f.kind.name
          )}
        </span>
        {f.cutoff ? (
          <span className="sb-small">
            تنسيق {f.cutoff.year}: <b className="sb-num">{f.cutoff.minScore}</b>
            <span className="sb-caption"> ({TRACK[f.cutoff.track] ?? ''})</span>
          </span>
        ) : null}
        <span className="res-arrow" aria-hidden="true">
          <Icon name="arrow" />
        </span>
      </span>
    </Link>
  );
}
