/**
 * Public  /api/v1/media
 *   GET logos/:name     → a university / faculty logo (bundled or uploaded) · 404 when unknown
 *   GET avatars/:name   → a mentor's profile photo · 404 when unknown
 *
 * Names are random per upload, so a response never changes: browsers and CDNs keep it a year.
 */
import { Router, type Response } from 'express';
import type { ObjectStore } from '../../infra/storage.js';
import { createAvatarStore, createLogoStore, type ImageStore } from './logos.js';

export { avatarUrl, logoUrl } from './logos.js';
export type { AvatarStore, ImageStore, LogoStore } from './logos.js';

async function send(images: ImageStore, name: string, res: Response) {
  const image = await images.read(name);
  if (!image) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', image.contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // An image, never a document: no scripts, no framing, no sniffing.
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.end(image.body);
}

export function createMediaModule(deps: { store: ObjectStore }) {
  const logos = createLogoStore(deps.store);
  const avatars = createAvatarStore(deps.store);
  return {
    logos,
    avatars,
    mount(v1: Router) {
      const r = Router();
      r.get('/logos/:name', (req, res) => send(logos, String(req.params.name), res));
      r.get('/avatars/:name', (req, res) => send(avatars, String(req.params.name), res));
      v1.use('/media', r);
    },
  };
}
