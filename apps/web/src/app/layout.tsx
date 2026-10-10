import '@sabeq/tokens/tokens.css';
import '@sabeq/ui/styles.css';
import '@/styles/shell.css';
import '@/styles/landing.css';
import '@/styles/pages.css';

import { ToastProvider } from '@sabeq/ui';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/lib/auth';
import { DemoStoreProvider } from '@/lib/demo-store';
import { fontVariables } from '@/lib/fonts';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: '%s — سابق' },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: 'website',
    locale: 'ar_EG',
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#f7f5f0',
  colorScheme: 'light',
};

/**
 * Rendered per request: the Content-Security-Policy nonce (proxy.ts, Phase 21) is new each time, and
 * Next.js puts it on its scripts only while rendering.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="sb">
        <ToastProvider>
          <AuthProvider>
            <DemoStoreProvider>
              <a className="skip-link" href="#main">
                انتقل للمحتوى
              </a>
              <Navbar />
              <main id="main">{children}</main>
              <Footer />
            </DemoStoreProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
