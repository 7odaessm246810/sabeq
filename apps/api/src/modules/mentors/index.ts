import type { Router } from 'express';
import type { Db } from '../../infra/db.js';
import type { createAuthModule } from '../auth/index.js';
import type { AvatarStore } from '../media/index.js';
import { mentorsRouter, ownMentorRouter, savedMentorsRouter } from './mentors.routes.js';
import { createMentorsService } from './mentors.service.js';

/** Mentor profiles (Phase 12): public profiles and lists, the mentor's own profile, saved mentors. */
export function createMentorsModule(deps: {
  db: Db;
  auth: ReturnType<typeof createAuthModule>;
  avatars: AvatarStore;
  nextSlots?: (mentorIds: string[]) => Promise<Map<string, Date | null>>;
  indexTtlMs?: number;
}) {
  const mentors = createMentorsService(deps);
  const authenticate = deps.auth.authenticate('web');
  return {
    mentors,
    mount(v1: Router) {
      v1.use('/mentors', mentorsRouter({ mentors }));
      v1.use('/me/mentor', ownMentorRouter({ mentors, authenticate }));
      v1.use('/me/saved-mentors', savedMentorsRouter({ mentors, authenticate }));
    },
  };
}
