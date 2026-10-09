import type { Metadata } from 'next';
import { CatalogHome } from './CatalogHome';

export const metadata: Metadata = { title: 'الكليات والجامعات' };

export default function CatalogPage() {
  return <CatalogHome />;
}
