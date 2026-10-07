import type { Metadata } from 'next';
import { WelcomeClient } from './WelcomeClient';

export const metadata: Metadata = {
  title: 'أهلًا بيك',
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return <WelcomeClient />;
}
