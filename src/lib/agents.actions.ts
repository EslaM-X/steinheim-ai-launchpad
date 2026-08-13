import type { SupabaseClient } from "@supabase/supabase-js";

import { generateGatewayImage } from "./ai-gateway.server";
import { brandSystemPrompt, genObject, genText, getApiKey, knowledgeBlock } from "./agents.server";
import { accuracySchema, reviewSchema, type Platform, type PlatformCopy } from "./agents.schemas";
import { loadKnowledge, runPlatformWriter, type Knowledge } from "./agents.pipeline";

type DB = SupabaseClient<any, "public", any>;

async function getPostWithIdea(supabase: DB, postId: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "*, content_ideas(topic, topic_ar, goal, angle, content_type, content_format, funnel_stage, research_notes, products(sku))",
    )
    .eq("id", postId)
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, any>;
}

function ideaStrategy(idea: Record<string, any>, sku: string | null) {
  return {
    topic_en: idea["topic"] ?? "",
    topic_ar: idea["topic_ar"] ?? "",
    content_type: idea["content_type"] ?? "design_insight",
    content_format: idea["content_format"] ?? "educational_post",
    funnel_stage: idea["funnel_stage"] ?? "top_of_funnel",
    goal: idea["goal"] ?? "awareness",
    angle: idea["angle"] ?? "",
    big_idea: idea["angle"] ?? idea["topic"] ?? "",
    why_now: "",
    product_sku: sku,
    audience_name: null,
  } as never;
}

function ideaResearch(idea: Record<string, any>) {
  return {
    summary: idea["research_notes"] ?? "",
    claims: [],
    objection_to_answer: "",
    recommended_cta: "",
  } as never;
}

export async function regeneratePostCopy(supabase: DB, postId: string) {
  const post = await getPostWithIdea(supabase, postId);
  const kb: Knowledge = await loadKnowledge(supabase);
  const idea = post["content_ideas"] ?? {};
  const platform = (post["platform"] as Platform) ?? "linkedin";
  const sku = idea?.products?.sku ?? null;

  const copy: PlatformCopy = await runPlatformWriter(
    supabase,
    kb,
    ideaStrategy(idea, sku),
    ideaResearch(idea),
    `Rewrite for ${platform}. Produce a clearly different execution from the previous version below, still native to ${platform}.`,
    platform,
    `Previous version (do not repeat its structure or opening):\n${post["body_en"] ?? ""}`,
    post["idea_id"] ?? undefined,
  );

  const { error } = await supabase
    .from("posts")
    .update({
      body_en: copy.body_en,
      body_ar: copy.body_ar,
      hashtags: copy.hashtags,
      status: "draft",
    })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  return { en: copy.body_en, ar: copy.body_ar };
}

export async function reviewSinglePost(supabase: DB, postId: string) {
  const started = Date.now();
  const post = await getPostWithIdea(supabase, postId);
  const kb = await loadKnowledge(supabase);

  const review = await genObject({
    schema: reviewSchema,
    system: `${brandSystemPrompt(kb.brand)}\nYou are the Reviewer agent.`,
    prompt: `Review this ${post["platform"]} post.\nEnglish:\n${post["body_en"] ?? ""}\n\nArabic:\n${post["body_ar"] ?? ""}\n\nProduct data:\n${JSON.stringify(kb.products)}\n\nScore 0-100 and give short actionable notes on tone, factual accuracy and Arabic quality.`,
  });

  const { error } = await supabase
    .from("posts")
    .update({
      review_score: Math.round(review.score),
      review_notes: review.notes,
      status: "reviewed",
    })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  await supabase.from("agent_runs").insert({
    agent: "reviewer",
    status: "success",
    input: { postId } as never,
    output: review as never,
    duration_ms: Date.now() - started,
    idea_id: post["idea_id"] ?? null,
  });

  return review;
}

export async function generateImageForPost(supabase: DB, postId: string) {
  const started = Date.now();
  const post = await getPostWithIdea(supabase, postId);
  const prompt =
    post["image_prompt"] ||
    "Photorealistic premium German bathroom interior, brushed brass fixtures, stone surfaces, soft daylight, architectural composition, no text.";

  const imageUrl = await generateGatewayImage(getApiKey(), `${prompt}. No text, no logos, no watermarks.`);

  const { error } = await supabase.from("posts").update({ image_url: imageUrl }).eq("id", postId);
  if (error) throw new Error(error.message);

  await supabase.from("agent_runs").insert({
    agent: "image",
    status: "success",
    input: { postId, prompt } as never,
    output: { generated: true } as never,
    duration_ms: Date.now() - started,
    idea_id: post["idea_id"] ?? null,
  });

  return { imageUrl };
}

export async function runAnalyticsAgent(supabase: DB) {
  const started = Date.now();
  const kb = await loadKnowledge(supabase);
  const { data } = await supabase
    .from("posts")
    .select("platform, body_en, published_at, post_analytics(impressions, engagements, clicks, leads)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(30);

  const summary = await genText({
    system: `${brandSystemPrompt(kb.brand)}\nYou are the Analytics agent. You summarise social performance for a marketing manager.`,
    prompt: `Performance data:\n${JSON.stringify(data ?? [])}\n\nWrite a short summary: what performed best, what underperformed, and three concrete recommendations for next week. If there is little data, say so plainly and give baseline recommendations.`,
  });

  await supabase.from("agent_runs").insert({
    agent: "analytics",
    status: "success",
    input: { posts: data?.length ?? 0 } as never,
    output: { summary } as never,
    duration_ms: Date.now() - started,
  });

  return { summary };
}
