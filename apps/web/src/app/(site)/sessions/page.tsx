import type { Metadata } from 'next';
import { SessionsClient } from './SessionsClient';

export const metadata: Metadata = {
  title: 'جلساتي',
  robots: { index: false, follow: false },
};

export default function SessionsPage() {
  return <SessionsClient />;
}
