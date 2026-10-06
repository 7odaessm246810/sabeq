import { PagePlaceholder } from '@/components/PagePlaceholder';

/**
 * Landing page — built in Phase 04 (design: route `#/`, hero runs under the transparent navbar,
 * so it handles its own top padding instead of using the (site) template).
 */
export default function HomePage() {
  return (
    <div className="page-pad page-in">
      <PagePlaceholder title="الرئيسية" />
    </div>
  );
}
