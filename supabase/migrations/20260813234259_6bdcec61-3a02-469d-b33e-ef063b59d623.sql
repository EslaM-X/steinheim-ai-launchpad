ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS strategic_angle text,
  ADD COLUMN IF NOT EXISTS content_fingerprint text,
  ADD COLUMN IF NOT EXISTS fingerprint_terms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS similarity_score numeric;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS penalties jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_score integer,
  ADD COLUMN IF NOT EXISTS score_band text;

CREATE INDEX IF NOT EXISTS idx_content_ideas_fingerprint ON public.content_ideas (content_fingerprint);