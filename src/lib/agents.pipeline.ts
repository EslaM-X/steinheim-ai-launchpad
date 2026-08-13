import type { SupabaseClient } from "@supabase/supabase-js";

import { brandSystemPrompt, genObject, genText, knowledgeBlock } from "./agents.server";
import { copySchema, reviewSchema, strategySchema, type Copy } from "./agents.schemas";

type DB = SupabaseClient<any, "public", any>;

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
      .select("name, name_ar, sku, description, materials, finishes, features, product_url")
      .eq("is_active", true),
    supabase.from("audiences").select("name, name_ar, description, pain_points, motivations, channels"),
    supabase.from("projects").select("name, location, country, description"),
    supabase.from("content_ideas").select("topic").order("created_at", { ascending: false }).limit(15),
  ]);

  return {
    brand: brand.data ?? null,
    products: products.data ?? [],
    audiences: audiences.data ?? [],
    projects: projects.data ?? [],
    recentTopics: (recent.data ?? []).map((r: { topic: string }) => r.topic),
  };
}

export async function runStrategist(supabase: DB) {
  const started = Date.now();
  const kb = await loadKnowledge(supabase);
  const system = brandSystemPrompt(kb.brand);
  const strategy = await genObject({
    schema: strategySchema,
    system: `${system}\nYou are the Content Strategist agent. Pick ONE topic for today's social content.`,
    prompt: `${knowledgeBlock(kb)}\n\nChoose today's topic. Return the topic in English and Arabic, the marketing goal (sales, awareness or brand), a specific creative angle, the SKU of the product to feature (or null), and the name of the target audience (or null). Vary goals and audiences across days.`,
  });
  await logRun(supabase, "strategist", { recentTopics: kb.recentTopics }, strategy, started);
  return { strategy, kb };
}

export const PASS_SCORE = 78;
export const MAX_REVISIONS = 2;

export async function runResearch(
  supabase: DB,
  kb: Awaited<ReturnType<typeof loadKnowledge>>,
  strategy: { topic_en: string; angle: string; goal: string },
  ideaId?: string,
) {
  const started = Date.now();
  const notes = await genText({
    system: `${brandSystemPrompt(kb.brand)}\nYou are the Research agent. You produce short, factual briefing notes for a copywriter.`,
    prompt: `Topic: ${strategy.topic_en}\nAngle: ${strategy.angle}\nGoal: ${strategy.goal}\n\n${knowledgeBlock(kb)}\n\nWrite 4-6 concise bullet points: the strongest arguments, the specifier's objection to answer, one concrete product detail to reference, and the call to action to use. No invented statistics.`,
  });
  await logRun(supabase, "research", strategy, { notes }, started, ideaId);
  return notes;
}

export async function runCopywriter(
  supabase: DB,
  kb: Awaited<ReturnType<typeof loadKnowledge>>,
  strategy: { topic_en: string; topic_ar: string; angle: string; goal: string },
  research: string,
  ideaId?: string,
): Promise<Copy> {
  const started = Date.now();
  const copy = await genObject({
    schema: copySchema,
    system: `${brandSystemPrompt(kb.brand)}\nYou are the Copywriter agent. You write platform-native social copy in English and Modern Standard Arabic.`,
    prompt: `Topic: ${strategy.topic_en} / ${strategy.topic_ar}\nAngle: ${strategy.angle}\nGoal: ${strategy.goal}\nResearch notes:\n${research}\n\n${knowledgeBlock(kb)}\n\nWrite:\n- LinkedIn: 90-140 words, professional, specifier-focused, no emojis.\n- Facebook: 50-80 words, warmer, one clear call to action.\n- Instagram: 25-45 word caption, visual and evocative.\nEach in English and Arabic. Then 6-10 hashtags mixing English and Arabic, and one detailed image prompt describing a photorealistic Steinheim bathroom scene (materials, finish, light, composition) with no text in the image.`,
  });
  await logRun(supabase, "copywriter", strategy, copy, started, ideaId);
  return copy;
}

export async function runReviewer(
  supabase: DB,
  kb: Awaited<ReturnType<typeof loadKnowledge>>,
  copy: Copy,
  ideaId?: string,
) {
  const started = Date.now();
  const review = await genObject({
    schema: reviewSchema,
    system: `${brandSystemPrompt(kb.brand)}\nYou are the Reviewer agent. Score brand-tone compliance and factual accuracy.`,
    prompt: `Review this content:\n${JSON.stringify(copy)}\n\nGive a score from 0 to 100 and short actionable notes covering tone, factual accuracy against the product data, and Arabic quality.`,
  });
  await logRun(supabase, "reviewer", { copy }, review, started, ideaId);
  return review;
}

export async function generateTodayPipeline(supabase: DB, userId: string) {
  const { strategy, kb } = await runStrategist(supabase);

  const product = kb.products.find(
    (p: { sku: string | null }) => strategy.product_sku && p.sku === strategy.product_sku,
  );
  const productRow = product
    ? await supabase.from("products").select("id").eq("sku", strategy.product_sku!).maybeSingle()
    : null;
  const audienceRow = strategy.audience_name
    ? await supabase.from("audiences").select("id").eq("name", strategy.audience_name).maybeSingle()
    : null;

  const research = await runResearch(supabase, kb, strategy);
  let copy = await runCopywriter(supabase, kb, strategy, research);
  let review = await runReviewer(supabase, kb, copy);
  let revisions = 0;

  // FAIL -> Revision loop: rewrite with the reviewer's notes, then re-review.
  while (review.score < PASS_SCORE && revisions < MAX_REVISIONS) {
    revisions += 1;
    copy = await runCopywriter(
      supabase,
      kb,
      strategy,
      `${research}\n\nREVIEWER FEEDBACK (must be fixed, score was ${Math.round(review.score)}/100):\n${review.notes}`,
    );
    review = await runReviewer(supabase, kb, copy);
  }
  const passed = review.score >= PASS_SCORE;

  const { data: idea, error: ideaError } = await supabase
    .from("content_ideas")
    .insert({
      topic: strategy.topic_en,
      topic_ar: strategy.topic_ar,
      goal: strategy.goal,
      angle: strategy.angle,
      research_notes: research,
      product_id: productRow?.data?.id ?? null,
      audience_id: audienceRow?.data?.id ?? null,
      status: passed ? "generated" : "needs_revision",
      created_by: userId,
    })
    .select("id")
    .single();
  if (ideaError) throw new Error(ideaError.message);

  const posts = [
    { platform: "linkedin", body_en: copy.linkedin_en, body_ar: copy.linkedin_ar },
    { platform: "facebook", body_en: copy.facebook_en, body_ar: copy.facebook_ar },
    { platform: "instagram", body_en: copy.instagram_en, body_ar: copy.instagram_ar },
  ].map((p) => ({
    ...p,
    idea_id: idea.id,
    hashtags: copy.hashtags,
    image_prompt: copy.image_prompt,
    status: passed ? "reviewed" : "needs_revision",
    review_score: Math.round(review.score),
    review_notes: review.notes,
  }));

  const { error: postsError } = await supabase.from("posts").insert(posts);
  if (postsError) throw new Error(postsError.message);

  return {
    ideaId: idea.id as string,
    topic: strategy.topic_en,
    score: Math.round(review.score),
    revisions,
    passed,
  };
}
