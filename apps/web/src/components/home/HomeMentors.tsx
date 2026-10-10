'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ExploreFaculty } from '@/lib/catalog';
import type { Mentor } from '@/lib/mock/data';

interface HomeMentors {
  /** Featured listed mentors (Phase 12) — empty until the first mentors are approved. */
  mentors: readonly Mentor[];
  /** All listed mentors. */
  total: number;
  /** Faculty kinds with real mentor counts (catalog API). */
  kinds: readonly ExploreFaculty[];
}

const Ctx = createContext<HomeMentors>({ mentors: [], total: 0, kinds: [] });

/** Real mentors and faculties for the landing page's search suggestions and mentors section. */
export function HomeMentorsProvider({ children, ...value }: HomeMentors & { children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useHomeMentors = () => useContext(Ctx);
