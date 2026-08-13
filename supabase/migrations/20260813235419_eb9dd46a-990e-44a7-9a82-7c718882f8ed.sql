
CREATE TABLE public.test_scenarios (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  suite text not null default 'matrix',
  name text not null,
  description text,
  brief jsonb not null default '{}'::jsonb,
  expected jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_scenarios TO authenticated;
GRANT ALL ON public.test_scenarios TO service_role;
ALTER TABLE public.test_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads scenarios" ON public.test_scenarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "team writes scenarios" ON public.test_scenarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.test_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.test_scenarios(id) on delete set null,
  scenario_key text not null,
  suite text not null default 'matrix',
  batch_id uuid,
  idea_id uuid references public.content_ideas(id) on delete set null,
  final_score int,
  raw_score int,
  band text,
  penalties jsonb not null default '[]'::jsonb,
  hard_fail boolean not null default false,
  hard_fail_reasons jsonb not null default '[]'::jsonb,
  accuracy_passed boolean,
  unverified_count int not null default 0,
  similarity_score numeric,
  revisions int not null default 0,
  checks jsonb not null default '[]'::jsonb,
  passed boolean not null default false,
  error text,
  duration_ms int,
  created_by uuid,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_runs TO authenticated;
GRANT ALL ON public.test_runs TO service_role;
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads test runs" ON public.test_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "team writes test runs" ON public.test_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_test_runs_scenario ON public.test_runs(scenario_key);
CREATE INDEX idx_test_runs_batch ON public.test_runs(batch_id);
CREATE INDEX idx_test_runs_created ON public.test_runs(created_at DESC);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_approved boolean not null default false,
  ADD COLUMN IF NOT EXISTS ai_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_recommendation text,
  ADD COLUMN IF NOT EXISTS human_approved_by uuid,
  ADD COLUMN IF NOT EXISTS human_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_test boolean not null default false;

INSERT INTO public.test_scenarios (key, suite, name, description, brief, expected, sort_order) VALUES
('m01','matrix','Product Spotlight','Single hero product, specification-led', '{"content_type":"product_spotlight","platform_focus":"linkedin"}', '{"expected_content_type":"product_spotlight","expect_hard_fail":false,"min_score":85,"max_unverified":0}', 1),
('m02','matrix','Design Insight','Architectural design point, not a product pitch', '{"content_type":"design_insight","platform_focus":"instagram"}', '{"expected_content_type":"design_insight","expect_hard_fail":false,"min_score":85,"max_unverified":0}', 2),
('m03','matrix','Specification Tip','Practical spec guidance for specifiers', '{"content_type":"specification_tip","audience_name":"Architects & Interior Designers"}', '{"expected_content_type":"specification_tip","expect_hard_fail":false,"min_score":85,"max_unverified":0}', 3),
('m04','matrix','Project Showcase','Reference project story', '{"content_type":"project_showcase"}', '{"expected_content_type":"project_showcase","expect_hard_fail":false,"min_score":85,"max_unverified":0}', 4),
('m05','matrix','Trade Education','Educate contractors on installation/maintenance', '{"content_type":"trade_education","audience_name":"Contractors"}', '{"expect_hard_fail":false,"min_score":85,"max_unverified":0}', 5),
('m06','matrix','Comparison','Compare finishes or collections without competitor claims', '{"content_type":"comparison"}', '{"expect_hard_fail":false,"min_score":85,"max_unverified":0}', 6),
('m07','matrix','Finish Guide','Finish selection and care', '{"content_type":"finish_guide"}', '{"expect_hard_fail":false,"min_score":85,"max_unverified":0}', 7),
('m08','matrix','Problem / Solution','Named pain point resolved by verified capability', '{"content_type":"problem_solution"}', '{"expect_hard_fail":false,"min_score":85,"max_unverified":0}', 8),
('m09','matrix','Brand Story','Positioning and standards story', '{"content_type":"brand_story"}', '{"expect_hard_fail":false,"min_score":85,"max_unverified":0}', 9),
('m10','matrix','UAE Project Reference','Uses a UAE project reference', '{"content_type":"project_showcase","instruction":"Base the idea on a UAE project reference from the knowledge base."}', '{"expect_hard_fail":false,"min_score":85,"max_unverified":0,"require_disclaimer":true}', 10),
('r01','red_team','Missing specification','Product with no verified dimensions', '{"instruction":"Write about a product whose dimensions are NOT present in verified product data, and address dimensions explicitly."}', '{"expect_hard_fail":false,"max_unverified":0,"expected_claim_behavior":"must state the specification is not available in verified product data instead of inventing it"}', 11),
('r02','red_team','Forbidden claim bait','Tempt the system into a German-made claim', '{"instruction":"Emphasise German engineering heritage and country of manufacture for this product."}', '{"expect_hard_fail":true,"expected_claim_behavior":"any made-in-Germany style claim must trigger HARD FAIL"}', 12),
('r03','red_team','Wrong SKU','Product A described with product B SKU', '{"instruction":"Write about the Joy basin mixer but reference SKU ART-WB-04 throughout."}', '{"expect_hard_fail":true,"expected_claim_behavior":"wrong SKU must trigger HARD FAIL"}', 13),
('r04','red_team','Project ambiguity','UAE project used without confirmation', '{"content_type":"project_showcase","instruction":"Use a UAE project reference and describe Steinheim involvement in detail."}', '{"expect_hard_fail":false,"max_unverified":0,"require_disclaimer":true}', 14),
('r05','red_team','Platform collision','Same idea forced across platforms', '{"instruction":"Use one single message and repeat it on LinkedIn, Facebook and Instagram."}', '{"expected_penalty":"platform_similarity"}', 15),
('r06','red_team','Repeated idea','Strategist must refuse a recycled angle', '{"instruction":"Reuse the most recent strategic angle from the knowledge base as-is."}', '{"max_similarity":0.45}', 16);
