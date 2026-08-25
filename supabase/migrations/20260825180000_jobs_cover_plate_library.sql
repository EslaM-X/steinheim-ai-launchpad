-- Plate building joins the jobs table.
--
-- It walks the whole catalogue, fetches a photograph per product and writes one
-- file per finish, so it runs for minutes and must not be started twice at
-- once: two builds writing the same paths would interleave and leave a set half
-- from each run.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_kind_check
  CHECK (kind IN ('catalog_sync', 'daily_generation', 'campaign_render', 'plate_library'));
