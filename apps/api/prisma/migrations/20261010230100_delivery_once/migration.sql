-- Phase 19: one delivery per notification per channel, so an email is never queued twice.
DROP INDEX "notification_deliveries_notification_id_idx";
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");
