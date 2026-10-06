import Link from 'next/link';
import { Fragment } from 'react';

export interface CrumbItem {
  label: string;
  href?: string;
}

/** Breadcrumb from the prototype `crumb()`: links separated by «/», the last item bold. */
export function Crumb({ items }: { items: readonly CrumbItem[] }) {
  return (
    <nav className="crumb" aria-label="مسار التنقل">
      {items.map((item, i) =>
        i < items.length - 1 && item.href ? (
          <Fragment key={item.label}>
            <Link href={item.href}>{item.label}</Link>
            <span aria-hidden="true">/</span>
          </Fragment>
        ) : (
          <b key={item.label} aria-current="page">
            {item.label}
          </b>
        ),
      )}
    </nav>
  );
}
