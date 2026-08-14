-- Phase E3 — publish state machine.
--
-- The dangerous failure in any publisher is not a request that fails; it is a
-- request that SUCCEEDS while the caller never learns it did. Retrying that
-- posts the ad twice. So a publish attempt that ends without a definitive answer
-- does not become `failed` — it becomes `unknown`, and only reconciliation
-- against the platform may move it forward.
--
--   approved ──► publishing ──┬── confirmed ────────► published
--                             ├── definitive error ─► failed
--                             └── timeout/no answer ► unknown
--                                                       │
--                                              reconciliation
--                                          ┌─────────────┴─────────────┐
--                                     found on platform          not found
--                                          │                          │
--                                          ▼                          ▼
--                                      published                  approved  (safe retry)
--
-- `unknown` never transitions back to `publishing` on its own. That edge does
-- not exist, and this comment is why.

-- Reuses the existing `status` column rather than adding a second one.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reconcile_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
  -- Ties one publish attempt to the external publication it may have created,
  -- so reconciliation can ask the platform "did this key already go out?".
  ADD COLUMN IF NOT EXISTS publish_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_publish_idempotency
  ON public.posts (publish_idempotency_key)
  WHERE publish_idempotency_key IS NOT NULL;

-- Posts awaiting reconciliation — the queue the reconciler reads.
CREATE INDEX IF NOT EXISTS idx_posts_unknown
  ON public.posts (status, last_publish_attempt_at)
  WHERE status = 'unknown';

-- NOT VALID: enforce the vocabulary on every new write without re-validating
-- rows written before this migration.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_valid;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_valid CHECK (
    status IN (
      'draft',
      'reviewed',
      'ai_approved',
      'needs_revision',
      'approved',
      'publishing',
      'published',
      'unknown',
      'failed'
    )
  ) NOT VALID;

COMMENT ON COLUMN public.posts.status IS
  'draft | reviewed | ai_approved | needs_revision | approved | publishing | published | unknown | failed. '
  '`unknown` means the platform never confirmed — reconcile before any retry.';
COMMENT ON COLUMN public.posts.reconcile_attempts IS
  'How many times reconciliation has asked the platform about this post.';
