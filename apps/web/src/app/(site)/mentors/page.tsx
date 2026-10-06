import type { Metadata } from 'next';
import { MentorsClient } from './MentorsClient';

export const metadata: Metadata = {
  title: 'المرشدين',
  description: 'طلاب وخريجين موثقين من كل الكليات. قارن بالجامعة والتقييم والسعر واحجز جلسة.',
  alternates: { canonical: '/mentors' },
};

export default function MentorsPage() {
  return <MentorsClient />;
}
