import type { ReactNode } from 'react';

/** Join class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------------- verified ---------------- */

export function VerifiedSvg() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        className="ring"
        d="M10 1.6l2.1 1.5 2.6-.1.8 2.5 2.1 1.5-.8 2.5.8 2.5-2.1 1.5-.8 2.5-2.6-.1L10 17.8l-2.1-1.5-2.6.1-.8-2.5-2.1-1.5.8-2.5-.8-2.5 2.1-1.5.8-2.5 2.6.1z"
        strokeWidth={0}
      />
      <path
        className="tick"
        d="M6.6 10.1l2.3 2.3 4.5-4.6"
        fill="none"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface VerifiedBadgeProps {
  /** Icon only (next to a name) instead of the pill with text. */
  iconOnly?: boolean;
  /** Play the one-time pop + tick-draw animation (README §6: it moves once). */
  animate?: boolean;
  label?: string;
}

/** «موثق من سابق» — calm primary rosette. Never gold, never shiny. */
export function VerifiedBadge({
  iconOnly = false,
  animate = false,
  label = 'موثق من سابق',
}: VerifiedBadgeProps) {
  if (iconOnly) {
    return (
      <span
        className={cx('sb-verified sb-verified--icon', animate && 'is-animating')}
        role="img"
        aria-label={label}
        title={label}
      >
        <VerifiedSvg />
      </span>
    );
  }
  return (
    <span className={cx('sb-verified', animate && 'is-animating')}>
      <VerifiedSvg />
      {label}
    </span>
  );
}

/* ---------------- avatar ---------------- */

export type Tone = 1 | 2 | 3;

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'lg' | 'xl' | undefined;
  tone?: Tone;
  verified?: boolean;
  src?: string;
}

/** Initial on a calm tone until the mentor uploads a real photo (README §7). Decorative: the name is always shown next to it. */
export function Avatar({ name, size, tone = 1, verified = false, src }: AvatarProps) {
  const initial = name.trim().charAt(0);
  return (
    <span
      className={cx('sb-avatar', size && `sb-avatar--${size}`)}
      data-tone={tone}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : initial}
      {verified ? (
        <span className="sb-avatar-v">
          <VerifiedSvg />
        </span>
      ) : null}
    </span>
  );
}

export function AvatarGroup({ children }: { children: ReactNode }) {
  return <span className="sb-avatars">{children}</span>;
}

/* ---------------- rating ---------------- */

const STAR_PATH = 'm12 3.2 2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.35 2.85 1-6L3.3 9.6l6-.9z';

export function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="sb-stars" role="img" aria-label={`${rating} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={i <= filled ? undefined : 'off'}
          aria-hidden="true"
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}
