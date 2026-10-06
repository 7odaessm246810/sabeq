import type { Metadata } from 'next';
import { TextPage } from '@/components/TextPage';

export const metadata: Metadata = {
  title: 'الشروط والأحكام',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <TextPage title="الشروط والأحكام">
      <p>نص الشروط والأحكام هيتكتب مع الفريق القانوني قبل الإطلاق. ده مكانه في التصميم.</p>
    </TextPage>
  );
}
