import '@sabeq/tokens/tokens.css';
import '@sabeq/ui/styles.css';
import './admin.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';

export const metadata: Metadata = {
  title: { default: 'لوحة تحكم سابق', template: '%s — لوحة تحكم سابق' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#f7f5f0',
  colorScheme: 'light',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="sb">{children}</body>
    </html>
  );
}
