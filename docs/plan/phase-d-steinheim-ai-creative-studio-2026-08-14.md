# Phase D — Steinheim AI Creative Studio

طبقة إنتاج إبداعي فوق الـMarketing OS الحالي، بدون المساس بالـTruth Layer ولا الـGatekeeper. تشتغل من أول يوم على `CREATIVE_MODE=mock` (صفر AI credits)، وقابلة للتبديل إلى `local` (ComfyUI/GPU worker) أو `cloud` لاحقًا بدون تغيير الـUI أو الـDB.

## معمارية الطبقات

```text
APP      = Control Plane      (UI + Agents + Contracts)
SUPABASE = Truth + Assets     (schema + storage + RLS)
WORKER   = Generation Plane   (ComfyUI / GPU، عبر job queue)
n8n      = Automation Plane   (Phase E، لاحقًا)
```

التطبيق لا يشغّل توليد فيديو ثقيل. هو يكتب Job في قائمة انتظار، والـworker الخارجي يسحب الـjob ويرفع الناتج ويحدّث الحالة.

## D1 — قاعدة بيانات Creative Studio

جداول جديدة (كلها RLS + GRANT، مربوطة بالمستخدم):

- `campaigns` — اسم، هدف، منتج، جمهور، سوق، لغة، مدة، منصات، ميزانية، حالة.
- `creative_references` — مرجع إعلاني (رابط/صورة/فيديو/وصف) + `creative_dna` (JSON: hook, camera, lighting, color, editing, sound, reveal, CTA) + `improvement_notes`. لا يُخزَّن أي محتوى محمي، فقط تحليل بنيوي.
- `creative_concepts` — 3 concepts لكل campaign: عنوان، big idea، script_ar/en، emotional_trigger، حالة الاختيار.
- `storyboards` + `shots` — لكل shot: ترتيب، مدة، وصف بصري، prompt، camera، lens، lighting، movement، environment، product_id، audio_note، transition، حالة.
- `creative_assets` — ناتج توليد (image/video/voice/sfx/music/master/cut) مربوط بـshot أو campaign، مع `storage_path`, `model_used`, `mode`, `meta`.
- `generation_jobs` — طابور: `kind` (image/i2v/tts/sfx/edit)، `payload`، `status` (queued/running/done/failed)، `worker_id`، `result_asset_id`، `error`.
- `creative_reviews` — تقييم الـCreative Gatekeeper (16 محور) + `ai_artifact_score` + band + hard_fail_reasons.
- `ad_variants` — نسخ المنصات (30s/15s/10s/6s/story/carousel/static/B2B) + نصوص الإعلان.
- Storage bucket خاص `creative-assets` (private + signed URLs).

## D2 — الوكلاء (امتداد للـpipeline الحالي)

كلهم في `src/lib/creative/*` ويعيدون مخرجات مُتحقَّقة بـZod، ويرثون `FACT_DISCIPLINE` + `INJECTION_DEFENSE` + Claim Registry:

1. **Creative Director** — يبني Campaign Brief من المنتج + الجمهور + الحقائق المعتمدة.
2. **Reference Analyst** — يستخرج Creative DNA من المرجع ويقترح تحسينًا؛ ممنوع النسخ (قاعدة صريحة في الـsystem prompt: inspiration extraction, not replication).
3. **Creative Strategist** — 3–4 concepts متمايزة (Detail / Architecture of Water / Delayed Reveal / Provocative).
4. **Storyboard Agent** — يحوّل الـconcept إلى shot list زمنية مضبوطة على المدة المطلوبة.
5. **Product Truth Agent** — يحقن geometry/finish/mounting/صور المنتج الرسمية في كل prompt، ويرفض أي shot يخترع شكلًا جديدًا للمنتج.
6. **Model Router** — يقرر الـworkflow لكل shot (hero image / macro / I2V / cinematic) ويختار النموذج حسب `CREATIVE_MODE`.
7. **Voice + Sound Agents** — سكربت صوتي (مصري/فصحى/إنجليزي) و SFX/music brief.
8. **Editor Agent** — يبني EDL (ترتيب، مدد، انتقالات، مزج صوت) كـJSON يستهلكه FFmpeg في الـworker.
9. **Creative Gatekeeper + Anti-AI-Cringe Validator** — 16 محور + `ai_artifact_score`؛ أقل من العتبة ⇒ `regenerate shot` لا إعادة الإعلان كله.

## D3 — عقد الـWorker (API Contracts)

- `POST /api/public/creative/claim` — worker يسحب job (بمفتاح سري + توقيع).
- `POST /api/public/creative/complete` — يرفع الناتج ويحدّث `generation_jobs` و`creative_assets`.
- في `mock` mode: التطبيق يولّد placeholder assets فورًا ويكمل الـpipeline كاملة بدون GPU وبدون AI credits.

## D4 — صفحة `/creative`

- **Campaign form**: اسم، هدف، منتج (من Truth Layer)، جمهور (A–F)، سوق، لغة، مدة، منصات، ميزانية.
- **Reference panel**: رابط/رفع صورة/وصف ⇒ عرض Creative DNA المستخرج.
- **Direction chips**: Luxury / Cinematic / Architectural / Emotional / Provocative / Minimal / Technical / Lifestyle.
- **Concepts**: 3 كروت، اختيار واحد.
- **Storyboard**: شبكة Shots، كل shot يعرض الصورة + المعطيات + زر `Regenerate Shot` مستقل.
- **أزرار الإجراءات**: `Make It More Cinematic` / `Make It More Egyptian` / `Create Global Version` / `Create Ad Variations` — كلها تعدّل الإخراج الإبداعي فقط ولا تلمس Product Truth.
- **Review panel**: نتيجة الـCreative Gatekeeper + AI Artifact Score + PASS / REVISION / HARD FAIL، ثم Human Approval (نفس فصل AI/Human الحالي).

## Acceptance criteria

1. campaign كاملة تعمل end-to-end في `mock` mode بدون أي استهلاك credits.
2. صفر unverified claims في أي script أو caption (نفس مقياس الـTruth Layer).
3. كل shot يحمل مرجع منتج رسمي؛ لا يوجد prompt بدون geometry/finish.
4. `Regenerate Shot` يغيّر shot واحد فقط ويحتفظ بباقي الـstoryboard.
5. Gatekeeper يرفض (hard fail) أي ادعاء ممنوع أو تشوّه هندسي للمنتج.
6. تبديل `CREATIVE_MODE` من mock إلى local لا يتطلب تعديل UI أو DB.
7. لا يوجد نشر بدون Human Approval.

## ترتيب التنفيذ

D1 (DB + storage + RLS) ⇒ D2 (Director/Reference/Strategist) ⇒ D4 (صفحة Creative Studio على mock) ⇒ D3 (Storyboard + job queue) ⇒ Image/Video/Voice/Sound ⇒ Editor ⇒ Gatekeeper ⇒ Platform Adaptation + Variants ⇒ Phase E (n8n).

أبدأ بـ D1 + D2 + D4 في أول دفعة حتى ترى الـstudio شغّالة كاملة على mock، ثم نوصّل الـworker.
