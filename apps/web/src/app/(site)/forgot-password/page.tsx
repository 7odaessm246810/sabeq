import type { Metadata } from 'next';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = {
  title: 'نسيت الباسورد',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
