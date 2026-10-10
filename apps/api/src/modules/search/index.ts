/**
 * Public  /api/v1/search
 *   GET  suggest?q        → { fields, colleges, mentors }   (search-as-you-type)
 *   GET  popular          → { terms }                      (the week's most searched)
 *   POST log { q }        → { counted }                    (a committed search; 20 per IP per hour)
 */
import { Router } from 'express';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { parseInput, sendData } from '../../core/http.js';
import { hitWindow } from '../auth/limits.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import type { MentorsService } from '../mentors/mentors.service.js';
import { createSearchService } from './search.service.js';

const suggestQuery = z.object({ q: z.string().max(100).default('') });
const logBody = z
  .object({
    q: z
      .string()
      .max(60)
      .regex(/^[\p{L}\p{N} ؟?'-]*$/u),
  })
  .strict();

export function createSearchModule(deps: {
  catalog: CatalogService;
  mentors: MentorsService;
  redis: Redis;
}) {
  const search = createSearchService(deps);
  return {
    search,
    mount(v1: Router) {
      const r = Router();

      r.get('/suggest', async (req, res) => {
        const { q } = parseInput(suggestQuery, req.query);
        res.setHeader('Cache-Control', 'public, max-age=60');
        sendData(res, await search.suggest(q));
      });

      r.get('/popular', async (_req, res) => {
        res.setHeader('Cache-Control', 'public, max-age=300');
        sendData(res, { terms: await search.popular() });
      });

      r.post('/log', async (req, res) => {
        const { q } = parseInput(logBody, req.body);
        const ip = req.ip ?? 'unknown';
        // Over the limit: silently not counted — logging must never get in the visitor's way.
        const window = await hitWindow(deps.redis, `search:log:${ip}`, 20, 3600);
        const counted = window.allowed ? await search.record(q, ip) : false;
        sendData(res, { counted });
      });

      v1.use('/search', r);
    },
  };
}
