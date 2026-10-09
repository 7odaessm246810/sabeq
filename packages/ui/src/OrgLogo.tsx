'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import type { IconName } from './icon-paths';
import { cx } from './identity';

export interface OrgLogoProps {
  /** Logo URL, or null when there is none yet. */
  src: string | null;
  /** University or faculty name — the image's alt text and the fallback's initial. */
  name: string;
  /** Fallback when there is no logo (the faculty kind's icon); otherwise the name's first letter. */
  icon?: IconName | undefined;
  size?: number;
  className?: string;
}

/**
 * A university or faculty logo in a rounded square (Phase 11c — not in the handoff; built from the
 * avatar's tokens). Falls back to the icon or initial when the logo is missing or fails to load.
 */
export function OrgLogo({ src, name, icon, size = 48, className }: OrgLogoProps) {
  const [broken, setBroken] = useState(false);
  const initial = name.replace(/^(كلية|جامعة|الجامعة)\s+(ال)?/, '').trim()[0] ?? '؟';
  return (
    <span className={cx('sb-orglogo', className)} style={{ ['--s' as string]: `${size}px` }}>
      {src && !broken ? (
        // Plain <img>: logos are tiny, immutable files served by the API.
        <img src={src} alt={`لوجو ${name}`} loading="lazy" onError={() => setBroken(true)} />
      ) : icon ? (
        <Icon name={icon} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
