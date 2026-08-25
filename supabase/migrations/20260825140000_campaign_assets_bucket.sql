-- Somewhere to keep rendered campaign assets.
--
-- Public read on purpose: these are marketing images and a social platform has
-- to be able to fetch the URL without a token. Writes are service-role only —
-- the renderer runs on the worker, and nothing in the browser should be able to
-- put a file in the bucket a campaign publishes from.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-assets',
  'campaign-assets',
  true,
  52428800, -- 50MB: a 1080x1920 ten-second cut lands well under this
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "campaign assets are publicly readable" ON storage.objects;
CREATE POLICY "campaign assets are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'campaign-assets');

-- No INSERT/UPDATE/DELETE policy is defined for anon or authenticated, so
-- neither can write here at all. service_role bypasses RLS and is the only
-- writer, which is exactly the renderer.
