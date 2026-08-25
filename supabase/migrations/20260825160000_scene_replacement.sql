-- Phase E: Scene Replacement Engine
-- Reference scenes, product replacements, and rendered results.

-- ============================================================
-- scene_references — uploaded or saved reference images
-- ============================================================
CREATE TABLE scene_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  scene_type TEXT,
  description TEXT,
  analysis JSONB,
  status TEXT DEFAULT 'pending' NOT NULL
    CHECK (status IN ('pending', 'analysed', 'in_use', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE scene_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scene_references_own" ON scene_references
  FOR ALL USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON scene_references TO authenticated;

-- ============================================================
-- scene_replacements — per-product match in a scene
-- ============================================================
CREATE TABLE scene_replacements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_ref_id UUID REFERENCES scene_references(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  detected_product JSONB NOT NULL,
  matched_product_id UUID REFERENCES products(id),
  matched_finish TEXT,
  position JSONB NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL
    CHECK (status IN ('pending', 'approved', 'rendered', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE scene_replacements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scene_replacements_own" ON scene_replacements
  FOR ALL USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON scene_replacements TO authenticated;

-- ============================================================
-- scene_results — rendered output images
-- ============================================================
CREATE TABLE scene_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_ref_id UUID REFERENCES scene_references(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  result_url TEXT,
  storage_path TEXT,
  format TEXT DEFAULT 'square' NOT NULL
    CHECK (format IN ('square', 'story', 'landscape')),
  product_count INTEGER DEFAULT 0 NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE scene_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scene_results_own" ON scene_results
  FOR ALL USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON scene_results TO authenticated;

-- Index for listing a user's scenes
CREATE INDEX idx_scene_references_user ON scene_references(user_id, created_at DESC);
CREATE INDEX idx_scene_replacements_ref ON scene_replacements(scene_ref_id);
CREATE INDEX idx_scene_results_ref ON scene_results(scene_ref_id);
