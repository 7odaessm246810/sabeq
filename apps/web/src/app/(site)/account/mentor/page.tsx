import type { Metadata } from 'next';
import { MentorProfileEditor } from './MentorProfileEditor';

export const metadata: Metadata = {
  title: 'ملفي كمرشد',
  robots: { index: false, follow: false },
};

export default function MentorAccountPage() {
  return <MentorProfileEditor />;
}
