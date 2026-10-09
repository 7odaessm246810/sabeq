-- Phase 11c: admin-managed universities and faculties with logos.
ALTER TABLE "universities"
  ADD COLUMN "logo_key" VARCHAR(80),
  ADD COLUMN "admin_edited_at" TIMESTAMP(3);

ALTER TABLE "faculty_kinds" ADD COLUMN "admin_edited_at" TIMESTAMP(3);

ALTER TABLE "faculties"
  ADD COLUMN "governorate" VARCHAR(60),
  ADD COLUMN "website" VARCHAR(200),
  ADD COLUMN "about" TEXT,
  ADD COLUMN "logo_key" VARCHAR(80),
  ADD COLUMN "admin_edited_at" TIMESTAMP(3);

-- Logo names are plain file names; anything else must never reach the media route.
ALTER TABLE "universities" ADD CONSTRAINT "universities_logo_key_check"
  CHECK ("logo_key" ~ '^[a-z0-9-]+\.(png|jpg|webp)$');
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_logo_key_check"
  CHECK ("logo_key" ~ '^[a-z0-9-]+\.(png|jpg|webp)$');
