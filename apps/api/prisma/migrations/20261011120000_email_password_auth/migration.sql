-- ADR-0017: sign in with email + password or Google; the phone becomes an optional contact field.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "password_hash" VARCHAR(200);
ALTER TABLE "users" ADD COLUMN "google_sub" VARCHAR(255);
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- Emails are the login: one spelling per address (the API lowercases before saving).
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
