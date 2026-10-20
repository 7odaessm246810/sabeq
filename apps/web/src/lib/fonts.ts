import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Readex_Pro } from 'next/font/google';

/*
 * 'optional' for the Arabic faces: used if they arrive within the first moments (they are preloaded),
 * otherwise the system font stays for that view and the next page has them cached. 'swap' made the
 * hero text jump when the font landed after the (now inlined) CSS painted it — CLS 0.19.
 */

/** Display — headlines (README §4). Variable font. */
export const readexPro = Readex_Pro({
  subsets: ['arabic', 'latin'],
  display: 'optional',
  variable: '--nf-display',
});

/** UI and body text. */
export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'optional',
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
