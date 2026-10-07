-- Extensions the schema relies on. Created first so later migrations can use them.
-- btree_gist: lets the bookings EXCLUSION constraint mix "=" (mentor_id) with "&&" (time ranges).
-- pg_trgm:    trigram indexes for Arabic/English fuzzy search on names and majors (Phase 13).
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
