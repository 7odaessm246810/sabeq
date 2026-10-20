'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A bar fixed to the bottom of a phone screen (hidden on wider screens by CSS). Rendered on <body>:
 * the page transition transforms the page, and a transformed ancestor would pin it to the page instead.
 */
export function BottomBar({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // Portals need the document, which only exists after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client flag
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(<div className="prof-mbar">{children}</div>, document.body) : null;
}
