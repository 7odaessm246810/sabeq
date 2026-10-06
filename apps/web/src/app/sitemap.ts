import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

/** Static pages for now. Faculties and mentor profiles are added from the API in Phases 11–13. */
const STATIC_PATHS = [
  '/',
  '/explore',
  '/mentors',
  '/become-mentor',
  '/about',
  '/help',
  '/contact',
  '/terms',
  '/privacy',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_PATHS.map((path) => ({
    url: new URL(path, SITE.url).toString(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
