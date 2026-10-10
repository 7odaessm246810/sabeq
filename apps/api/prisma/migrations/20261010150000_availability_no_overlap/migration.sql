-- Phase 14: a mentor's weekly hours never overlap on the same weekday.
-- weekday: 0 = Sunday … 6 = Saturday (JavaScript getDay / PostgreSQL DOW); minutes are Cairo time.
ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_no_overlap"
  EXCLUDE USING gist (
    "mentor_id" WITH =,
    "weekday" WITH =,
    int4range("start_minute", "end_minute") WITH &&
  );
