-- The daily generation joins the jobs table.
--
-- Catalogue sync moved out of the request in phase C; generation did not, and
-- it has the same two problems in a sharper form. It runs for minutes, so a
-- client that goes away takes the run with it — observed directly: a curl
-- killed mid-run aborted a generation that had already survived a provider
-- failover and was writing. And nothing stopped two runs overlapping, which for
-- generation is worse than for sync: two pipelines writing the same day's
-- content produce two ideas that each think they are the day's idea.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('catalog_sync', 'daily_generation', 'campaign_render'));

-- The single-active index is already per-kind, so a generation and a sync can
-- still run at the same time. That is intended: they touch different tables and
-- the daily cycle reads a catalogue that was synced hours earlier.
COMMENT ON CONSTRAINT jobs_kind_check ON public.jobs IS
  'Long-running work that must survive its caller and never run twice at once.';
