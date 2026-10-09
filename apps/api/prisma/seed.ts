/**
 * `pnpm --filter @sabeq/api db:seed`
 *
 * Idempotent: every row is upserted by a natural key, so it can run again after any change.
 * - Catalog (researched real data — prisma/catalog/): every environment.
 * - Demo mentors: only when APP_ENV=local (refused anywhere else).
 */
import { createDb } from '../src/infra/db.js';
import { createLogger } from '../src/core/logger.js';
import type { SessionKind } from '../src/generated/prisma/enums.js';
import { hidePlaceholders, seedCatalog } from './catalog/seed-catalog.js';
import { DEMO_MENTORS, FACULTY_KINDS } from './seed-data.js';

const appEnv = process.env.APP_ENV ?? 'local';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const logger = createLogger({ logLevel: 'info', nodeEnv: 'test', appEnv: 'local' });
const db = createDb({ url, poolMax: 2, logger });

/** Durations of the three session types (booking flow). Prices derive from the mentor's base price. */
const OFFERINGS: { kind: SessionKind; durationMin: number; medium: 'video' | 'audio' }[] = [
  { kind: 'consultation', durationMin: 45, medium: 'video' },
  { kind: 'comparison', durationMin: 60, medium: 'video' },
  { kind: 'quick_call', durationMin: 20, medium: 'audio' },
];

async function seedDemoMentors() {
  for (const m of DEMO_MENTORS) {
    const faculty = await db.faculty.findFirstOrThrow({
      where: { university: { slug: m.universitySlug }, kind: { slug: m.kindSlug } },
      include: { departments: true },
    });
    const department = faculty.departments.find((d) => d.nameAr === m.department);

    const user = await db.user.upsert({
      where: { phone: m.phone },
      update: { fullName: m.name },
      create: { phone: m.phone, role: 'mentor', fullName: m.name },
    });

    const mentorData = {
      slug: m.slug,
      kind: m.kind,
      facultyId: faculty.id,
      departmentId: department?.id ?? null,
      majorLabel: m.majorLabel,
      graduationYear: m.graduationYear,
      bio: m.bio,
      city: m.city,
      basePricePiasters: m.priceEgp * 100,
      isListed: true,
      listedAt: new Date(),
      acceptsBookings: m.available,
      ratingAvg: m.rating,
      ratingCount: Math.max(0, m.sessions - 3),
      sessionsCompleted: m.sessions,
    };
    await db.mentor.upsert({
      where: { userId: user.id },
      update: mentorData,
      create: { userId: user.id, ...mentorData },
    });

    await db.mentorTopic.deleteMany({ where: { mentorId: user.id } });
    await db.mentorTopic.createMany({
      data: m.topics.map((label, sortOrder) => ({ mentorId: user.id, label, sortOrder })),
    });

    for (const o of OFFERINGS) {
      await db.sessionOffering.upsert({
        where: { mentorId_kind: { mentorId: user.id, kind: o.kind } },
        update: { durationMin: o.durationMin, medium: o.medium, isActive: true },
        create: { mentorId: user.id, ...o },
      });
    }

    // Evenings, three days a week (Cairo time) — enough to exercise scheduling in Phase 14.
    await db.availabilityRule.deleteMany({ where: { mentorId: user.id } });
    if (m.available) {
      await db.availabilityRule.createMany({
        data: [0, 2, 4].map((weekday) => ({
          mentorId: user.id,
          weekday,
          startMinute: 16 * 60,
          endMinute: 22 * 60,
        })),
      });
    }
  }
  logger.info({ mentors: DEMO_MENTORS.length }, 'demo mentors seeded');
}

async function main() {
  await seedCatalog(db, logger);
  // The prototype's quotes were presented as graduates' words; they are not real people.
  const hidden = await hidePlaceholders(
    db,
    FACULTY_KINDS.flatMap((k) => k.insights),
  );
  logger.info(hidden, 'prototype placeholders hidden');
  if (appEnv === 'local') await seedDemoMentors();
  else logger.info({ appEnv }, 'skipping demo mentors outside local');
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
