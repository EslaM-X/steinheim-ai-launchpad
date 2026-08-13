import type { SupabaseClient } from "@supabase/supabase-js";

import { generateGatewayImage } from "./ai-gateway.server";
import { brandSystemPrompt, genObject, genText, getApiKey, knowledgeBlock } from "./agents.server";
import { copySchema, reviewSchema } from "./agents.schemas";
import { loadKnowledge } from "./agents.pipeline";

type DB = SupabaseClient<any, "public", any>;

async function getPostWithIdea(supabase: DB, postId: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("*, content_ideas(topic, topic_ar, goal, angle, research_notes)")
    .eq("id", postId)
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, any>;
}

export async function regeneratePostCopy(supabase: DB, postId: string) {
  const started = Date.now();
  const post = await getPostWithIdea(supabase, postId);
  const kb = await loadKnowledge(supabase);
  const idea = post["content_ideas"] ?? {};

  const copy = await genObject({
    schema: copySchema,
    system: `${brandSystemPrompt(kb.brand)}\nYou are the Copywriter agent rewriting one post for ${post["platform"]}.`,
    prompt: `Topic: ${idea.topic ?? ""}\nAngle: ${idea.angle ?? ""}\nGoal: ${idea.goal ?? ""}\nResearch:\n${idea.research_notes ?? ""}\n\n${knowledgeBlock(kb)}\n\nPrevious English version:\n${post["body_en"] ?? ""}\n\nWrite a fresh, clearly different version for ${post["platform"]} in English and Arabic, plus hashtags and an image prompt. Fill every field; reuse the ${post["platform"]} text for the other platform fields.`,
  });

  const map: Record<string, { en: string; ar: string }> = {
    linkedin: { en: copy.linkedin_en, ar: copy.linkedin_ar },
    facebook: { en: copy.facebook_en, ar: copy.facebook_ar },
    instagram: { en: copy.instagram_en, ar: copy.instagram_ar },
  };
  const chosen = map[post["platform"] as string] ?? { en: copy.linkedin_en, ar: copy.linkedin_ar };

  const { error } = await supabase
    .from("posts")
    .update({
      body_en: chosen.en,
      body_ar: chosen.ar,
      hashtags: copy.hashtags,
      image_prompt: copy.image_prompt,
      status: "draft",
    })
    .eq("id", postId);
  if (error) throw new Error(error.message);

  await supabase.from("agent_runs").insert({
    agent: "copywriter",
    status: "success",
    input: { postId } as never,
    output: chosen as never,
    duration_ms: Date.now() - started,
    idea_id: post["idea_id"] ?? null,
  });

  return chosen;
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
