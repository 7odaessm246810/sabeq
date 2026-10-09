import type { Metadata } from 'next';
import { KindEditor } from './KindEditor';

export const metadata: Metadata = { title: 'تعديل كلية' };

export default async function KindPage({ params }: PageProps<'/catalog/[id]'>) {
  const { id } = await params;
  return <KindEditor id={id} />;
}
