-- utility
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by team" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- brand profile
CREATE TABLE public.brand_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  tagline TEXT,
  positioning TEXT,
  tone_of_voice TEXT,
  key_messages TEXT[] NOT NULL DEFAULT '{}',
  forbidden TEXT[] NOT NULL DEFAULT '{}',
  website TEXT,
  contact_email TEXT,
  markets TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_profile TO authenticated;
GRANT ALL ON public.brand_profile TO service_role;
ALTER TABLE public.brand_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand team access" ON public.brand_profile FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER brand_profile_updated BEFORE UPDATE ON public.brand_profile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  description_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories team access" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  sku TEXT,
  category_id UUID REFERENCES public.categories ON DELETE SET NULL,
  description TEXT,
  description_ar TEXT,
  materials TEXT,
  finishes TEXT[] NOT NULL DEFAULT '{}',
  features TEXT[] NOT NULL DEFAULT '{}',
  price_egp NUMERIC,
  product_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products team access" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- product images
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product images team access" ON public.product_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audiences
CREATE TABLE public.audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  pain_points TEXT[] NOT NULL DEFAULT '{}',
  motivations TEXT[] NOT NULL DEFAULT '{}',
  channels TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiences TO authenticated;
GRANT ALL ON public.audiences TO service_role;
ALTER TABLE public.audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audiences team access" ON public.audiences FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER audiences_updated BEFORE UPDATE ON public.audiences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  country TEXT,
  description TEXT,
  image_url TEXT,
  products_used TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects team access" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- content ideas
CREATE TABLE public.content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  topic_ar TEXT,
  goal TEXT NOT NULL DEFAULT 'awareness',
  angle TEXT,
  research_notes TEXT,
  product_id UUID REFERENCES public.products ON DELETE SET NULL,
  audience_id UUID REFERENCES public.audiences ON DELETE SET NULL,
  planned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_ideas TO authenticated;
GRANT ALL ON public.content_ideas TO service_role;
ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ideas team access" ON public.content_ideas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER ideas_updated BEFORE UPDATE ON public.content_ideas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- posts
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES public.content_ideas ON DELETE CASCADE,
  platform TEXT NOT NULL,
  body_en TEXT,
  body_ar TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  image_prompt TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  review_score INT,
  review_notes TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts team access" ON public.posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER posts_updated BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- analytics
CREATE TABLE public.post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  measured_on DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions INT NOT NULL DEFAULT 0,
  engagements INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  leads INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_analytics TO authenticated;
GRANT ALL ON public.post_analytics TO service_role;
ALTER TABLE public.post_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics team access" ON public.post_analytics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- agent runs
CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  input JSONB,
  output JSONB,
  error TEXT,
  duration_ms INT,
  idea_id UUID REFERENCES public.content_ideas ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent runs team access" ON public.agent_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- seed
INSERT INTO public.brand_profile (brand_name, tagline, positioning, tone_of_voice, key_messages, forbidden, website, contact_email, markets, languages) VALUES (
 'Steinheim Egypt',
 'Water, designed.',
 'Premium German bathroom systems for homes, hospitality, and design-led projects in Egypt. Exclusive distributor: El Sharbatly International Group.',
 'Calm, precise, architectural and understated. Speaks to specifiers and design-led buyers. Confident without hype, never salesy or emoji-heavy.',
 ARRAY['German engineering and long-term reliability','Proportion, finish and mechanism working as one language','Specified for villas, hospitality and design-led developments','Complete collections, not single fixtures','Trade support and project specification in Egypt'],
 ARRAY['No discount-driven or hype language','No emojis in LinkedIn copy','No unverified technical claims or invented certifications','No competitor names','No pricing promises without approval'],
 'https://steinheim-eg.com','inquiries@steinheim-eg.com',
 ARRAY['Egypt','GCC'], ARRAY['en','ar']
);

INSERT INTO public.categories (name, name_ar, slug, description, description_ar) VALUES
 ('Joy','جوي','joy','Soft balance for private villas, suites, and warm hospitality rooms.','توازن ناعم للفيلات الخاصة والأجنحة وغرف الضيافة الدافئة.'),
 ('Up','أب','up','A repeatable modern language for developments and project schedules.','لغة عصرية قابلة للتكرار في المشاريع والتطويرات العقارية.'),
 ('Art','آرت','art','Architectural precision for statement bathrooms and design-led spaces.','دقة معمارية للحمامات المميزة والمساحات ذات الطابع التصميمي.'),
 ('Quatro','كواترو','quatro','Crisp geometry for sharp, contemporary interiors.','هندسة حادة للديكورات المعاصرة.');

INSERT INTO public.products (name, name_ar, sku, category_id, description, description_ar, materials, finishes, features, product_url)
SELECT v.name, v.name_ar, v.sku, c.id, v.description, v.description_ar, v.materials, v.finishes, v.features, 'https://steinheim-eg.com'
FROM (VALUES
 ('Joy Basin Mixer','خلاط حوض جوي','JOY-BM-01','joy','Single-lever basin mixer with a soft, rounded silhouette for warm residential bathrooms.','خلاط حوض بذراع واحد بتصميم ناعم للحمامات السكنية الدافئة.','Solid brass body, ceramic cartridge',ARRAY['Chrome','Brushed Gold','Matt Black'],ARRAY['35mm ceramic cartridge','Water-saving aerator','Smooth single-lever control']),
 ('Joy Shower Set','طقم دش جوي','JOY-SH-02','joy','Complete exposed shower set with overhead and hand shower.','طقم دش ظاهر متكامل مع دش علوي ودش يدوي.','Brass and stainless steel',ARRAY['Chrome','Brushed Gold'],ARRAY['Anti-limescale nozzles','Thermostatic option','Adjustable riser']),
 ('Up Concealed Mixer','خلاط أب المخفي','UP-CM-03','up','Concealed wall mixer built for repeatable project specification.','خلاط حائط مخفي مصمم للمواصفات المتكررة في المشاريع.','Brass body with concealed valve',ARRAY['Chrome','Matt Black'],ARRAY['Standardised rough-in','Serviceable cartridge','Project-friendly lead times']),
 ('Art Wall Basin Mixer','خلاط حوض آرت الحائطي','ART-WB-04','art','Wall-mounted basin mixer with architectural squared spout.','خلاط حوض حائطي بمخرج مربع بطابع معماري.','Solid brass',ARRAY['Brushed Nickel','Matt Black','Chrome'],ARRAY['Precision squared geometry','Concealed fixing','Long spout reach']),
 ('Quatro Bidet Mixer','خلاط بيديه كواترو','QTR-BD-05','quatro','Sharp geometric bidet mixer for contemporary interiors.','خلاط بيديه بتصميم هندسي حاد للديكورات المعاصرة.','Solid brass',ARRAY['Chrome','Matt Black'],ARRAY['Crisp edges','Ceramic cartridge','Swivel aerator'])
) AS v(name,name_ar,sku,slug,description,description_ar,materials,finishes,features)
JOIN public.categories c ON c.slug = v.slug;

INSERT INTO public.audiences (name, name_ar, description, pain_points, motivations, channels) VALUES
 ('Real estate developers','مطورون عقاريون','Developers specifying bathroom packages across large residential schedules.',ARRAY['Inconsistent supply across phases','Long lead times','Cost per unit pressure'],ARRAY['Repeatable specification','Reliable delivery','Perceived unit value'],ARRAY['LinkedIn','Email']),
 ('Hospitality operators','مشغلو الضيافة','Hotels and serviced residences needing durable, guest-facing fixtures.',ARRAY['High usage wear','Maintenance downtime','Brand consistency across rooms'],ARRAY['Durability','Serviceable parts','Guest experience'],ARRAY['LinkedIn','Email']),
 ('Interior designers','مصممون داخليون','Design-led studios specifying statement bathrooms.',ARRAY['Limited finish options locally','Poor product imagery','Slow sampling'],ARRAY['Finish range','Design coherence','Fast samples'],ARRAY['Instagram','LinkedIn']),
 ('Contractors','مقاولون','Contractors installing and coordinating bathroom packages.',ARRAY['Rough-in variability','Missing spare parts','Site coordination'],ARRAY['Standardised installation','Availability','Technical support'],ARRAY['Facebook','LinkedIn']),
 ('End consumers','مستهلك نهائي','Homeowners upgrading private villas and apartments.',ARRAY['Fear of low-quality copies','Confusing finish choices','After-sales worries'],ARRAY['Prestige','Warranty','Design harmony'],ARRAY['Instagram','Facebook']);

INSERT INTO public.projects (name, location, country, description) VALUES
 ('The 100, Meydan','Meydan, Dubai','UAE','Residential development referencing Steinheim bathroom systems.'),
 ('One Yard JVC Residences','Jumeirah Village Circle, Dubai','UAE','Residential tower with specified bathroom packages.'),
 ('Dubai Creek Residence by Park Hyatt','Dubai Creek, Dubai','UAE','Branded residences with hospitality-grade fixtures.'),
 ('Flamingo City','Sharjah','UAE','Large residential scheme with repeatable bathroom specification.');