ALTER TABLE public.brand_profile
  ADD COLUMN IF NOT EXISTS brand_story text,
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS vision text,
  ADD COLUMN IF NOT EXISTS values_list text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vocabulary_use text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vocabulary_avoid text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand_promises text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_ctas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitive_positioning text;

ALTER TABLE public.audiences
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS business_context text,
  ADD COLUMN IF NOT EXISTS goals text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS buying_criteria text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS objections text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_authority text,
  ADD COLUMN IF NOT EXISTS preferred_content text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cta_preference text,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en+ar';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS architect text,
  ADD COLUMN IF NOT EXISTS developer text,
  ADD COLUMN IF NOT EXISTS collections text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS finishes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_facts text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_claims text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_tier integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS image_type text,
  ADD COLUMN IF NOT EXISTS angle text,
  ADD COLUMN IF NOT EXISTS finish text,
  ADD COLUMN IF NOT EXISTS background text,
  ADD COLUMN IF NOT EXISTS approved_for_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visual_notes text,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  claim_text_ar text,
  claim_type text NOT NULL DEFAULT 'technical',
  entity_type text NOT NULL DEFAULT 'product',
  entity_id uuid,
  entity_label text,
  source_type text NOT NULL DEFAULT 'official_documentation',
  source_id text,
  source_url text,
  source_tier integer NOT NULL DEFAULT 1,
  verified boolean NOT NULL DEFAULT false,
  confidence text NOT NULL DEFAULT 'medium',
  approved_for text[] NOT NULL DEFAULT '{}',
  forbidden_for text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  expires_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claims TO authenticated;
GRANT ALL ON public.claims TO service_role;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claims team access" ON public.claims FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS claims_updated ON public.claims;
CREATE TRIGGER claims_updated BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_claims_entity ON public.claims(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_claims_verified ON public.claims(verified);