import '@sabeq/tokens/tokens.css';
import '@sabeq/ui/styles.css';
import '@/styles/shell.css';

import { ToastProvider } from '@sabeq/ui';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="sb">
        <ToastProvider>
          <a className="skip-link" href="#main">
            انتقل للمحتوى
          </a>
          <Navbar />
          <main id="main">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
