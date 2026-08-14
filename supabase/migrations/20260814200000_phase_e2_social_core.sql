-- Phase E2 — Social Core.
-- TikTok and Telegram are first-class from this migration on: the schema, the
-- publish queue and the metrics shape all carry them before their API approvals
-- land, so switching them on later is a config change, not a refactor.

-- ---------------------------------------------------------------- channels

-- OAuth-based publishing destinations. Rows hold live access tokens, so the
-- table is NOT readable column-for-column by the dashboard: `authenticated`
-- gets a column-level SELECT grant that excludes every secret, and only
-- service_role (server routes, n8n callbacks) can read or write tokens.
-- Upgrade path for at-rest encryption is Supabase Vault — no schema change.
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'facebook', 'instagram', 'tiktok')),
  account_type TEXT NOT NULL DEFAULT 'business', -- page | business | organization | creator
  account_name TEXT NOT NULL,
  external_account_id TEXT NOT NULL, -- page id / ig user id / urn:li:organization: / open_id
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'expired', 'revoked', 'disconnected', 'pending_review')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_external
  ON public.social_accounts (platform, external_account_id);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT (
  id, platform, account_type, account_name, external_account_id,
  token_expires_at, scopes, status, metadata, created_at, updated_at
) ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_accounts TO service_role;
CREATE POLICY "social accounts readable by team" ON public.social_accounts
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER social_accounts_updated BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.social_accounts.access_token IS
  'Service-role only. Never granted to authenticated; never leaves the server.';

-- Operational integrations (Telegram bot, n8n, GPU worker). Deliberately a
-- separate table from social_accounts: these are not OAuth social identities
-- and do not share the token-refresh or publishing lifecycle.
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('telegram', 'n8n', 'worker', 'webhook')),
  name TEXT NOT NULL,
  external_id TEXT, -- telegram chat_id, n8n workflow id, worker id
  secret TEXT,      -- bot token / shared secret
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_kind_name ON public.integrations (kind, name);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, kind, name, external_id, config, status, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
CREATE POLICY "integrations readable by team" ON public.integrations
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER integrations_updated BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------- posts

-- `published_url` already exists from the first migration and stays the canonical
-- public link — no second URL column. What was missing is the platform's own id
-- (without it the analytics collector can never find the post again) and the
-- retry bookkeeping n8n needs to be safely re-runnable.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.social_accounts ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creative_asset_id UUID REFERENCES public.creative_assets ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT,
  ADD COLUMN IF NOT EXISTS publish_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_publish_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_error TEXT;

-- status lifecycle: draft → reviewed → ai_approved → approved → publishing → published
--                                                              └→ failed (publish_error set)
COMMENT ON COLUMN public.posts.status IS
  'draft | reviewed | ai_approved | approved | publishing | published | failed';

-- One row per real platform post: makes the publisher idempotent, so an n8n
-- retry after a timeout cannot create a duplicate post on the channel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_platform_post
  ON public.posts (platform, platform_post_id)
  WHERE platform_post_id IS NOT NULL;

-- The publish queue n8n polls. Partial index keeps it cheap as `posts` grows.
CREATE INDEX IF NOT EXISTS idx_posts_publish_queue
  ON public.posts (status, scheduled_at)
  WHERE status IN ('approved', 'publishing');

-- ---------------------------------------------------------------- analytics

-- Canonical metrics as columns (comparable across every channel) plus
-- raw_metrics for whatever a single platform reports and nobody else does —
-- TikTok's watch-time breakdown, LinkedIn's demographics, IG's navigation taps.
ALTER TABLE public.post_analytics
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reach INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_views INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_time_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_rate NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS engagement_rate NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS followers_gained INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_visits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.post_analytics a
SET platform = p.platform
FROM public.posts p
WHERE a.post_id = p.id AND a.platform IS NULL;

-- Collection runs at +24h/+48h/+72h and may be retried; one snapshot per post
-- per day makes the collector an upsert instead of an append.
DELETE FROM public.post_analytics a
USING public.post_analytics b
WHERE a.post_id = b.post_id AND a.measured_on = b.measured_on AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_post_day
  ON public.post_analytics (post_id, measured_on);
CREATE INDEX IF NOT EXISTS idx_analytics_platform ON public.post_analytics (platform, measured_on DESC);
