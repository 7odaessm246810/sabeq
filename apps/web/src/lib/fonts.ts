import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Readex_Pro } from 'next/font/google';

/** Display — headlines (README §4). Variable font. */
export const readexPro = Readex_Pro({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--nf-display',
});

/** UI and body text. */
export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--nf-sans',
});

/** Numbers only: prices, times, step numbers. */
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  // Numbers only and absent from many pages — loading it eagerly would waste the preload.
  preload: false,
  variable: '--nf-mono',
});

export const fontVariables = [readexPro.variable, plexArabic.variable, plexMono.variable].join(' ');
