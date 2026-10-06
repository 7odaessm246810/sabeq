import type { Metadata } from 'next';
import { TextPage } from '@/components/TextPage';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'تواصل معنا',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <TextPage title="تواصل معنا">
      <p>
        ابعتلنا على <span className="sb-num">{SITE.contactEmail}</span> وهنرد خلال يوم عمل.
      </p>
    </TextPage>
  );
}
