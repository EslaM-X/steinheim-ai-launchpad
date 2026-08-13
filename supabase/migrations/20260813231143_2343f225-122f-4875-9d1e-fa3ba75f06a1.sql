ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS official_name text,
  ADD COLUMN IF NOT EXISTS technical_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS installation_type text,
  ADD COLUMN IF NOT EXISTS approved_claims text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forbidden_claims text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS content_format text,
  ADD COLUMN IF NOT EXISTS funnel_stage text;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS review_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS hard_fail boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accuracy_report jsonb;

CREATE INDEX IF NOT EXISTS idx_products_verification ON public.products (verification_status);
CREATE INDEX IF NOT EXISTS idx_ideas_content_type ON public.content_ideas (content_type);