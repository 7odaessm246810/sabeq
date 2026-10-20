'use client';

import { useRef, type ReactNode } from 'react';
import { useReveal } from '@/lib/motion';

/** Applies the scroll-reveal behaviour to every `.sb-reveal` on the landing page. */
export function RevealRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return <div ref={ref}>{children}</div>;
}
