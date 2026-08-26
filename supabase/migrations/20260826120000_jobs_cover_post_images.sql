-- Lets the runner track post image rendering.
--
-- Its own kind rather than reusing campaign_render, because the single-flight
-- index is per kind: sharing one would mean a manually requested campaign and
-- the daily run's post images locking each other out for no reason.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_kind_check
  CHECK (kind IN ('catalog_sync', 'daily_generation', 'campaign_render', 'plate_library', 'post_rewrite', 'post_images'));

COMMENT ON CONSTRAINT jobs_kind_check ON public.jobs IS
  'Every long operation the runner knows how to execute. Adding a kind here without a handler produces a job that never starts, so the two are changed together.';
