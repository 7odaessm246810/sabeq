-- Phase 19: the reminder before a session is sent once.
ALTER TABLE "bookings" ADD COLUMN "reminder_sent_at" TIMESTAMPTZ;

-- The reminder sweep looks for confirmed sessions starting soon that haven't been reminded.
CREATE INDEX "bookings_reminder_due_idx" ON "bookings" ("starts_at")
  WHERE "status" = 'confirmed' AND "reminder_sent_at" IS NULL;
