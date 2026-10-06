import { ICON_PATHS, type IconName } from './icon-paths';

export interface IconProps {
  name: IconName;
  className?: string;
  /** Pixel size; omit to let CSS size the icon (most design-system classes do). */
  size?: number;
}

/** Decorative line icon. Pair it with visible text or an `aria-label` on the parent control. */
export function Icon({ name, className, size }: IconProps) {
  const filled = name === 'star';
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
