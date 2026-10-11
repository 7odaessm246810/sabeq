import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = {
  title: 'باسورد جديد',
  robots: { index: false, follow: false },
};

/** The link from the password email (forgot password, or a new admin's first password). */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<section className="auth" aria-busy="true" />}>
      <ResetForm />
    </Suspense>
  );
}
