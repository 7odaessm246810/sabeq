-- Phase 11: real catalog data — accreditation per faculty, tansik cutoffs, several faculties of one kind
-- per university, technological and international universities.

-- CreateEnum
CREATE TYPE "AccreditationStatus" AS ENUM ('accredited', 'conditional', 'not_accredited', 'unknown');

-- AlterEnum

ALTER TYPE "UniversityType" ADD VALUE 'technological';
ALTER TYPE "UniversityType" ADD VALUE 'international';

-- DropIndex
DROP INDEX "faculties_kind_id_idx";

-- DropIndex
DROP INDEX "faculties_university_id_kind_id_key";

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "source_url" VARCHAR(400);

-- Backfill: faculties created before Phase 11 may have no name of their own.
UPDATE "faculties" f SET "name_ar" = k."full_name_ar" FROM "faculty_kinds" k WHERE f."kind_id" = k."id" AND f."name_ar" IS NULL;

-- AlterTable
ALTER TABLE "faculties" ADD COLUMN     "accreditation_expires_at" DATE,
ADD COLUMN     "accreditation_status" "AccreditationStatus" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "accredited_at" DATE,
ADD COLUMN     "accredited_programs" JSONB,
ADD COLUMN     "city" VARCHAR(80),
ADD COLUMN     "source_url" VARCHAR(400),
ADD COLUMN     "verified_at" DATE,
ALTER COLUMN "name_ar" SET NOT NULL;

-- AlterTable
ALTER TABLE "universities" ADD COLUMN     "source_url" VARCHAR(400),
ADD COLUMN     "website" VARCHAR(200),
ALTER COLUMN "governorate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "faculty_cutoffs" (
    "id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "track" "StudentTrack" NOT NULL,
    "phase" SMALLINT NOT NULL DEFAULT 1,
    "min_score" DECIMAL(5,2) NOT NULL,
    "max_score" SMALLINT NOT NULL,
    "source_url" VARCHAR(400) NOT NULL,

    CONSTRAINT "faculty_cutoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faculty_cutoffs_faculty_id_year_track_phase_key" ON "faculty_cutoffs"("faculty_id", "year", "track", "phase");

-- CreateIndex
CREATE INDEX "faculties_kind_id_is_active_idx" ON "faculties"("kind_id", "is_active");

-- CreateIndex
CREATE INDEX "faculties_university_id_is_active_idx" ON "faculties"("university_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_university_id_name_ar_key" ON "faculties"("university_id", "name_ar");

-- CreateIndex
CREATE INDEX "universities_type_is_active_idx" ON "universities"("type", "is_active");

-- AddForeignKey
ALTER TABLE "faculty_cutoffs" ADD CONSTRAINT "faculty_cutoffs_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sanity rules for the researched data.
ALTER TABLE "faculty_cutoffs" ADD CONSTRAINT "faculty_cutoffs_score_check" CHECK ("min_score" > 0 AND "min_score" <= "max_score");
ALTER TABLE "faculty_cutoffs" ADD CONSTRAINT "faculty_cutoffs_year_check" CHECK ("year" BETWEEN 2000 AND 2100);
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_accreditation_dates_check" CHECK ("accreditation_expires_at" IS NULL OR "accredited_at" IS NULL OR "accreditation_expires_at" >= "accredited_at");
