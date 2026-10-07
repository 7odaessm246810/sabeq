-- Phase 09: mentor applications belong to the applicant (users), not to a mentor profile — the
-- profile is created from the approved application (Phase 10).
ALTER TABLE "mentor_applications" DROP CONSTRAINT "mentor_applications_mentor_id_fkey";
ALTER TABLE "mentor_applications" RENAME COLUMN "mentor_id" TO "user_id";
ALTER INDEX "mentor_applications_mentor_id_created_at_idx" RENAME TO "mentor_applications_user_id_created_at_idx";
ALTER TABLE "mentor_applications"
  ADD CONSTRAINT "mentor_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one application in progress per person (a rejected one may be followed by a new one).
CREATE UNIQUE INDEX "mentor_applications_one_open_per_user"
  ON "mentor_applications" ("user_id")
  WHERE "status" IN ('draft', 'submitted', 'under_review', 'changes_requested');

-- A submitted application always has a submission time; a decided one has a reviewer and time.
ALTER TABLE "mentor_applications" ADD CONSTRAINT "mentor_applications_submitted_check"
  CHECK ("status" = 'draft' OR "submitted_at" IS NOT NULL);
ALTER TABLE "mentor_applications" ADD CONSTRAINT "mentor_applications_decided_check"
  CHECK ("status" NOT IN ('approved', 'rejected') OR ("decided_at" IS NOT NULL AND "reviewer_id" IS NOT NULL));

-- One document per kind per application (re-upload replaces it); files stay ≤ 10 MB.
DROP INDEX "mentor_documents_application_id_idx";
CREATE UNIQUE INDEX "mentor_documents_application_id_kind_key" ON "mentor_documents" ("application_id", "kind");
ALTER TABLE "mentor_documents" ADD CONSTRAINT "mentor_documents_size_check"
  CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760);
