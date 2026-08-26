-- FOOTBASE — fixes a real bug found by club_fb_id_security.sql immediately after
-- 20260825000000_club_fb_id.sql: that migration backfilled fb_id for existing rows
-- and set it NOT NULL, but never gave the column a DEFAULT — so any brand-new
-- `clubes` insert going forward (including resolveClubForIngestion's own insert
-- path) would fail with "null value in column fb_id violates not-null constraint".
-- Caught before any real ingestion ran against it — no bad data written.
alter table clubes alter column fb_id set default nextval('clube_fb_id_seq');
