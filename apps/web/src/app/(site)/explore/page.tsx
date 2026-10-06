import type { Metadata } from 'next';
import { ExploreClient } from './ExploreClient';

export const metadata: Metadata = {
  title: 'استكشف الكليات',
  description: 'اختار الكلية اللي بتفكر فيها، وشوف مين درس فيها فعلًا.',
  alternates: { canonical: '/explore' },
};

export default function ExplorePage() {
  return <ExploreClient />;
}
