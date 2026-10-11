import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginFlow } from './LoginFlow';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="auth" aria-busy="true" />}>
      <LoginFlow />
    </Suspense>
  );
}
