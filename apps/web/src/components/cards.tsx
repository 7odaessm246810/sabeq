import { Avatar, Icon, Stars, VerifiedBadge, cx } from '@sabeq/ui';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Faculty, Mentor, Review } from '@/lib/mock/data';

/**
 * Mentor card — fixed order (README §6): name + verification → academic path → rating & sessions
 * → next slot → price + «احجز جلسة».
 */
export function MentorCard({
  mentor: m,
  compact = false,
  className,
  style,
}: {
  mentor: Mentor;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <article
      className={cx(
        'sb-card sb-card--interactive sb-mentor',
        compact && 'sb-mentor--compact',
        className,
      )}
      aria-label={m.name}
      style={style}
    >
      <div className="sb-mentor-head">
        <Avatar name={m.name} size={compact ? undefined : 'lg'} tone={m.tone} verified={compact} />
        <div className="sb-mentor-id">
          <h3 className="sb-mentor-name">
            <Link href={`/mentor/${m.id}`} className="mlink">
              {m.name}
            </Link>
            {compact ? null : <VerifiedBadge iconOnly />}
          </h3>
          {compact ? (
            <span className="sb-small">
              {m.major} · {m.uni}
            </span>
          ) : (
            <VerifiedBadge />
          )}
        </div>
      </div>
      {compact ? null : (
        <dl className="sb-mentor-path">
          <dt>الكلية</dt>
          <dd>{m.faculty}</dd>
          <dt>الجامعة</dt>
          <dd>{m.uni}</dd>
          <dt>التخصص</dt>
          <dd>{m.major}</dd>
          <dt>التخرج</dt>
          <dd>
            <span className="sb-num">{m.year}</span>
          </dd>
        </dl>
      )}
      <div className="sb-mentor-stats">
        <span className="sb-rating">
          <Icon name="star" />
          <span className="sb-num">{m.rating}</span>
        </span>
        <span className="sep" />
        <span>
          <span className="sb-num">{m.sessions}</span> جلسة
        </span>
        <span className="sep" />
        <span>{m.city}</span>
      </div>
      {compact ? null : m.available ? (
        <span className="sb-status sb-status--on">
          <span className="sb-dot" />
          {m.next ?? 'متاح للحجز'}
        </span>
      ) : (
        <span className="sb-status sb-status--off">
          <span className="sb-dot" />
          لا توجد مواعيد هذا الأسبوع
        </span>
      )}
      <div className="sb-mentor-foot">
        <span className="sb-price">
          <b>
            <span className="sb-num">{m.price}</span> ج.م
          </b>
          <span>45 دقيقة</span>
        </span>
        <Link href={`/mentor/${m.id}`} className="sb-btn sb-btn--ghost sb-btn--sm">
          الملف
        </Link>
        <Link href={`/book/${m.id}`} className="sb-btn sb-btn--primary sb-btn--sm">
          احجز جلسة
        </Link>
      </div>
    </article>
  );
}

export function FacultyCard({
  faculty: f,
  className,
  delay,
  style,
}: {
  faculty: Faculty;
  className?: string;
  /** Reveal stagger in ms (`data-delay`). */
  delay?: number;
  style?: CSSProperties;
}) {
  return (
    <Link
      href={`/faculty/${f.id}`}
      className={cx('sb-card sb-card--interactive sb-faculty', className)}
      data-delay={delay}
      style={style}
    >
      <span className="sb-faculty-ico">
        <Icon name={f.icon} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="sb-h3" style={{ fontSize: 18 }}>
          {f.name}
        </span>
        <span className="sb-small">{f.desc}</span>
      </span>
      <span className="sb-faculty-meta">
        <span>
          <span className="sb-num">{f.mentors}</span> مرشد موثق
        </span>
        <span style={{ display: 'inline-flex', width: 18, height: 18, color: 'var(--primary)' }}>
          <Icon name="arrow" />
        </span>
      </span>
    </Link>
  );
}

export function ReviewCard({
  review: r,
  className,
  delay,
}: {
  review: Review;
  className?: string;
  delay?: number;
}) {
  return (
    <figure className={cx('sb-card sb-review', className)} style={{ margin: 0 }} data-delay={delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stars rating={r.rating} />
        <span className="sb-caption">{r.date}</span>
      </div>
      <div className="sb-review-topic">
        <Icon name="chat" size={16} />
        <span>جلسة عن: {r.topic}</span>
      </div>
      <blockquote className="sb-review-body" style={{ margin: 0 }}>
        {r.text}
      </blockquote>
      <figcaption className="sb-review-who">
        <Avatar name={r.name} size="sm" tone={r.tone} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
          <b style={{ fontSize: 14 }}>{r.name}</b>
          <span className="sb-caption">{r.who}</span>
        </span>
      </figcaption>
    </figure>
  );
}
