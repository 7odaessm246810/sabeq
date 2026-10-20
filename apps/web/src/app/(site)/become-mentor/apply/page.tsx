import type { Metadata } from 'next';
import { ApplyForm } from './ApplyForm';

export const metadata: Metadata = {
  title: 'التقديم كمستشار',
  robots: { index: false, follow: false },
};

export default function ApplyPage() {
  return <ApplyForm />;
}
