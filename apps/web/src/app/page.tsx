import type { Metadata } from 'next';
import { FinalCta, ForMentors, RevealRoot, Testimonials, Trust } from '@/components/home/Close';
import { BookingWidget, ExploreSection, MentorsSection } from '@/components/home/Discover';
import { Hero } from '@/components/home/Hero';
import { HowItWorks, Verification } from '@/components/home/HowItWorks';
import { Compare, Problem, Solution } from '@/components/home/Story';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  alternates: { canonical: '/' },
};

/**
 * Landing page — the 14 sections of the design, in order. The hero runs under the transparent navbar,
 * so it carries its own top padding instead of using the (site) template.
 */
export default function HomePage() {
  return (
    <RevealRoot>
      <Hero />
      <Problem />
      <Compare />
      <Solution />
      <HowItWorks />
      <Verification />
      <ExploreSection />
      <MentorsSection />
      <BookingWidget />
      <Trust />
      <Testimonials />
      <ForMentors />
      <FinalCta />
    </RevealRoot>
  );
}
