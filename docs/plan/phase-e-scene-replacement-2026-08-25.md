# Phase E — Scene Replacement Engine

استبدال المنتجات في مشاهد فاخرة بصور حقيقية. النظام يأخذ صورة مرجعية (مثل حمام فاخر من Pinterest) ويستبدل المنتجات اللي فيها (خلاطات، شاور، أكسسوارات) بمنتجات Steinheim الحقيقية — مع الإضاءة الصحيحة، الزاوية، واللون المتطابق.

## الفكرة

- **مجاني بالكامل** — Gemini Vision + Gemini Image Editing عبر OpenRouter (موجود بالفعل)
- **بدون GPU** — كل شيء على السيرفر
- **بدون scraping** — الصور تترجَّ يدويًا أو من أي مصدر
- **المنتج الحقيقي دائمًا** — AI لا يُنشئ منتجات، فقط يحلل المشهد ويعدّل الخلفية

## المعمارية

```
┌─────────────────────────────────────────────────────────┐
│  1. REFERENCE IMAGE (Pinterest / manual upload)         │
│     صورة حمام فاخر / فيلا / مشهد                       │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  2. SCENE ANALYSIS (Gemini Vision)                      │
│     - ما المنتجات الموجودة؟ (faucet, shower, accessories)│
│     - أين موقعها؟ (bounding box / position)             │
│     - ما اتجاه الإضاءة؟                                │
│     - ما لوحة الألوان؟                                  │
│     - ما نوع السطح؟ (marble, concrete, wood)            │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  3. PRODUCT MATCHING                                    │
│     - مطابقة كل منتج مكتشف مع كتالوج Steinheim         │
│     - اختيار أقرب منتج (by category + finish)           │
│     - العرض للمستخدم للموافقة                           │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  4. SCENE PREPARATION (Gemini Image Editing)            │
│     - إزالة المنتجات الأصلية (inpainting)               │
│     - تنظيف المشهد (بدون منتجات)                        │
│     - الحفاظ على الإضاءة والتفاصيل                      │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  5. PRODUCT INSERTION (sharp pipeline)                  │
│     - قص المنتج من خلفيته (cutout.ts)                   │
│     - تعديل الزاوية (perspective transform)             │
│     - تعديل الإضاءة حسب المشهد                          │
│     - إضافة reflection + shadow حسب نوع السطح            │
│     - تطبيق vignette + grain موحّد                      │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  6. OUTPUT                                              │
│     - صورة PNG عالية الجودة (1080px أو أكبر)           │
│     - فيديو MP4 (اختياري — حركة بطيئة عبر المشهد)      │
│     - رفع تلقائي على Supabase Storage                   │
└─────────────────────────────────────────────────────────┘
```

## E1 — قاعدة البيانات

جداول جديدة:

```sql
-- مراجع المشاهد (صور Pinterest أو يدوية)
CREATE TABLE scene_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  image_url TEXT NOT NULL,           -- رابط الصورة الأصلية
  storage_path TEXT,                 -- مسار محفوظ في Supabase Storage
  scene_type TEXT,                   -- bathroom, villa, kitchen, showroom
  description TEXT,                  -- وصف يدوي (اختياري)
  analysis JSONB,                   -- نتيجة Gemini Vision ( analysed at: products, lighting, surfaces, palette )
  status TEXT DEFAULT 'pending',     -- pending | analysed | in_use | archived
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- استبدال المنتجات في مشهد
CREATE TABLE scene_replacements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_ref_id UUID REFERENCES scene_references(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  detected_product JSONB,           -- ما اكتشفه AI في المشهد الأصلي
  matched_product_id UUID REFERENCES products(id), -- منتج Steinheim المطابق
  matched_finish TEXT,               -- الفينش المختار
  position JSONB,                   -- coordinates, scale, rotation
  status TEXT DEFAULT 'pending',     -- pending | approved | rendered | rejected
  created_at TIMESTAMPTZ DEFAULT now()
);

-- نتائج الاستبدال (الصور النهائية)
CREATE TABLE scene_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_ref_id UUID REFERENCES scene_references(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  result_url TEXT,                  -- رابط الصورة النهائية
  storage_path TEXT,
  format TEXT DEFAULT 'square',     -- square | story | landscape
  product_count INTEGER DEFAULT 0,  -- عدد المنتجات المستبدلة
  meta JSONB,                       -- timing, model_used, warnings
  created_at TIMESTAMPTZ DEFAULT now()
);
```

RLS policies:
- `scene_references`: user can only see/modify their own
- `scene_replacements`: user can only see/modify their own
- `scene_results`: user can only see/modify their own

## E2 — تحليل المشهد (Gemini Vision)

ملف جديد: `src/lib/creative/scene-analysis.server.ts`

```typescript
interface SceneAnalysis {
  scene_type: "bathroom" | "villa" | "kitchen" | "showroom" | "other";
  surfaces: {
    type: "marble" | "concrete" | "wood" | "tile" | "glass";
    color: string;          // hex
    reflectivity: "high" | "medium" | "low";
  }[];
  lighting: {
    direction: "left" | "right" | "top" | "ambient" | "mixed";
    temperature: "warm" | "cool" | "neutral";
    intensity: "bright" | "medium" | "dim";
  };
  detected_products: {
    category: "faucet" | "shower" | "accessory" | "basin" | "toilet" | "bathtub" | "other";
    description: string;     // "chrome wall-mounted faucet"
    position: { x: number; y: number; width: number; height: number }; // normalized 0-1
    finish: string;          // "chrome", "matte black", etc.
    confidence: number;      // 0-1
  }[];
  color_palette: string[];   // dominant hex colors
  mood: string;              // "luxury", "modern", "minimal", etc.
}
```

الاستدعاء:
```typescript
// يستخدم Gemini Vision عبر OpenRouter (موجود بالفعل)
const analysis = await genObject({
  system: SCENE_ANALYSIS_PROMPT,
  prompt: "Analyze this bathroom/interior scene...",
  schema: SceneAnalysisSchema,
  images: [sceneImageUrl],  // ← ميزة جديدة: إرسال صورة كـvision input
});
```

**التعديل المطلوب في `agents.server.ts`**:
- إضافة ميزة `images?: string[]` إلى `genObject()` و `genText()`
- استخدام Vercel AI SDK's multimodal content format:
  ```typescript
  content: [
    { type: "image", image: imageUrl },
    { type: "text", text: prompt }
  ]
  ```

## E3 — إزالة المنتجات (Gemini Image Editing)

ملف جديد: `src/lib/creative/scene-inpaint.server.ts`

```typescript
async function removeProductFromScene(
  sceneImageUrl: string,
  productPosition: { x: number; y: number; width: number; height: number },
  instructions: string,
): Promise<Buffer> {
  // يستخدم Gemini 3.1 Flash Image عبر OpenRouter
  // إرسال الصورة + تعليمات "remove the faucet at this position"
  // الناتج: الصورة بدون المنتج
}
```

**ملاحظة مهمة**: Gemini Image Editing عبر chat/completions:
```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "google/gemini-3.1-flash-image",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: sceneImageUrl } },
        { type: "text", text: "Remove the faucet shown at position [x,y,w,h] and fill the area with the surrounding marble surface. Keep the wall and all other elements intact." }
      ]
    }],
    modalities: ["image", "text"]
  })
});
```

**التدفق**:
1. لكل منتج مكتشف في المشهد:
   - إرسال الصورة + instructions لإزالة المنتج
   - الانتظار للناتج
   - استخدام الناتج كـinput للم@JsonProperty التالية
2. الناتج النهائي: صورة المشهد بدون أي منتجات أصلية

## E4 — إدراج المنتجات (تعزيز compose.ts)

ملف معدّل: `src/lib/creative/render/compose.ts`

التعزيزات المطلوبة:

### 4a. زاوية المشهد (Perspective)
```typescript
interface PerspectiveTransform {
  rotateX: number;  // ميلان أمامي (-30 إلى +30)
  rotateY: number;  // ميلان جانبي (-30 إلى +30)
  scale: number;    // حجم نسبي
}
```
- حساب الزاوية من تحليل المشهد
- تطبيق `sharp` perspective transform
- حساب موقع الإسقاط على السطح

### 4b. إضاءة المشهد (Scene-Aware Lighting)
```typescript
interface SceneLighting {
  direction: "left" | "right" | "top" | "ambient";
  temperature: "warm" | "cool" | "neutral";
  intensity: number; // 0-1
}
```
- تعديل `rim light` حسب اتجاه إضاءة المشهد
- تعديل `reflection` حسب نوع السطح (marble = high reflectivity, concrete = low)
- تعديل `shadow` حسب شدة الإضاءة

### 4c. مطابقة السطح (Surface Matching)
```typescript
function calculateSurfaceReflection(
  surfaceType: "marble" | "concrete" | "wood" | "tile" | "glass",
  reflectivity: "high" | "medium" | "low",
): { blur: number; strength: number; extent: number } {
  // marble: blur=2, strength=0.4, extent=0.5
  // concrete: blur=5, strength=0.15, extent=0.3
  // wood: blur=4, strength=0.2, extent=0.35
  // tile: blur=2.5, strength=0.35, extent=0.45
  // glass: blur=1, strength=0.6, extent=0.6
}
```

### 4d. تعدد المنتجات (Multi-Product)
```typescript
interface MultiProductRequest {
  sceneRefId: string;
  replacements: {
    detectedProduct: DetectedProduct;
    matchedProductId: string;
    matchedFinish: string;
  }[];
  format: "square" | "story" | "landscape";
  outputQuality: "standard" | "high";
}
```
- تنفيذ كل استبدال بالتتابع
- كل منتج يُضاف كـlayer في التجميع
- ترتيب الـlayers حسب الـdepth (الخلف أولاً)

## E5 — الواجهة

صفحة جديدة: `/scenes`

### الخطوة 1: رفع صورة مرجعية
- Drag & drop أو upload
- أو إدخال رابط (Pinterest, Instagram, أي موقع)
- AI يحلل الصورة تلقائيًا

### الخطوة 2: معاينة التحليل
- عرض المنتجات المكتشفة (boxes على الصورة)
- عرض معلومات السطح والإضاءة
- زر "Match Products" للمرور للخطوة التالية

### الخطوة 3: مطابقة المنتجات
- لكل منتج مكتشف:
  - عرض الصورة الأصلية (المكتشفة)
  - عرض المنتج المقترح من كتالوج Steinheim
  - اختيار الفينش
  - زر "Confirm" أو "Change Product"

### الخطوة 4: المعالجة
- شريط تقدم: "Removing original products... → Inserting Steinheim products... → Applying lighting..."
- عرض النتيجة النهائية

### الخطوة 5: التصدير
- تحميل PNG
- تحميل فيديو (اختياري)
- حفظ في مكتبة المشاهد

## E6 — التكامل مع الـ Pipeline الحالي

### n8n Workflow جديد (W05)
- **الهدف**: مسح Pinterest يوميًا ل发现 مشاهد فاخرة جديدة
- **الTrigger**: cron (weekly)
- **الAction**:
  1. جلب صور من Pinterest (manual feed أو API)
  2. تحليل كل صورة
  3. إرسال تنبيه للمستخدم: "تم اكتشاف 3 مشاهد فاخرة جديدة"

### التكامل مع المنتجات
- `scene_replacements` مربوطة بـ`products`
- عند تحديث منتج → إعادة رندر المشاهد اللي فيه
- Catalog sync يحدث المنتجات → المشاهد تتحدث تلقائيًا

## E7 — الأداء والجودة

### معايير الجودة
1. **المنتجات الأصلية**: يجب أن تُزَال بالكامل (لا أثر)
2. **الإضاءة**: يجب أن تتطابق مع المشهد (اتجاه + درجة حرارة)
3. **الانعكاس**: يجب أن يناسب نوع السطح
4. **الظل**: يجب أن يكون واقعيًا (اتجاه + شدة)
5. **اللون**: يجب أن يتطابق مع الفينش المعتمد
6. **ال overall**: يجب أن يبدو كصورة حقيقية واحدة

### الأداء
- تحليل المشهد: ~3-5 ثوانٍ (Gemini Vision)
- إزالة منتج واحد: ~5-8 ثوانٍ (Gemini Image Editing)
- إدراج منتج واحد: ~1-2 ثانية (sharp)
- إجمالي مشهد بـ3 منتجات: ~30-45 ثانية

## الملفات المطلوبة

| الملف | الحالة | الوصف |
|-------|--------|-------|
| `src/lib/creative/scene-analysis.server.ts` | **جديد** | تحليل المشهد بـ Gemini Vision |
| `src/lib/creative/scene-inpaint.server.ts` | **جديد** | إزالة المنتجات بـ Gemini Image Editing |
| `src/lib/creative/scene-compose.ts` | **جديد** | تجميع المشهد النهائي (multi-product) |
| `src/lib/creative/render/compose.ts` | **تعديل** | إضافة perspective + surface-aware lighting |
| `src/lib/creative/render/light.ts` | **تعديل** | إضافة surface-aware reflection |
| `src/lib/agents.server.ts` | **تعديل** | إضافة multimodal input support |
| `src/routes/scenes.tsx` | **جديد** | وصفحة المشاهد |
| `src/routes/api/public/automation/render-scene.ts` | **جديد** | API trigger للرندر |
| `supabase/migrations/20260825_scene_replacement.sql` | **جديد** | قاعدة البيانات |

## المراحل التنفيذية

### المرحلة 1: الأساس (يوم 1)
- [ ] إضافة multimodal support لـ `genObject()` / `genText()`
- [ ] بناء `scene-analysis.server.ts` (تحليل المشهد)
- [ ] بناء `scene-inpaint.server.ts` (إزالة المنتجات)
- [ ] اختبار على 3-5 صور

### المرحلة 2: الإدراج (يوم 2)
- [ ] تعزيز `compose.ts` بـ perspective transform
- [ ] إضافة surface-aware lighting لـ `light.ts`
- [ ] بناء `scene-compose.ts` (multi-product)
- [ ] اختبار على مشاهد فاخرة

### المرحلة 3: الواجهة (يوم 3)
- [ ] صفحة `/scenes` (upload → analysis → matching → render)
- [ ] API endpoint `render-scene`
- [ ] رفع النتائج على Supabase Storage

### المرحلة 4: التكامل (يوم 4)
- [ ] n8n workflow W05 (pinterest discovery)
- [ ] ربط مع catalog products
- [ ] إعادة رندر عند تحديث المنتجات

## معايير القبول

- [ ] صورة مرجعية واحدة → 3-5 منتجات مستبدلة → نتيجة تبدو حقيقية
- [ ] المنتجات الأصلية تُزَال بالكامل (لا أثر)
- [ ] الإضاءة تتطابق مع المشهد
- [ ] الانعكاس يناسب نوع السطح
- [ ] الفينص يتطابق مع المنتج المعتمد
- [ ] فيديو حركة بطيئة يعمل
- [ ] كل شيء مجاني (Gemini عبر OpenRouter)
- [ ] `npm run typecheck` + `npm run build` + CI أخضر
