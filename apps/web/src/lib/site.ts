import type { IconName } from '@sabeq/ui';

export const SITE = {
  name: 'سابق',
  nameLatin: 'SABEQ',
  title: 'سابق — اسأل من سبقك',
  description: 'قبل ما تختار مستقبلك، اسأل حد عاش الطريق قبلك.',
  tagline: 'اسأل من سبقك. واختار طريقك بشكل أفضل.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  contactEmail: 'hello@sabeq.example',
} as const;

export interface NavLink {
  label: string;
  href: string;
  /** Path prefixes that mark this link as the current page. */
  match?: readonly string[];
}

/** Desktop navbar — order and labels from the prototype. */
export const MAIN_NAV: readonly NavLink[] = [
  { label: 'الرئيسية', href: '/', match: ['/'] },
  { label: 'كيف تعمل؟', href: '/#how' },
  { label: 'المرشدين', href: '/mentors', match: ['/mentors', '/mentor'] },
  { label: 'للمرشدين', href: '/become-mentor', match: ['/become-mentor'] },
  { label: 'استكشف الكليات', href: '/explore', match: ['/explore', '/faculty'] },
];

/** Mobile menu — the prototype adds «جلساتي» and orders it differently. */
export const MOBILE_NAV: readonly NavLink[] = [
  { label: 'الرئيسية', href: '/' },
  { label: 'كيف تعمل؟', href: '/#how' },
  { label: 'استكشف الكليات', href: '/explore' },
  { label: 'المرشدين', href: '/mentors' },
  { label: 'للمرشدين', href: '/become-mentor' },
  { label: 'جلساتي', href: '/sessions' },
];

export const FOOTER_COLUMNS: readonly { title: string; links: readonly NavLink[] }[] = [
  {
    title: 'للطلبة',
    links: [
      { label: 'كيف تعمل؟', href: '/#how' },
      { label: 'استكشف الكليات', href: '/explore' },
      { label: 'كل المرشدين', href: '/mentors' },
      { label: 'دليل التنسيق 2026', href: '/help' },
    ],
  },
  {
    title: 'للمرشدين',
    links: [
      { label: 'كن مرشدًا', href: '/become-mentor' },
      { label: 'التوثيق', href: '/become-mentor' },
      { label: 'الأسعار والأرباح', href: '/become-mentor' },
      { label: 'إرشادات الجلسات', href: '/help' },
    ],
  },
  {
    title: 'استكشف',
    links: [
      { label: 'الهندسة', href: '/faculty/eng' },
      { label: 'الطب', href: '/faculty/med' },
      { label: 'حاسبات ومعلومات', href: '/faculty/cs' },
      { label: 'كل الجامعات', href: '/explore' },
    ],
  },
  {
    title: 'سابق',
    links: [
      { label: 'عن المنصة', href: '/about' },
      { label: 'المساعدة', href: '/help' },
      { label: 'تواصل معنا', href: '/contact' },
      { label: 'الشروط والأحكام', href: '/terms' },
      { label: 'الخصوصية', href: '/privacy' },
    ],
  },
];

/** Real profile URLs are filled in before launch. */
export const SOCIAL_LINKS: readonly { icon: IconName; label: string; href: string }[] = [
  { icon: 'facebook', label: 'فيسبوك', href: '#' },
  { icon: 'instagram', label: 'إنستجرام', href: '#' },
  { icon: 'tiktok', label: 'تيك توك', href: '#' },
  { icon: 'linkedin', label: 'لينكدإن', href: '#' },
];

export function isCurrent(link: NavLink, pathname: string): boolean {
  if (!link.match) return false;
  return link.match.some((p) =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`),
  );
}
