-- Phase E6 — Automation API ledger.
-- One row per authenticated automation request. It carries three jobs at once:
-- replay protection (unique nonce), idempotency (cached response per key) and
-- the counter the rate limiter reads.

CREATE TABLE IF NOT EXISTS public.automation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  nonce TEXT NOT NULL,
  idempotency_key TEXT,
  status_code INT,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- A replayed request reuses its nonce; the unique index is what rejects it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_requests_nonce
  ON public.automation_requests (nonce);

-- A retry reuses its idempotency key with a fresh nonce, and gets the first
-- attempt's stored response instead of running the work twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_requests_idempotency
  ON public.automation_requests (endpoint, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fixed-window rate limiting reads this.
CREATE INDEX IF NOT EXISTS idx_automation_requests_window
  ON public.automation_requests (endpoint, created_at DESC);

-- No grants to `authenticated`: this table is only ever touched by server routes
-- running as service_role, and it records caller behaviour, not app data.
ALTER TABLE public.automation_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.automation_requests TO service_role;

COMMENT ON TABLE public.automation_requests IS
  'Automation API ledger: replay protection, idempotency cache and rate-limit window. Never stores secrets.';
