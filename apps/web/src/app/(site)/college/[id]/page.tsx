import { UNIVERSITY_TYPE_LABELS } from '@sabeq/types';
import { Icon, OrgLogo, type IconName } from '@sabeq/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { MentorCard } from '@/components/cards';
import { PageHead } from '@/components/PageHead';
import { getCollegePage } from '@/lib/catalog';
import { listMentors, toMentorView } from '@/lib/mentors';

const TRACK: Record<string, string> = {
  science_bio: 'علمي علوم',
  science_math: 'علمي رياضة',
  literary: 'أدبي',
};
const arDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const fmt = (iso: string) => arDate.format(new Date(iso));

export async function generateMetadata({ params }: PageProps<'/college/[id]'>): Promise<Metadata> {
  await connection();
  const c = await getCollegePage((await params).id);
  if (!c) return {};
  const title = `${c.name} — ${c.university.name}`;
  return {
    title,
    description: `${title}: الاعتماد، الحد الأدنى للتنسيق، الأقسام، وطلاب وخريجين موثقين درسوا فيها.`,
    alternates: { canonical: `/college/${c.id}` },
  };
}

/**
 * One faculty at one university (Phase 11c — not in the handoff; built from the faculty page's
 * header, stats and cards). Public and SEO-critical: rendered on request from the catalog API.
 */
export default async function CollegePage({ params }: PageProps<'/college/[id]'>) {
  await connection();
  const id = (await params).id;
  const [c, mentors] = await Promise.all([
    getCollegePage(id),
    listMentors({ faculty: id, pageSize: 4 }).catch(() => ({ total: 0, results: [] })),
  ]);
  if (!c) notFound();

  const place = [c.city, c.governorate].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const latest = c.cutoffs[0];
  const a = c.accreditation;

  return (
    <>
      <PageHead
        className="fac-head"
        crumbs={[
          { label: 'الرئيسية', href: '/' },
          { label: 'استكشف الكليات', href: '/explore' },
          { label: c.university.name, href: `/explore?university=${c.university.slug}` },
          { label: c.name },
        ]}
      >
        <div className="ph-row">
          <div className="fac-title">
            <OrgLogo
              src={c.logo}
              name={c.university.name}
              icon={c.kind.icon as IconName}
              size={72}
            />
            <div>
              <h1 className="sb-h1">{c.name}</h1>
              <p className="sb-lead">
                {c.university.name}
                {place.length ? ` · ${place.join('، ')}` : ''}
              </p>
              <div className="res-badges">
                <span className="sb-badge sb-badge--neutral">
                  {UNIVERSITY_TYPE_LABELS[c.university.type]}
                </span>
                <span className="sb-badge sb-badge--neutral">{c.kind.name}</span>
                {a.status === 'accredited' ? (
                  <span className="sb-badge sb-badge--success">
                    معتمدة من هيئة الجودة{a.expiresAt ? ` حتى ${a.expiresAt.slice(0, 4)}` : ''}
                  </span>
                ) : a.status === 'conditional' ? (
                  <span className="sb-badge sb-badge--warning">اعتماد مشروط</span>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="sb-btn sb-btn--primary sb-btn--lg" href={`/mentors/${c.kind.slug}`}>
              كلّم حد درس هنا{' '}
              <span className="sb-arrow i18">
                <Icon name="arrow" />
              </span>
            </Link>
          </div>
        </div>
        <div className="fac-stats">
          <div>
            <b className="sb-num">{c.kind.studyYears}</b>
            <span>سنين دراسة</span>
          </div>
          <div>
            <b className="sb-num">{latest ? latest.minScore : '—'}</b>
            <span>
              {latest
                ? `الحد الأدنى ${latest.year} (${TRACK[latest.track] ?? ''})`
                : 'الحد الأدنى مش منشور'}
            </span>
          </div>
          <div>
            <b className="sb-num">{c.departments.length || '—'}</b>
            <span>قسم</span>
          </div>
          <div>
            <b className="sb-num">{c.mentorCount}</b>
            <span>مرشد موثق</span>
          </div>
        </div>
      </PageHead>

      <section className="sb-container page-body col-body">
        <div className="col-main">
          <article className="sb-card col-sec">
            <h2 className="sb-h3">عن الكلية</h2>
            {c.about ? <p className="col-text">{c.about}</p> : null}
            <p className="col-text">{c.kind.about}</p>
            <Link className="sb-btn sb-btn--ghost sb-btn--sm" href={`/faculty/${c.kind.slug}`}>
              كل كليات {c.kind.name} في مصر
              <span className="i16">
                <Icon name="arrow" />
              </span>
            </Link>
          </article>

          <article className="sb-card col-sec">
            <h2 className="sb-h3">مرشدين درسوا هنا</h2>
            {mentors.results.length ? (
              <>
                <div className="col-mentors">
                  {mentors.results.map((m) => (
                    <MentorCard key={m.slug} mentor={toMentorView(m)} compact />
                  ))}
                </div>
                {mentors.total > mentors.results.length ? (
                  <Link
                    className="sb-btn sb-btn--ghost sb-btn--sm"
                    href={`/mentors/${c.kind.slug}`}
                  >
                    كل مرشدين {c.kind.name} ({mentors.total})
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="sb-small">
                لسه مفيش مرشد موثق من {c.name} في {c.university.name}.{' '}
                <Link href={`/mentors/${c.kind.slug}`}>
                  شوف مرشدين {c.kind.name} من جامعات تانية
                </Link>
                ، أو <Link href="/become-mentor">انضم كمرشد</Link> لو درست هنا.
              </p>
            )}
          </article>

          <article className="sb-card col-sec">
            <h2 className="sb-h3">الأقسام</h2>
            {c.departments.length ? (
              <>
                <ul className="col-chips">
                  {c.departments.map((d) => (
                    <li key={d.name} className="sb-chip sb-chip--sm">
                      {d.name}
                    </li>
                  ))}
                </ul>
                {c.departmentsSource ? (
                  <p className="sb-caption">
                    المصدر:{' '}
                    <a href={c.departmentsSource} target="_blank" rel="noopener noreferrer">
                      صفحة الكلية على ويكيبيديا
                    </a>
                    . الأقسام بتتغير، فراجع موقع الكلية قبل ما تقرر.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="sb-small">
                لسه بنجمع أقسام الكلية دي من مصدر نقدر نرجع له.
                {c.website ? ' لحد ما نخلص، شوفها على موقع الكلية.' : ''}
              </p>
            )}
          </article>
        </div>

        <aside className="col-side">
          <section className="sb-card col-sec" aria-labelledby="h-tansik">
            <h2 className="sb-h3" id="h-tansik">
              التنسيق
            </h2>
            {c.cutoffs.length ? (
              <ul className="col-list">
                {c.cutoffs.map((x) => (
                  <li key={`${x.year}-${x.phase}-${x.track}`}>
                    <span>
                      {x.year} · المرحلة {x.phase} · {TRACK[x.track] ?? ''}
                    </span>
                    <b className="sb-num">
                      {x.minScore} <span className="sb-caption">من {x.maxScore}</span>
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sb-small">الحد الأدنى للكلية دي مش منشور عندنا.</p>
            )}
            <p className="sb-caption">
              من {c.sources.cutoffs.name} ({fmt(c.sources.cutoffs.date)})، وبيتغير كل سنة.
            </p>
          </section>

          <section className="sb-card col-sec" aria-labelledby="h-acc">
            <h2 className="sb-h3" id="h-acc">
              الاعتماد
            </h2>
            <p className="sb-small">
              {a.status === 'accredited'
                ? `معتمدة من هيئة الجودة${a.accreditedAt ? ` من ${fmt(a.accreditedAt)}` : ''}${a.expiresAt ? ` لحد ${fmt(a.expiresAt)}` : ''}.`
                : a.status === 'conditional'
                  ? `اعتماد مشروط${a.expiresAt ? ` لحد ${fmt(a.expiresAt)}` : ''}.`
                  : a.status === 'not_accredited'
                    ? 'مش معتمدة حاليًا (الاعتماد السابق خلص أو اترفض).'
                    : 'مفيش قرار اعتماد للكلية دي في جدول الهيئة.'}
            </p>
            {a.programmes.length ? (
              <>
                <b className="sb-small">برامج معتمدة:</b>
                <ul className="col-list">
                  {a.programmes.map((p) => (
                    <li key={p.name}>
                      <span>{p.name}</span>
                      <span className="sb-caption">حتى {p.expiresAt.slice(0, 4)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="sb-caption">
              حسب جدول {c.sources.accreditation.name} (آخر قرار فيه{' '}
              {fmt(c.sources.accreditation.latestDecision)}).
            </p>
          </section>

          {c.website ? (
            <a
              className="sb-btn sb-btn--secondary col-site"
              href={c.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="globe" />
              الموقع الرسمي
            </a>
          ) : null}
        </aside>
      </section>
    </>
  );
}
