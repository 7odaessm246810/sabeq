import type { Metadata } from 'next';
import { ApplyForm } from './ApplyForm';

export const metadata: Metadata = {
  title: 'التقديم كمرشد',
  robots: { index: false, follow: false },
};

export default function ApplyPage() {
  return <ApplyForm />;
}
