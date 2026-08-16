import type { Concept, CreativeDna, Shot } from "./schemas";

type ProductTruth = {
  name: string;
  official_name?: string | null;
  sku?: string | null;
  finishes?: string[];
  materials?: string | null;
  installation_type?: string | null;
  dimensions?: string | null;
};

const finishOf = (p: ProductTruth | null) => p?.finishes?.[0] ?? "verified factory finish";
const nameOf = (p: ProductTruth | null) => p?.official_name || p?.name || "the Steinheim product";

/** Deterministic concepts — no AI credits, but structurally identical to the AI output. */
export function mockConcepts(product: ProductTruth | null, directions: string[]): Concept[] {
  const n = nameOf(product);
  const f = finishOf(product);
  const tone = directions.length ? directions.join(", ") : "luxury, cinematic";
  return [
    {
      title: "The Detail",
      big_idea: "Luxury is not what you see first — it is the detail you feel.",
      hook: "الفخامة مش في اللي تشوفه…",
      script_ar: `لقطات قريبة جدًا: رخام، ظل، ماء.\nصوت معدن هادئ.\n"الفخامة مش في اللي تشوفه…"\nكشف ${n} بتشطيب ${f}.\n"الفخامة في التفاصيل اللي تحسها."\nSTEINHEIM`,
      script_en: `Extreme macro: marble, shadow, water.\n"Luxury isn't what you see first."\nReveal ${n} in ${f}.\n"It's the detail you feel."\nSTEINHEIM`,
      emotional_trigger: "Desire · precision · status",
      visual_language: `Macro to architectural reveal. Tone: ${tone}.`,
      why_it_works: "Delays the product reveal, so attention is earned before the brand is shown.",
    },
    {
      title: "Architecture of Water",
      big_idea: "Water treated as an architectural material, not a utility.",
      hook: "الماء كمادة معمارية.",
      script_ar: `الماء يتحرك ببطء كأنه عنصر معماري.\nخطوط، انعكاس، ضوء.\n${n} يظهر كقطعة تصميم داخل المساحة.\n"تفاصيل تُصمَّم، لا تُركَّب فقط."\nSTEINHEIM`,
      script_en: `Water moves like a designed material — line, reflection, light.\n${n} reads as architecture inside the space.\n"Details are designed, not just installed."\nSTEINHEIM`,
      emotional_trigger: "Awe · craft · design intelligence",
      visual_language: `Slow dolly, high-contrast architectural lighting. Tone: ${tone}.`,
      why_it_works: "Speaks to specifiers in their own visual language without technical claims.",
    },
    {
      title: "Before You See It",
      big_idea: "Ten seconds of texture before a single product frame.",
      hook: "قبل ما تشوفه…",
      script_ar: `انعكاس معدن، ظل، قماش، يد.\nلا منتج.\nثم — كشف كامل لـ${n}.\n"الفرق بيبدأ من التفاصيل."\nSTEINHEIM`,
      script_en: `Metal reflection, shadow, cloth, hand. No product.\nThen — full reveal of ${n}.\n"The difference starts in the details."\nSTEINHEIM`,
      emotional_trigger: "Curiosity · anticipation",
      visual_language: `Texture-first montage, hard cut reveal. Tone: ${tone}.`,
      why_it_works: "Maximises hook retention in the first three seconds on Reels and TikTok.",
    },
    {
      title: "Not Every Luxury Bathroom Is Luxury",
      big_idea: "A provocative comparison that ends on craftsmanship, not on rivals.",
      hook: "مش كل حمام فاخر… فاخر.",
      script_ar: `"مش كل حمام فاخر… فاخر."\nلقطات لتفاصيل باهتة مقابل تفاصيل دقيقة.\n${n} بتشطيب ${f}.\n"الفرق بيبدأ من التفاصيل."\nSTEINHEIM`,
      script_en: `"Not every luxury bathroom is luxury."\nDull detail versus precise detail.\n${n} in ${f}.\n"The difference starts in the details."\nSTEINHEIM`,
      emotional_trigger: "Provocation · discernment",
      visual_language: `Split rhythm, fast open, slow luxury middle. Tone: ${tone}.`,
      why_it_works: "High stop-rate in the Egyptian feed while staying brand-safe.",
    },
  ];
}

export function mockCreativeDna(notes: string): CreativeDna {
  return {
    hook: "0–2s: black frame + single sound accent",
    visual_pattern: "Extreme macro → architectural reveal",
    camera: "Slow dolly, macro, low angle",
    lighting: "High contrast, warm architectural key",
    color: "Stone, black, metallic",
    editing: "Fast opening, slow luxury middle, hard CTA ending",
    sound: "Metallic impact, water, deep cinematic bass",
    emotional_trigger: "Desire, precision, status",
    product_reveal: "Around 60% of the runtime",
    cta: "Final 4 seconds, brand lockup",
    improvement_notes: notes
      ? `Reference notes considered: ${notes}. Improve by earning the reveal earlier for feed placements and by grounding every product frame in verified geometry.`
      : "Improve on the reference by making the hook product-agnostic and the reveal geometry-accurate.",
  };
}

const BEATS: Array<Omit<Shot, "duration_seconds">> = [
  {
    visual: "Black frame, single water drop sound",
    prompt: "Pure black frame, faint specular highlight, cinematic grain",
    camera: "Static",
    lens: "50mm",
    lighting: "Single hard key",
    movement: "None",
    environment: "Void",
    transition: "Cut",
    audio_note: "Water drop",
    workflow: "image",
  },
  {
    visual: "Macro chrome reflection",
    prompt: "Extreme macro of a polished metal edge, architectural reflection",
    camera: "Macro",
    lens: "100mm macro",
    lighting: "Hard rim light",
    movement: "Slow push in",
    environment: "Studio",
    transition: "Cut",
    audio_note: "Metal click",
    workflow: "i2v",
  },
  {
    visual: "Marble surface texture",
    prompt: "Honed marble slab, raking light, fine grain detail",
    camera: "Top down",
    lens: "50mm",
    lighting: "Raking window light",
    movement: "Slow slide",
    environment: "Bathroom counter",
    transition: "Cut",
    audio_note: "Room tone",
    workflow: "i2v",
  },
  {
    visual: "Water flowing",
    prompt: "Slow motion water column, clean laminar flow, dark background",
    camera: "Side",
    lens: "85mm",
    lighting: "Backlight",
    movement: "Static",
    environment: "Studio",
    transition: "Dissolve",
    audio_note: "Water",
    workflow: "i2v",
  },
  {
    visual: "Architectural bathroom reveal",
    prompt: "Wide luxury bathroom, stone and dark joinery, warm architectural light",
    camera: "Wide",
    lens: "24mm",
    lighting: "Practical + soft key",
    movement: "Slow dolly in",
    environment: "Luxury bathroom",
    transition: "Cut",
    audio_note: "Ambience",
    workflow: "i2v",
  },
  {
    visual: "Product detail",
    prompt: "Close detail of the product body and finish, exact factory geometry",
    camera: "Close",
    lens: "85mm",
    lighting: "Soft key + rim",
    movement: "Slight orbit",
    environment: "Bathroom",
    transition: "Cut",
    audio_note: "Bass riser",
    workflow: "i2v",
  },
  {
    visual: "Hand interaction",
    prompt: "Hand operating the product, natural motion, correct mounting",
    camera: "Medium close",
    lens: "50mm",
    lighting: "Warm key",
    movement: "Handheld subtle",
    environment: "Bathroom",
    transition: "Cut",
    audio_note: "Metal click",
    workflow: "i2v",
  },
  {
    visual: "Hero product frame",
    prompt: "Hero product shot, exact geometry and finish, architectural background",
    camera: "Hero",
    lens: "85mm",
    lighting: "Studio architectural",
    movement: "Slow push",
    environment: "Bathroom",
    transition: "Cut",
    audio_note: "Impact",
    workflow: "i2v",
  },
  {
    visual: "Full bathroom composition",
    prompt: "Full room composition with the product in context",
    camera: "Wide",
    lens: "28mm",
    lighting: "Natural + practical",
    movement: "Static",
    environment: "Luxury bathroom",
    transition: "Dissolve",
    audio_note: "Ambience",
    workflow: "i2v",
  },
  {
    visual: "Brand statement",
    prompt: "Typographic frame on stone texture",
    camera: "Static",
    lens: "50mm",
    lighting: "Soft",
    movement: "None",
    environment: "Void",
    transition: "Cut",
    audio_note: "Silence",
    workflow: "image",
  },
  {
    visual: "Logo + CTA",
    prompt: "STEINHEIM lockup with call to action",
    camera: "Static",
    lens: "50mm",
    lighting: "Flat",
    movement: "None",
    environment: "Void",
    transition: "Fade",
    audio_note: "Final impact",
    workflow: "image",
  },
];

/** Distributes the campaign duration across the beat structure. */
export function mockShots(totalSeconds: number, productLine: string): Shot[] {
  const count =
    totalSeconds <= 10 ? 5 : totalSeconds <= 15 ? 7 : totalSeconds <= 20 ? 9 : BEATS.length;
  const beats = BEATS.slice(0, count);
  const per = Math.max(1, Math.round((totalSeconds / count) * 10) / 10);
  return beats.map((b, i) => ({
    ...b,
    duration_seconds: i === beats.length - 1 ? Math.max(1, totalSeconds - per * (count - 1)) : per,
    prompt: `${b.prompt}. ${productLine}`,
  }));
}
