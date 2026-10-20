import type { Metadata } from 'next';
import { connection } from 'next/server';
import { RevealRoot } from '@/components/home/Close';
import { JoinBand, QuickSteps } from '@/components/home/Compact';
import { MentorsSection } from '@/components/home/Discover';
import { Hero } from '@/components/home/Hero';
import { HomeMentorsProvider } from '@/components/home/HomeMentors';
import { getExploreData } from '@/lib/catalog';
import { listMentors, toMentorView } from '@/lib/mentors';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  alternates: { canonical: '/' },
};

/**
 * Landing page, kept short on purpose (2026-10-20): hero, how it works, real mentors, joining. The hero runs under the transparent navbar,
 * so it carries its own top padding instead of using the (site) template.
 */
export default async function HomePage() {
  // Rendered per request for the real mentors (1-minute data cache); the page itself is static.
  await connection();
  const [featured, explore] = await Promise.all([
    listMentors({ pageSize: 6 }).catch(() => ({ total: 0, results: [] })),
    getExploreData().catch(() => ({ faculties: [], universities: [] })),
  ]);
  return (
    <HomeMentorsProvider
      mentors={featured.results.map(toMentorView)}
      total={featured.total}
      kinds={explore.faculties}
    >
      <RevealRoot>
        <Hero />
        <QuickSteps />
        <MentorsSection />
        <JoinBand />
      </RevealRoot>
    </HomeMentorsProvider>
  );
}
