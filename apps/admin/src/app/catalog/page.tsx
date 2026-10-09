import type { Metadata } from 'next';
import { CatalogHome } from './CatalogHome';

export const metadata: Metadata = { title: 'أنواع الكليات' };

export default function CatalogPage() {
  return <CatalogHome />;
}
