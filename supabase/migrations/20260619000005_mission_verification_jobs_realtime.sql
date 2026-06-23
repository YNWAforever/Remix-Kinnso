-- Stream mission_verification_jobs changes to the browser so the
-- SubmissionVerification component's realtime path actually fires (mirrors
-- creator_scan_jobs in 20260614000013_creator_realtime.sql). Without this the
-- table is not a supabase_realtime publication member, so postgres_changes
-- events are never delivered and the feature falls back to its 2s poll.
-- Default replica identity (primary key) is sufficient for the id-filtered,
-- owner-select subscription; the poll remains the correctness backstop.
alter publication supabase_realtime add table public.mission_verification_jobs;
