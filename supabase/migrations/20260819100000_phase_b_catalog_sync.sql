-- Phase B — Catalog sync.
--
-- The official website becomes the source of truth. Nobody types a product
-- specification into this system again: the connector reads steinheim-eg.com,
-- and everything downstream reads what it wrote.
--
-- The columns below exist so a second sync can tell what actually changed. A
-- sync that cannot answer "did this product change?" has to re-import
-- everything every time, and re-importing is how a corrected price quietly
-- reverts to the old one.

CREATE TABLE IF NOT EXISTS public.catalog_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  -- Where the connector starts. Kept as data so a site restructure is a row
  -- edit rather than a deploy.
  catalog_path TEXT NOT NULL DEFAULT '/en/products',
  locale_paths JSONB NOT NULL DEFAULT '{"en": "/en", "ar": "/ar"}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_sources_name ON public.catalog_sources (name);

ALTER TABLE public.catalog_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_sources FROM anon, authenticated;
GRANT SELECT (id, name, base_url, catalog_path, status, last_sync_at, last_sync_status,
              last_sync_summary, created_at, updated_at)
  ON public.catalog_sources TO authenticated;
GRANT ALL ON public.catalog_sources TO service_role;
CREATE POLICY "catalog sources readable by team" ON public.catalog_sources
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER catalog_sources_updated BEFORE UPDATE ON public.catalog_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── products: what a sync needs to be idempotent ────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.catalog_sources ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_slug TEXT,
  -- Hash of the normalised payload. Unchanged hash means untouched product,
  -- which is what keeps a sync cheap and non-destructive.
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS availability TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  -- One row per product, many finishes, each with its own SKU and price.
  ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_slug
  ON public.products (source_slug)
  WHERE source_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_fingerprint ON public.products (content_fingerprint);

-- ── claims: mark what a machine extracted, and from which snapshot ──────────
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS extracted_by TEXT NOT NULL DEFAULT 'human',
  -- Ties a claim to the exact page state it came from. When the page changes,
  -- every claim carrying the old fingerprint is provably stale.
  ADD COLUMN IF NOT EXISTS source_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS evidence TEXT;

CREATE INDEX IF NOT EXISTS idx_claims_source_fingerprint
  ON public.claims (source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.claims.extracted_by IS
  'human | catalog_sync. A synced claim is only ever as true as the page it was read from.';
COMMENT ON COLUMN public.products.content_fingerprint IS
  'Hash of the normalised source payload; equal hashes mean the product did not change.';

INSERT INTO public.catalog_sources (name, base_url, catalog_path)
VALUES ('steinheim-official', 'https://steinheim-eg.com', '/en/products')
ON CONFLICT (name) DO NOTHING;
