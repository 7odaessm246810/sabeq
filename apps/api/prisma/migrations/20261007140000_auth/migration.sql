-- Phase 07: phone + OTP login.

-- A new account exists right after the first OTP; the name is filled in the profile step.
ALTER TABLE "users" ALTER COLUMN "full_name" DROP NOT NULL;

-- Sessions are opaque tokens (no separate refresh token): rename and narrow to a SHA-256 hex digest.
ALTER TABLE "auth_sessions" RENAME COLUMN "refresh_token_hash" TO "token_hash";
ALTER TABLE "auth_sessions" ALTER COLUMN "token_hash" TYPE VARCHAR(64);
ALTER INDEX "auth_sessions_refresh_token_hash_key" RENAME TO "auth_sessions_token_hash_key";

-- Hot path: list / revoke a user's live sessions.
CREATE INDEX "auth_sessions_user_id_live_idx" ON "auth_sessions" ("user_id") WHERE "revoked_at" IS NULL;
