import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

/** Public discovery pages are indexable; personal and transactional pages are not. */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.APP_ENV === 'production';
  return {
    rules: isProduction
      ? {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/', '/book/', '/sessions', '/login', '/become-mentor/apply'],
        }
      : { userAgent: '*', disallow: '/' },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
