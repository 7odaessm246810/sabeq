import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'استكشف الكليات',
};

/** Screen built in Phase 04 (design: route `#/explore`). */
export default function ExplorePage() {
  return <PagePlaceholder title="استكشف الكليات" />;
}
