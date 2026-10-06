import type { ReactNode } from 'react';
import { Crumb } from './Crumb';

/** Static text pages (about, help, contact, terms, privacy) — prototype `P.text`. */
export function TextPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sb-container page-body text-page">
      <Crumb items={[{ label: 'الرئيسية', href: '/' }, { label: title }]} />
      <h1 className="sb-h1 text-page-title">{title}</h1>
      <div className="prose">{children}</div>
    </section>
  );
}
