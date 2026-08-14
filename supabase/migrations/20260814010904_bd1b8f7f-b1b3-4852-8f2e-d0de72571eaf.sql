CREATE POLICY "creative assets read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'creative-assets');
CREATE POLICY "creative assets insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'creative-assets');
CREATE POLICY "creative assets update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'creative-assets') WITH CHECK (bucket_id = 'creative-assets');
CREATE POLICY "creative assets delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'creative-assets');