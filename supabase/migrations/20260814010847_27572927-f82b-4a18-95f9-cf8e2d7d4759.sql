-- CAMPAIGNS
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text NOT NULL DEFAULT 'sales_awareness',
  market text NOT NULL DEFAULT 'Egypt',
  language text NOT NULL DEFAULT 'ar-EG',
  duration_seconds integer NOT NULL DEFAULT 30,
  platforms text[] NOT NULL DEFAULT '{}',
  budget_egp numeric,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  audience_id uuid REFERENCES public.audiences(id) ON DELETE SET NULL,
  audience_segment text,
  directions text[] NOT NULL DEFAULT '{}',
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'mock',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns team access" ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CREATIVE REFERENCES
CREATE TABLE public.creative_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'description',
  source_url text,
  storage_path text,
  notes text,
  creative_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  improvement_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_references TO authenticated;
GRANT ALL ON public.creative_references TO service_role;
ALTER TABLE public.creative_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative refs team access" ON public.creative_references FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER creative_references_updated BEFORE UPDATE ON public.creative_references FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONCEPTS
CREATE TABLE public.creative_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  slot integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  big_idea text NOT NULL,
  hook text,
  script_ar text,
  script_en text,
  emotional_trigger text,
  visual_language text,
  why_it_works text,
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_concepts TO authenticated;
GRANT ALL ON public.creative_concepts TO service_role;
ALTER TABLE public.creative_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concepts team access" ON public.creative_concepts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER creative_concepts_updated BEFORE UPDATE ON public.creative_concepts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STORYBOARDS
CREATE TABLE public.storyboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.creative_concepts(id) ON DELETE SET NULL,
  total_seconds integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'draft',
  edl jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storyboards TO authenticated;
GRANT ALL ON public.storyboards TO service_role;
ALTER TABLE public.storyboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "storyboards team access" ON public.storyboards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER storyboards_updated BEFORE UPDATE ON public.storyboards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SHOTS
CREATE TABLE public.shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyboard_id uuid NOT NULL REFERENCES public.storyboards(id) ON DELETE CASCADE,
  shot_number integer NOT NULL DEFAULT 1,
  start_second numeric NOT NULL DEFAULT 0,
  duration_seconds numeric NOT NULL DEFAULT 2,
  visual text NOT NULL,
  prompt text NOT NULL,
  camera text,
  lens text,
  lighting text,
  movement text,
  environment text,
  transition text,
  audio_note text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_reference_image uuid REFERENCES public.product_images(id) ON DELETE SET NULL,
  workflow text NOT NULL DEFAULT 'image',
  status text NOT NULL DEFAULT 'pending',
  image_asset_id uuid,
  video_asset_id uuid,
  ai_artifact_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shots TO authenticated;
GRANT ALL ON public.shots TO service_role;
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shots team access" ON public.shots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER shots_updated BEFORE UPDATE ON public.shots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ASSETS
CREATE TABLE public.creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.shots(id) ON DELETE CASCADE,
  asset_type text NOT NULL DEFAULT 'image',
  storage_path text,
  external_url text,
  model_used text,
  mode text NOT NULL DEFAULT 'mock',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_assets TO authenticated;
GRANT ALL ON public.creative_assets TO service_role;
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative assets team access" ON public.creative_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER creative_assets_updated BEFORE UPDATE ON public.creative_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shots ADD CONSTRAINT shots_image_asset_fkey FOREIGN KEY (image_asset_id) REFERENCES public.creative_assets(id) ON DELETE SET NULL;
ALTER TABLE public.shots ADD CONSTRAINT shots_video_asset_fkey FOREIGN KEY (video_asset_id) REFERENCES public.creative_assets(id) ON DELETE SET NULL;

-- GENERATION JOBS
CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.shots(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'image',
  mode text NOT NULL DEFAULT 'mock',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  worker_id text,
  attempts integer NOT NULL DEFAULT 0,
  result_asset_id uuid REFERENCES public.creative_assets(id) ON DELETE SET NULL,
  error text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_jobs TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generation jobs team access" ON public.generation_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER generation_jobs_updated BEFORE UPDATE ON public.generation_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CREATIVE REVIEWS
CREATE TABLE public.creative_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.shots(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'campaign',
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_artifact_score integer,
  raw_score integer,
  final_score integer,
  band text,
  penalties jsonb NOT NULL DEFAULT '[]'::jsonb,
  hard_fail boolean NOT NULL DEFAULT false,
  hard_fail_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  ai_approved boolean NOT NULL DEFAULT false,
  human_approved_by uuid,
  human_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_reviews TO authenticated;
GRANT ALL ON public.creative_reviews TO service_role;
ALTER TABLE public.creative_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative reviews team access" ON public.creative_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER creative_reviews_updated BEFORE UPDATE ON public.creative_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AD VARIANTS
CREATE TABLE public.ad_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  platform text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  duration_seconds integer,
  headline text,
  primary_text text,
  caption text,
  cta text,
  hashtags text[] NOT NULL DEFAULT '{}',
  asset_id uuid REFERENCES public.creative_assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_variants TO authenticated;
GRANT ALL ON public.ad_variants TO service_role;
ALTER TABLE public.ad_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad variants team access" ON public.ad_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER ad_variants_updated BEFORE UPDATE ON public.ad_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_creative_concepts_campaign ON public.creative_concepts(campaign_id);
CREATE INDEX idx_storyboards_campaign ON public.storyboards(campaign_id);
CREATE INDEX idx_shots_storyboard ON public.shots(storyboard_id, shot_number);
CREATE INDEX idx_creative_assets_campaign ON public.creative_assets(campaign_id);
CREATE INDEX idx_generation_jobs_status ON public.generation_jobs(status, created_at);
CREATE INDEX idx_ad_variants_campaign ON public.ad_variants(campaign_id);
CREATE INDEX idx_creative_refs_campaign ON public.creative_references(campaign_id);