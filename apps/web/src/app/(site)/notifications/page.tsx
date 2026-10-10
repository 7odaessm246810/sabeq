import type { Metadata } from 'next';
import { NotificationsClient } from './NotificationsClient';

export const metadata: Metadata = {
  title: 'الإشعارات',
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
