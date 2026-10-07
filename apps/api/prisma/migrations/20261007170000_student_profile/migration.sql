-- Phase 08: student profile. School year is 1–3 (first to third secondary); scores are never stored.
ALTER TABLE "students"
  ADD CONSTRAINT "students_school_year_check" CHECK ("school_year" IS NULL OR "school_year" BETWEEN 1 AND 3);

-- A name, once set, is never blank.
ALTER TABLE "users"
  ADD CONSTRAINT "users_full_name_check" CHECK ("full_name" IS NULL OR char_length(btrim("full_name")) >= 2);
