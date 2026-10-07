import type { Metadata } from 'next';
import { ApplicationReview } from './ApplicationReview';

export const metadata: Metadata = { title: 'مراجعة طلب' };

export default async function ApplicationPage({ params }: PageProps<'/applications/[id]'>) {
  const { id } = await params;
  return <ApplicationReview id={id} />;
}
