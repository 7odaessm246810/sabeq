import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './icon-paths';
import { cx } from './identity';

/* ---------------- banner ---------------- */

export type BannerKind = 'info' | 'success' | 'warning' | 'error';

const BANNER_ICONS: Record<BannerKind, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'alert',
};

/** Inline status message. Status colour always comes with an icon and words (Accessibility). */
export function Banner({
  kind,
  title,
  children,
  action,
}: {
  kind: BannerKind;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`sb-banner sb-banner--${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={BANNER_ICONS[kind]} />
      <div>
        <b>{title}</b>
        {children ? <span>{children}</span> : null}
      </div>
      {action ? <span className="sb-banner-act">{action}</span> : null}
    </div>
  );
}

/* ---------------- field message ---------------- */

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span className="sb-msg sb-msg--error" id={id}>
      <Icon name="alert" />
      <span>{children}</span>
    </span>
  );
}

/* ---------------- skeleton ---------------- */

export function Skeleton({
  circle = false,
  style,
  className,
}: {
  circle?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={cx('sb-skel', circle && 'sb-skel--circle', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Same shape as a mentor card (UX Flows: skeleton keeps the layout). */
export function MentorCardSkeleton() {
  return (
    <div className="sb-card sb-mentor" aria-hidden="true">
      <div className="sb-mentor-head">
        <Skeleton circle style={{ width: 64, height: 64 }} />
        <div className="sb-mentor-id" style={{ gap: 10 }}>
          <Skeleton style={{ width: '60%', height: 16 }} />
          <Skeleton style={{ width: '40%', height: 22, borderRadius: 999 }} />
        </div>
      </div>
      <Skeleton style={{ height: 110, borderRadius: 8 }} />
      <Skeleton style={{ width: '70%', height: 14 }} />
    </div>
  );
}

/* ---------------- success ring ---------------- */

/** Check drawn inside a success-soft circle — booking and application confirmations. */
export function SuccessRing() {
  return (
    <svg className="ring" viewBox="0 0 88 88" aria-hidden="true">
      <circle cx={44} cy={44} r={44} />
      <path d="M28 45l11 11 21-22" />
    </svg>
  );
}
