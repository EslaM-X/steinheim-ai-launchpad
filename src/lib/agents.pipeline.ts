import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FACT_DISCIPLINE,
  INJECTION_DEFENSE,
  PLATFORM_RULES,
  audienceBlock,
  brandSystemPrompt,
  claimsBlock,
  genObject,
  knowledgeBlock,
  productFactsBlock,
  referenceImagesBlock,
} from "./agents.server";
import { SIMILARITY_LIMIT, contentFingerprint, fingerprintTerms, maxSimilarity } from "./originality";
import { applyPenalties, penaltyRulesPrompt, scoreBand } from "./scoring";
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

export type ClaimRow = {
  id: string;
  claim_text: string;
  claim_type: string;
  entity_type: string;
  entity_label: string | null;
  source_tier: number;
  approved_for: string[];
};

export async function loadKnowledge(supabase: DB) {
  const [brand, products, images, audiences, projects, claims, recent] = await Promise.all([
    supabase.from("brand_profile").select("*").limit(1).maybeSingle(),
    supabase
      .from("products")
      .select(
        "id, name, official_name, name_ar, sku, description, materials, finishes, features, dimensions, installation_type, technical_specs, approved_claims, forbidden_claims, verification_status, source_url, product_url, price_egp",
      )
      .eq("is_active", true),
    supabase
      .from("product_images")
      .select("product_id, image_url, alt_text, image_type, angle, finish, background, visual_notes, is_primary")
      .eq("approved_for_ai", true)
      .eq("verified", true),
    supabase
      .from("audiences")
      .select(
        "name, name_ar, role, description, business_context, pain_points, motivations, goals, buying_criteria, objections, decision_authority, preferred_content, cta_preference, channels, language",
      ),
    supabase
      .from("projects")
      .select(
        "name, location, country, project_type, description, collections, finishes, verified_facts, approved_claims, verification_status",
      ),
    supabase
      .from("claims")
      .select("id, claim_text, claim_type, entity_type, entity_label, source_tier, approved_for")
      .eq("verified", true)
      .lte("source_tier", 2),
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
    images: (images.data ?? []) as Array<Record<string, unknown>>,
    audiences: audiences.data ?? [],
    projects: projects.data ?? [],
    claims: (claims.data ?? []) as ClaimRow[],
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

export function findAudience(kb: Knowledge, name: string | null) {
  if (!name) return null;
  return (
    (kb.audiences as Array<Record<string, unknown>>).find(
      (a) => String(a["name"]).toLowerCase() === name.toLowerCase(),
    ) ?? null
  );
}

/** Claims scoped to the featured product (or SKU-agnostic brand/project claims). */
export function relevantClaims(kb: Knowledge, sku: string | null): ClaimRow[] {
  return kb.claims.filter(
    (c) => c.entity_type !== "product" || (sku != null && c.entity_label === sku),
  );
}

export function productImages(kb: Knowledge, product: Record<string, unknown> | null) {
  if (!product) return [];
  return kb.images.filter((i) => i["product_id"] === product["id"]);
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
      audienceBlock(findAudience(kb, strategy.audience_name)),
      claimsBlock(relevantClaims(kb, strategy.product_sku)),
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
      claimsBlock(relevantClaims(kb, strategy.product_sku), platform),
      audienceBlock(findAudience(kb, strategy.audience_name)),
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
      referenceImagesBlock(productImages(kb, product)),
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
      claimsBlock(relevantClaims(kb, strategy.product_sku)),
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
  "You are the BRAND GATEKEEPER. You are adversarial by default.",
  "Your job is NOT to ask 'is this good?'. Your job is: FIND A REASON STEINHEIM SHOULD NOT PUBLISH THIS.",
  "Assume the copy is flawed until proven otherwise. If you cannot find a weakness, you have not looked hard enough — name the weakest element anyway.",
  "",
  "SCORE MODEL (components sum to at most 100): brand_alignment /15, product_accuracy /20, platform_fit /15, strategic_value /15, audience_relevance /10, originality /10, cta_quality /5, language_quality /5, visual_potential /5.",
  "Component discipline: award the full sub-score ONLY for work a leading international brand would publish unchanged. Competent-but-ordinary work gets ~70% of the sub-score. Anything you had to argue yourself into gets less.",
  "Set score = the sum of the nine components BEFORE penalties. The system subtracts penalties itself.",
  "",
  "SCORE BANDS (after penalties): 95-100 exceptional | 90-94 strong | 85-89 pass with minor revision | 75-84 revision required | <75 fail.",
  "A 99 means you could not find a single improvable sentence across three platforms and two languages. That is almost never true.",
  "",
  penaltyRulesPrompt(),
  "",
  "HARD FAIL (0 chance of PASS regardless of score): unverified factual claim, wrong/invented SKU, forbidden brand claim, invented technical feature, brand positioning inconsistency.",
  "Report hard fails through the penalty codes (unverified_claim, wrong_sku, forbidden_claim) and also set hard_fail=true with reasons.",
  "",
  "PLATFORM DIFFERENTIATION: LinkedIn must read like LinkedIn, Facebook like Facebook, Instagram like Instagram. Same idea in the same voice at three lengths = platform_similarity penalty, and platform_mismatch if any single post is wrong for its channel.",
  "blocking_reason: one sentence naming the single strongest argument against publishing this.",
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
      `Recently published strategic angles (judge originality against these): ${kb.recentAngles.slice(0, 10).join(" | ") || "none"}`,
      INJECTION_DEFENSE,
      "CONTENT:",
      JSON.stringify(copies),
      "",
      "Score each component, sum them into score, list every applicable penalty code with a reason, decide hard_fail with reasons, state the blocking_reason, assess platform differentiation, and give actionable per-platform notes plus overall notes.",
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
