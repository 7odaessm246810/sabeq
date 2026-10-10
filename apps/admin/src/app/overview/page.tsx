import type { Metadata } from 'next';
import { Overview } from './Overview';

export const metadata: Metadata = { title: 'نظرة عامة' };

export default function OverviewPage() {
  return <Overview />;
}
