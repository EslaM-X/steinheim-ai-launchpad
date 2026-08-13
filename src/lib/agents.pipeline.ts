import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FACT_DISCIPLINE,
  PLATFORM_RULES,
  audienceBlock,
  brandSystemPrompt,
  claimsBlock,
  genObject,
  knowledgeBlock,
  productFactsBlock,
  referenceImagesBlock,
} from "./agents.server";
import {
  CONTENT_TYPES,
  PLATFORMS,
  accuracySchema,
  imagePromptSchema,
  platformCopySchema,
  platformStrategySchema,
  researchSchema,
  reviewSchema,
  strategySchema,
  type AccuracyReport,
  type ImagePrompt,
  type Platform,
  type PlatformCopy,
  type Research,
  type Review,
  type Strategy,
} from "./agents.schemas";

type DB = SupabaseClient<any, "public", any>;

export const PASS_SCORE = 85;
export const MAX_REVISIONS = 2;

async function logRun(
  supabase: DB,
  agent: string,
  input: unknown,
  output: unknown,
  startedAt: number,
  ideaId?: string | null,
  error?: string,
) {
  await supabase.from("agent_runs").insert({
    agent,
    status: error ? "error" : "success",
    input: input as never,
    output: (output ?? null) as never,
    error: error ?? null,
    duration_ms: Date.now() - startedAt,
    idea_id: ideaId ?? null,
  });
}

export async function loadKnowledge(supabase: DB) {
  const [brand, products, audiences, projects, recent] = await Promise.all([
    supabase.from("brand_profile").select("*").limit(1).maybeSingle(),
    supabase
      .from("products")
      .select(
        "name, official_name, name_ar, sku, description, materials, finishes, features, dimensions, installation_type, technical_specs, approved_claims, forbidden_claims, verification_status, source_url, product_url",
      )
      .eq("is_active", true),
    supabase.from("audiences").select("name, name_ar, description, pain_points, motivations, channels"),
    supabase.from("projects").select("name, location, country, description"),
    supabase
      .from("content_ideas")
      .select("topic, content_type")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const recentRows = (recent.data ?? []) as Array<{ topic: string; content_type: string | null }>;

  return {
    brand: brand.data ?? null,
    products: products.data ?? [],
    audiences: audiences.data ?? [],
    projects: projects.data ?? [],
    recentTopics: recentRows.map((r) => r.topic),
    recentTypes: recentRows.map((r) => r.content_type).filter(Boolean) as string[],
  };
}

export type Knowledge = Awaited<ReturnType<typeof loadKnowledge>>;

export function findProduct(kb: Knowledge, sku: string | null) {
  if (!sku) return null;
  return (
    (kb.products as Array<Record<string, unknown>>).find((p) => p["sku"] === sku) ?? null
  );
}

/* ------------------------------------------------------------------ CEO / Strategist */

export async function runStrategist(supabase: DB, kb: Knowledge): Promise<Strategy> {
  const started = Date.now();
  const strategy = await genObject({
    schema: strategySchema,
    system: [
      brandSystemPrompt(kb.brand),
      FACT_DISCIPLINE,
      "You are the CEO / Content Strategist agent. You decide WHAT the brand publishes today and WHY — not how it is written.",
      `You must pick a content_type from: ${CONTENT_TYPES.join(", ")}.`,
      "Rotate content types, funnel stages and audiences across days. Never repeat a content_type used in the last 3 days.",
    ].join("\n"),
    prompt: [
      knowledgeBlock(kb),
      `RECENT CONTENT TYPES (avoid repeating): ${kb.recentTypes.slice(0, 5).join(", ") || "none"}`,
      "",
      "Decide today's content plan: topic (EN + AR), content_type, content_format, funnel_stage, goal, a specific creative angle, the big idea in one sentence, why this matters now, the featured product SKU (must exist in the product data, or null), and the target audience name (or null).",
      "The big idea must be something a competitor could NOT publish word-for-word.",
    ].join("\n"),
  });
  await logRun(supabase, "strategist", { recentTypes: kb.recentTypes }, strategy, started);
  return strategy;
}

/* ------------------------------------------------------------------ Research */

export async function runResearch(
  supabase: DB,
  kb: Knowledge,
  strategy: Strategy,
  ideaId?: string,
): Promise<Research> {
  const started = Date.now();
  const product = findProduct(kb, strategy.product_sku);
  const research = await genObject({
    schema: researchSchema,
    system: [
      brandSystemPrompt(kb.brand),
      FACT_DISCIPLINE,
      "You are the Research agent. You produce a factual brief. Every technical claim must be traced to a source in the knowledge base.",
      "Mark verified=true ONLY when the claim is directly supported by the supplied data; otherwise verified=false and keep it as a general design principle with no technical detail.",
      "You do not write marketing copy. No slogans, no adjectives-for-effect.",
    ].join("\n"),
    prompt: [
      `Topic: ${strategy.topic_en}`,
      `Content type: ${strategy.content_type} | Format: ${strategy.content_format} | Funnel: ${strategy.funnel_stage} | Goal: ${strategy.goal}`,
      `Angle: ${strategy.angle}`,
      `Big idea: ${strategy.big_idea}`,
      productFactsBlock(product),
      knowledgeBlock(kb),
      "",
      "Return: a short summary brief, a list of claims each with source_type, source_id (e.g. product SKU or project name, or null), source_confidence and verified, the single strongest objection to answer, and the recommended CTA.",
    ].join("\n"),
  });
  await logRun(supabase, "research", strategy, research, started, ideaId);
  return research;
}

/* ------------------------------------------------------------------ Platform strategy */

export async function runPlatformStrategy(
  supabase: DB,
  kb: Knowledge,
  strategy: Strategy,
  research: Research,
  ideaId?: string,
) {
  const started = Date.now();
  const out = await genObject({
    schema: platformStrategySchema,
    system: [
      brandSystemPrompt(kb.brand),
      "You are the Platform Strategy agent. You translate one big idea into three genuinely different platform executions.",
      "The three directions must differ in ENTRY POINT, VOICE and PURPOSE — not only in length.",
      PLATFORM_RULES["linkedin"],
      PLATFORM_RULES["facebook"],
      PLATFORM_RULES["instagram"],
    ].join("\n"),
    prompt: [
      `Big idea: ${strategy.big_idea}`,
      `Angle: ${strategy.angle} | Content type: ${strategy.content_type} | Funnel: ${strategy.funnel_stage}`,
      `Research summary: ${research.summary}`,
      `Objection: ${research.objection_to_answer}`,
      "",
      "For each platform give a one-paragraph creative direction: the hook to open with, the emotional or rational job of the post, and what NOT to do on that platform.",
    ].join("\n"),
  });
  await logRun(supabase, "platform_strategy", strategy, out, started, ideaId);
  return out;
}

/* ------------------------------------------------------------------ Platform writers */

const verifiedFacts = (research: Research) =>
  research.claims
    .filter((c) => c.verified)
    .map((c) => `- ${c.claim} (source: ${c.source_type}${c.source_id ? `:${c.source_id}` : ""})`)
    .join("\n") || "- none: write about the design idea only, with no technical claims";

/** Models occasionally glue hashtags together with stray glyphs — split and clean them. */
export function sanitizeHashtags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    for (const part of String(raw).split(/[^\p{L}\p{N}#_]+/u)) {
      for (const tag of part.split("#")) {
        const t = tag.trim();
        if (t) out.push(`#${t}`);
      }
    }
  }
  return Array.from(new Set(out)).slice(0, 10);
}

export async function runPlatformWriter(
  supabase: DB,
  kb: Knowledge,
  strategy: Strategy,
  research: Research,
  direction: string,
  platform: Platform,
  feedback?: string,
  ideaId?: string,
): Promise<PlatformCopy> {
  const started = Date.now();
  const product = findProduct(kb, strategy.product_sku);
  const copy = await genObject({
    schema: platformCopySchema,
    system: [
      brandSystemPrompt(kb.brand),
      FACT_DISCIPLINE,
      `You are the ${platform.toUpperCase()} Writer agent. You write ONLY for ${platform}.`,
      PLATFORM_RULES[platform] ?? "",
      "You write English and Modern Standard Arabic. The Arabic is a native rewrite, never a literal translation.",
    ].join("\n"),
    prompt: [
      `Big idea: ${strategy.big_idea}`,
      `Topic: ${strategy.topic_en} / ${strategy.topic_ar}`,
      `Content type: ${strategy.content_type} | Format: ${strategy.content_format} | Funnel: ${strategy.funnel_stage} | Goal: ${strategy.goal}`,
      `Creative direction for ${platform}: ${direction}`,
      `Objection to answer: ${research.objection_to_answer}`,
      `Recommended CTA: ${research.recommended_cta}`,
      "VERIFIED FACTS YOU MAY USE (nothing else):",
      verifiedFacts(research),
      productFactsBlock(product),
      feedback ? `\nREVIEWER FEEDBACK — must be fixed:\n${feedback}` : "",
      "",
      `Write the ${platform} post in English (body_en) and Arabic (body_ar), plus 5-8 hashtags suited to ${platform}.`,
    ].join("\n"),
  });
  const clean: PlatformCopy = { ...copy, hashtags: sanitizeHashtags(copy.hashtags) };
  await logRun(supabase, `writer_${platform}`, { platform, direction }, clean, started, ideaId);
  return clean;
}

/* ------------------------------------------------------------------ Image agent */

export async function runImageAgent(
  supabase: DB,
  kb: Knowledge,
  strategy: Strategy,
  ideaId?: string,
): Promise<ImagePrompt> {
  const started = Date.now();
  const product = findProduct(kb, strategy.product_sku);
  const out = await genObject({
    schema: imagePromptSchema,
    system: [
      brandSystemPrompt(kb.brand),
      FACT_DISCIPLINE,
      "You are the Designer / Image Prompt agent. Product accuracy outranks beauty: a beautiful image of the WRONG product is a failure.",
      "Describe only the geometry, finish, mounting and proportions supported by the product data. Never invent handles, spouts, logos, features or finishes.",
    ].join("\n"),
    prompt: [
      `Scene should support: ${strategy.big_idea}`,
      productFactsBlock(product),
      "",
      "Return a photorealistic image prompt (interior architecture scene, materials, light, composition, camera angle, no text/logos/watermarks), plus the exact product_geometry, finish, mounting_configuration, and a list of forbidden_modifications the generator must not apply.",
    ].join("\n"),
  });
  await logRun(supabase, "image_prompt", strategy, out, started, ideaId);
  return out;
}

/* ------------------------------------------------------------------ Accuracy validator */

export async function runAccuracyValidator(
  supabase: DB,
  kb: Knowledge,
  strategy: Strategy,
  research: Research,
  copies: Record<Platform, PlatformCopy>,
  ideaId?: string,
): Promise<AccuracyReport> {
  const started = Date.now();
  const product = findProduct(kb, strategy.product_sku);
  const report = await genObject({
    schema: accuracySchema,
    system: [
      "You are the Accuracy Validator. You are adversarial and literal.",
      "You compare every factual statement in the copy against the supplied product data and the verified research claims.",
      "Any technical statement not directly supported is an unverified claim. Any statement that contradicts the data is a wrong fact.",
      "Design opinions and aesthetic language are not claims — ignore them.",
      "passed = true only when unverified_claims and wrong_facts are both empty.",
    ].join("\n"),
    prompt: [
      productFactsBlock(product),
      "VERIFIED CLAIMS:",
      verifiedFacts(research),
      "COPY TO VALIDATE:",
      JSON.stringify(copies),
      "",
      "List every unverified claim and every wrong fact, quoting the exact phrase. Then give short notes.",
    ].join("\n"),
  });
  await logRun(supabase, "accuracy_validator", { sku: strategy.product_sku }, report, started, ideaId);
  return report;
}

/* ------------------------------------------------------------------ Brand reviewer */

const REVIEWER_SYSTEM = [
  "You are the BRAND GATEKEEPER, not a quality checker.",
  "The only question you answer is: does this deserve to be published on the brand's own channels?",
  "Be strict and unflattering. Most first drafts deserve 70-85. Reserve 90+ for content a leading brand would be proud to publish.",
  "",
  "SCORE MODEL (sum to 100): brand_alignment /15, product_accuracy /20, platform_fit /15, strategic_value /15, audience_relevance /10, originality /10, cta_quality /5, language_quality /5, visual_potential /5.",
  "score = the sum of the nine components.",
  "",
  "HARD FAIL CONDITIONS — set hard_fail=true regardless of score:",
  "- any product claim that is not verified",
  "- a wrong or invented SKU",
  "- platform mismatch (a post that does not read native to its platform)",
  "- an invented technical feature",
  "- generic content any competitor could publish unchanged",
  "- brand positioning inconsistency",
  "",
  "PLATFORM DIFFERENTIATION: judge whether LinkedIn feels like LinkedIn, Facebook like Facebook, Instagram like Instagram.",
  "If the three posts are the same idea in the same voice at different lengths, that is a platform mismatch hard fail.",
].join("\n");

export async function runBrandReviewer(
  supabase: DB,
  kb: Knowledge,
  strategy: Strategy,
  copies: Record<Platform, PlatformCopy>,
  accuracy: AccuracyReport,
  ideaId?: string,
): Promise<Review> {
  const started = Date.now();
  const review = await genObject({
    schema: reviewSchema,
    system: [brandSystemPrompt(kb.brand), REVIEWER_SYSTEM].join("\n"),
    prompt: [
      `Strategy: ${JSON.stringify(strategy)}`,
      `Accuracy validator report: ${JSON.stringify(accuracy)}`,
      "CONTENT:",
      JSON.stringify(copies),
      "",
      "Score each component, sum them into score, decide hard_fail with reasons, assess platform differentiation, and give actionable per-platform notes plus overall notes.",
    ].join("\n"),
  });
  await logRun(supabase, "brand_reviewer", { strategy }, review, started, ideaId);
  return review;
}

/* ------------------------------------------------------------------ Orchestration */

export async function generateTodayPipeline(supabase: DB, userId: string) {
  const kb = await loadKnowledge(supabase);
  const strategy = await runStrategist(supabase, kb);

  const productRow = strategy.product_sku
    ? await supabase.from("products").select("id").eq("sku", strategy.product_sku).maybeSingle()
    : null;
  const audienceRow = strategy.audience_name
    ? await supabase.from("audiences").select("id").eq("name", strategy.audience_name).maybeSingle()
    : null;

  const research = await runResearch(supabase, kb, strategy);
  const directions = await runPlatformStrategy(supabase, kb, strategy, research);
  const directionMap: Record<Platform, string> = {
    linkedin: directions.linkedin_direction,
    facebook: directions.facebook_direction,
    instagram: directions.instagram_direction,
  };

  const write = async (feedback?: Record<Platform, string>) => {
    const results = await Promise.all(
      PLATFORMS.map((p) =>
        runPlatformWriter(supabase, kb, strategy, research, directionMap[p], p, feedback?.[p]),
      ),
    );
    return Object.fromEntries(PLATFORMS.map((p, i) => [p, results[i]!])) as Record<Platform, PlatformCopy>;
  };

  let copies = await write();
  let accuracy = await runAccuracyValidator(supabase, kb, strategy, research, copies);
  let review = await runBrandReviewer(supabase, kb, strategy, copies, accuracy);
  let revisions = 0;

  while ((review.hard_fail || review.score < PASS_SCORE) && revisions < MAX_REVISIONS) {
    revisions += 1;
    const shared = [
      `Overall score ${Math.round(review.score)}/100.`,
      review.hard_fail ? `HARD FAIL: ${review.hard_fail_reasons.join("; ")}` : "",
      `Platform differentiation: ${review.platform_differentiation}`,
      review.notes,
      accuracy.passed
        ? ""
        : `Remove or replace these unsupported statements: ${[...accuracy.unverified_claims, ...accuracy.wrong_facts].join("; ")}`,
    ]
      .filter(Boolean)
      .join("\n");
    const feedback = Object.fromEntries(
      PLATFORMS.map((p) => [p, `${shared}\n${p} notes: ${review.per_platform_notes[p]}`]),
    ) as Record<Platform, string>;
    copies = await write(feedback);
    accuracy = await runAccuracyValidator(supabase, kb, strategy, research, copies);
    review = await runBrandReviewer(supabase, kb, strategy, copies, accuracy);
  }

  const image = await runImageAgent(supabase, kb, strategy);
  const passed = !review.hard_fail && review.score >= PASS_SCORE && accuracy.passed;

  const { data: idea, error: ideaError } = await supabase
    .from("content_ideas")
    .insert({
      topic: strategy.topic_en,
      topic_ar: strategy.topic_ar,
      goal: strategy.goal,
      angle: strategy.angle,
      content_type: strategy.content_type,
      content_format: strategy.content_format,
      funnel_stage: strategy.funnel_stage,
      research_notes: [
        research.summary,
        "",
        "CLAIMS:",
        ...research.claims.map(
          (c) => `- [${c.verified ? "verified" : "unverified"}] ${c.claim} (${c.source_type}${c.source_id ? `:${c.source_id}` : ""}, ${c.source_confidence})`,
        ),
        "",
        `Objection: ${research.objection_to_answer}`,
        `CTA: ${research.recommended_cta}`,
      ].join("\n"),
      product_id: productRow?.data?.id ?? null,
      audience_id: audienceRow?.data?.id ?? null,
      status: passed ? "generated" : "needs_revision",
      created_by: userId,
    })
    .select("id")
    .single();
  if (ideaError) throw new Error(ideaError.message);

  const imagePromptText = [
    image.prompt,
    `Product geometry: ${image.product_geometry}. Finish: ${image.finish}. Mounting: ${image.mounting_configuration}.`,
    `Do not: ${image.forbidden_modifications.join("; ")}.`,
  ].join(" ");

  const {
    brand_alignment,
    product_accuracy,
    platform_fit,
    strategic_value,
    audience_relevance,
    originality,
    cta_quality,
    language_quality,
    visual_potential,
  } = review;

  const posts = PLATFORMS.map((p) => ({
    platform: p,
    body_en: copies[p].body_en,
    body_ar: copies[p].body_ar,
    idea_id: idea.id,
    hashtags: copies[p].hashtags,
    image_prompt: imagePromptText,
    status: passed ? "reviewed" : "needs_revision",
    review_score: Math.round(review.score),
    review_notes: `${review.notes}\n\n${p}: ${review.per_platform_notes[p]}`,
    hard_fail: review.hard_fail,
    review_breakdown: {
      brand_alignment,
      product_accuracy,
      platform_fit,
      strategic_value,
      audience_relevance,
      originality,
      cta_quality,
      language_quality,
      visual_potential,
      hard_fail_reasons: review.hard_fail_reasons,
      platform_differentiation: review.platform_differentiation,
    } as never,
    accuracy_report: accuracy as never,
  }));

  const { error: postsError } = await supabase.from("posts").insert(posts);
  if (postsError) throw new Error(postsError.message);

  return {
    ideaId: idea.id as string,
    topic: strategy.topic_en,
    contentType: strategy.content_type,
    score: Math.round(review.score),
    hardFail: review.hard_fail,
    accuracyPassed: accuracy.passed,
    revisions,
    passed,
  };
}
