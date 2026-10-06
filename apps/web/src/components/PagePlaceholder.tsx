import { EmptyState } from '@sabeq/ui';
import Link from 'next/link';
import { Crumb } from './Crumb';

/**
 * Temporary stand-in for routes whose screens are built in Phase 04.
 * The route, title and metadata are final; only the body is pending.
 */
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <section className="sb-container page-body narrow-page">
      <Crumb items={[{ label: 'الرئيسية', href: '/' }, { label: title }]} />
      <div className="sb-card placeholder-card">
        <EmptyState
          roomy
          title={title}
          description="الصفحة دي هتتبني بالتصميم الكامل في المرحلة الجاية."
          actions={
            <Link className="sb-btn sb-btn--secondary sb-btn--sm" href="/">
              الرئيسية
            </Link>
          }
        />
      </div>
    </section>
  );
}
