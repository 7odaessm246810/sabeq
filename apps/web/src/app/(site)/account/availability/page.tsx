import type { Metadata } from 'next';
import { AvailabilityEditor } from './AvailabilityEditor';

export const metadata: Metadata = {
  title: 'مواعيدي',
  robots: { index: false, follow: false },
};

export default function AvailabilityPage() {
  return <AvailabilityEditor />;
}
