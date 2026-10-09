/**
 * Public  /api/v1/media
 *   GET logos/:name   → the image (bundled or uploaded) · 404 when unknown
 *
 * Names are random per upload, so a response never changes: browsers and CDNs keep it a year.
 */
import { Router } from 'express';
import type { ObjectStore } from '../../infra/storage.js';
import { createLogoStore } from './logos.js';

export { logoUrl } from './logos.js';
export type { LogoStore } from './logos.js';

export function createMediaModule(deps: { store: ObjectStore }) {
  const logos = createLogoStore(deps.store);
  return {
    logos,
    mount(v1: Router) {
      const r = Router();
      r.get('/logos/:name', async (req, res) => {
        const logo = await logos.read(String(req.params.name));
        if (!logo) {
          res.status(404).end();
          return;
        }
        res.setHeader('Content-Type', logo.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // An image, never a document: no scripts, no framing, no sniffing.
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
        res.end(logo.body);
      });
      v1.use('/media', r);
    },
  };
}
