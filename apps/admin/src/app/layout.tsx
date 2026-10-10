import '@sabeq/tokens/tokens.css';
import '@sabeq/ui/styles.css';
import './admin.css';

import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@sabeq/ui';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { fontVariables } from '@/lib/fonts';

export const metadata: Metadata = {
  title: { default: 'لوحة تحكم سابق', template: '%s — لوحة تحكم سابق' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#f7f5f0',
  colorScheme: 'light',
};

/**
 * Rendered per request: the Content-Security-Policy nonce (proxy.ts, Phase 21) is new each time, and
 * Next.js puts it on its scripts only while rendering.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="sb">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
