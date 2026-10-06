import type { Metadata } from 'next';
import { TextPage } from '@/components/TextPage';

export const metadata: Metadata = {
  title: 'الخصوصية',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <TextPage title="الخصوصية">
      <p>بنستخدم بياناتك لتشغيل الحجز والتوثيق بس. نص سياسة الخصوصية الكامل هيتكتب قبل الإطلاق.</p>
    </TextPage>
  );
}
