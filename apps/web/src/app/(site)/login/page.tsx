import type { Metadata } from 'next';
import { LoginFlow } from './LoginFlow';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginFlow />;
}
