import type { ReactNode } from 'react';
import { Crumb, type CrumbItem } from './Crumb';

/** Grey band at the top of product pages: breadcrumb, title row, optional extras (prototype `.page-head`). */
export function PageHead({
  crumbs,
  children,
  className,
}: {
  crumbs: readonly CrumbItem[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `page-head ${className}` : 'page-head'}>
      <div className="sb-container">
        <Crumb items={crumbs} />
        {children}
      </div>
    </section>
  );
}
