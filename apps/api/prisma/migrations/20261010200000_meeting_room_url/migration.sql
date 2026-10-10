-- Phase 17: the video room address (joining still needs a per-person token).
ALTER TABLE "meetings" ADD COLUMN "room_url" VARCHAR(300);
