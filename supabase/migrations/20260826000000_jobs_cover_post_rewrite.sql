-- Rewriting held-back posts joins the jobs table.
--
-- One model call per post, so a set of four runs for minutes and must survive
-- the phone that asked for it. Single-active also matters here more than
-- elsewhere: two rewrites of the same post would race, and the loser's text
-- would overwrite the winner's after the gatekeeper had already judged it.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_kind_check
  CHECK (kind IN ('catalog_sync', 'daily_generation', 'campaign_render', 'plate_library', 'post_rewrite'));
