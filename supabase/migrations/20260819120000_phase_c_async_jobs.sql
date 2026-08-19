-- Phase C — long work stops living inside a request.
--
-- A catalogue sync opens one page per product and takes minutes; a generation
-- run was measured at 3m57s. Both currently occupy an HTTP request for their
-- whole duration, which works on a plain Node process and fails everywhere a
-- request has a ceiling — and it fails the user too: closing the tab kills the
-- work, and a reload has no way to find out whether it finished.
--
-- So the request stops being the unit of work. It creates a row here and
-- returns; the worker writes progress into that row; the browser reads it.

CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('catalog_sync')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'interrupted')),

  -- What the job is doing right now, in words a person can read. The pair of
  -- counters is what turns "Processing" into "18 of 26".
  phase TEXT,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER,

  result JSONB,
  error TEXT,

  requested_by UUID REFERENCES auth.users ON DELETE SET NULL,
  -- Null for a scheduled run. The distinction matters when reading history:
  -- a failed 04:00 sync and a failed sync someone was watching are different
  -- events.
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'scheduled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  -- A worker that dies mid-run cannot mark itself failed. It can only stop
  -- writing. This column is how that silence becomes visible: a 'running' row
  -- with an old heartbeat was killed, not stalled.
  heartbeat_at TIMESTAMPTZ
);

-- One sync at a time. Without this, a second click starts a competing pass
-- over the same catalogue and the two runs interleave their writes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_single_active
  ON public.jobs (kind)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_jobs_recent ON public.jobs (kind, created_at DESC);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobs FROM anon, authenticated;
GRANT SELECT (id, kind, status, phase, progress_done, progress_total, result, error,
              requested_by, trigger, created_at, started_at, finished_at, heartbeat_at)
  ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;

CREATE POLICY "jobs readable by team" ON public.jobs
  FOR SELECT TO authenticated USING (true);

COMMENT ON COLUMN public.jobs.heartbeat_at IS
  'Last sign of life from the worker. A running row whose heartbeat has gone stale belongs to a process that died.';
COMMENT ON INDEX public.idx_jobs_single_active IS
  'One active job per kind. A second request finds this index and is refused rather than racing the first.';

-- Marks jobs whose worker died as interrupted.
--
-- Called on boot and before a new job is accepted. Without it the unique index
-- above would block every future sync on behalf of a process that no longer
-- exists.
CREATE OR REPLACE FUNCTION public.reap_dead_jobs(stale_after INTERVAL DEFAULT INTERVAL '3 minutes')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reaped INTEGER;
BEGIN
  WITH dead AS (
    UPDATE public.jobs
       SET status = 'interrupted',
           finished_at = now(),
           error = COALESCE(error, 'The worker stopped reporting; the run was cut short.')
     WHERE status IN ('queued', 'running')
       AND COALESCE(heartbeat_at, started_at, created_at) < now() - stale_after
    RETURNING 1
  )
  SELECT count(*) INTO reaped FROM dead;
  RETURN reaped;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_dead_jobs(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_dead_jobs(INTERVAL) TO service_role;
