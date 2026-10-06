import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
};

/** Screen built in Phase 04 (design: route `#/login`). */
export default function LoginPage() {
  return <PagePlaceholder title="تسجيل الدخول" />;
}
