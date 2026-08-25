-- Campaign rendering joins the jobs table.
--
-- One composite per finish plus a video cut from them runs for tens of seconds
-- and writes to storage. It gets the same treatment as the other long work: it
-- survives its caller, and two renders of the same product cannot overwrite
-- each other's files halfway through.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_kind_check
  CHECK (kind IN ('catalog_sync', 'daily_generation', 'campaign_render'));
