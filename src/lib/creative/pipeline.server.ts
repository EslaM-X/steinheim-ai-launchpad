import type { SupabaseClient } from "@supabase/supabase-js";

import { mockShots } from "./mock";
import { AD_VARIANT_PRESETS } from "./schemas";
import {
  analyzeReference,
  creativeFinalScore,
  creativeMode,
  generateConcepts,
  generateStoryboard,
  productLine,
  productTruth,
  reviewBand,
  reviewCreative,
} from "./studio.server";

type DB = SupabaseClient<any, "public", any>;

async function getCampaign(supabase: DB, campaignId: string) {
  const { data, error } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
  if (error) throw new Error(error.message);
  return data;
}

/** Queues a generation job; in mock mode it is completed immediately with a placeholder asset. */
async function enqueue(
  supabase: DB,
  campaign: any,
  shot: any,
  kind: "image" | "i2v" | "tts" | "sfx" | "edit",
  placeholderUrl: string | null,
) {
  const mode = creativeMode(campaign.mode);
  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      campaign_id: campaign.id,
      shot_id: shot?.id ?? null,
      kind,
      mode,
      payload: { prompt: shot?.prompt ?? null, camera: shot?.camera ?? null, lighting: shot?.lighting ?? null },
      status: mode === "mock" ? "done" : "queued",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (mode !== "mock") return job.id;

  const { data: asset } = await supabase
    .from("creative_assets")
    .insert({
      campaign_id: campaign.id,
      shot_id: shot?.id ?? null,
      asset_type: kind === "i2v" ? "video" : kind === "image" ? "image" : kind,
      external_url: placeholderUrl,
      model_used: "mock",
      mode,
      meta: { placeholder: true, prompt: shot?.prompt ?? null },
    })
    .select("id")
    .single();

  await supabase
    .from("generation_jobs")
    .update({ result_asset_id: asset?.id ?? null, completed_at: new Date().toISOString() })
    .eq("id", job.id);

  if (shot && asset) {
    await supabase
      .from("shots")
      .update(
        kind === "i2v"
          ? { video_asset_id: asset.id, status: "rendered", ai_artifact_score: 92 }
          : { image_asset_id: asset.id, status: "rendered", ai_artifact_score: 92 },
      )
      .eq("id", shot.id);
  }
  return job.id;
}

export async function analyzeCampaignReference(
  supabase: DB,
  input: { campaignId: string; kind: string; source_url?: string | null; notes?: string | null },
) {
  const campaign = await getCampaign(supabase, input.campaignId);
  const dna = await analyzeReference(supabase, creativeMode(campaign.mode), input);
  const { data, error } = await supabase
    .from("creative_references")
    .insert({
      campaign_id: campaign.id,
      kind: input.kind,
      source_url: input.source_url ?? null,
      notes: input.notes ?? null,
      creative_dna: dna as never,
      improvement_notes: dna.improvement_notes,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function buildConcepts(supabase: DB, campaignId: string) {
  const campaign = await getCampaign(supabase, campaignId);
  const { data: ref } = await supabase
    .from("creative_references")
    .select("creative_dna")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const concepts = await generateConcepts(
    supabase,
    creativeMode(campaign.mode),
    campaign,
    (ref?.creative_dna as never) ?? null,
  );

  await supabase.from("creative_concepts").delete().eq("campaign_id", campaignId);
  const { data, error } = await supabase
    .from("creative_concepts")
    .insert(
      concepts.map((c, i) => ({
        campaign_id: campaignId,
        slot: i + 1,
        title: c.title,
        big_idea: c.big_idea,
        hook: c.hook,
        script_ar: c.script_ar,
        script_en: c.script_en,
        emotional_trigger: c.emotional_trigger,
        visual_language: c.visual_language,
        why_it_works: c.why_it_works,
      })),
    )
    .select("*");
  if (error) throw new Error(error.message);
  await supabase.from("campaigns").update({ status: "concepts" }).eq("id", campaignId);
  return data;
}

export async function selectConcept(supabase: DB, conceptId: string) {
  const { data: concept, error } = await supabase
    .from("creative_concepts")
    .select("*")
    .eq("id", conceptId)
    .single();
  if (error) throw new Error(error.message);
  const campaign = await getCampaign(supabase, concept.campaign_id);

  await supabase.from("creative_concepts").update({ selected: false }).eq("campaign_id", campaign.id);
  await supabase.from("creative_concepts").update({ selected: true }).eq("id", conceptId);

  const { product, images } = await productTruth(supabase, campaign.product_id);
  const placeholder = (images[0]?.image_url as string) ?? (product?.product_url ? null : null);
  const shots = await generateStoryboard(supabase, creativeMode(campaign.mode), campaign, concept);

  await supabase.from("storyboards").delete().eq("campaign_id", campaign.id);
  const { data: storyboard, error: sbError } = await supabase
    .from("storyboards")
    .insert({
      campaign_id: campaign.id,
      concept_id: conceptId,
      total_seconds: campaign.duration_seconds,
      status: "ready",
      edl: { transitions: shots.map((s) => s.transition) } as never,
    })
    .select("*")
    .single();
  if (sbError) throw new Error(sbError.message);

  let t = 0;
  const rows = shots.map((s, i) => {
    const start = t;
    t += Number(s.duration_seconds) || 2;
    return {
      storyboard_id: storyboard.id,
      shot_number: i + 1,
      start_second: start,
      duration_seconds: s.duration_seconds,
      visual: s.visual,
      prompt: s.prompt,
      camera: s.camera,
      lens: s.lens,
      lighting: s.lighting,
      movement: s.movement,
      environment: s.environment,
      transition: s.transition,
      audio_note: s.audio_note,
      workflow: s.workflow,
      product_id: campaign.product_id,
      product_reference_image: images[0]?.id ?? null,
      status: "pending",
    };
  });
  const { data: shotRows, error: shotError } = await supabase.from("shots").insert(rows).select("*");
  if (shotError) throw new Error(shotError.message);

  for (const shot of shotRows) {
    await enqueue(supabase, campaign, shot, shot.workflow === "i2v" ? "i2v" : "image", placeholder);
  }
  await enqueue(supabase, campaign, null, "tts", null);
  await enqueue(supabase, campaign, null, "sfx", null);
  await enqueue(supabase, campaign, null, "edit", null);

  await supabase.from("campaigns").update({ status: "storyboard" }).eq("id", campaign.id);
  return { storyboardId: storyboard.id, shots: shotRows.length };
}

export async function regenerateShot(supabase: DB, shotId: string) {
  const { data: shot, error } = await supabase
    .from("shots")
    .select("*, storyboards(campaign_id)")
    .eq("id", shotId)
    .single();
  if (error) throw new Error(error.message);
  const campaign = await getCampaign(supabase, (shot as any).storyboards.campaign_id);
  const { images } = await productTruth(supabase, campaign.product_id);
  await enqueue(supabase, campaign, shot, shot.workflow === "i2v" ? "i2v" : "image", images[0]?.image_url ?? null);
  return { ok: true };
}

/** Creative-only transforms — they never touch product truth. */
export async function applyCreativeAction(
  supabase: DB,
  campaignId: string,
  action: "cinematic" | "egyptian" | "global" | "variants",
) {
  const campaign = await getCampaign(supabase, campaignId);
  const { data: storyboard } = await supabase
    .from("storyboards")
    .select("id")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (action === "variants") {
    await supabase.from("ad_variants").delete().eq("campaign_id", campaignId);
    const { data: concept } = await supabase
      .from("creative_concepts")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("selected", true)
      .maybeSingle();
    const { data, error } = await supabase
      .from("ad_variants")
      .insert(
        AD_VARIANT_PRESETS.map((p) => ({
          campaign_id: campaignId,
          variant_key: p.key,
          platform: p.platform,
          aspect_ratio: p.aspect_ratio,
          duration_seconds: Math.min(p.duration_seconds, campaign.duration_seconds),
          headline: concept?.title ?? campaign.name,
          primary_text: concept?.big_idea ?? "",
          caption: concept?.script_ar?.split("\n")[0] ?? "",
          cta: "تواصل مع أقرب معرض Steinheim",
          hashtags: ["#Steinheim", "#LuxuryBathroom", "#تصميم_داخلي"],
        })),
      )
      .select("*");
    if (error) throw new Error(error.message);
    await supabase.from("campaigns").update({ status: "variants" }).eq("id", campaignId);
    return data;
  }

  if (!storyboard) throw new Error("Select a concept first — there is no storyboard yet.");
  const { data: shots } = await supabase.from("shots").select("*").eq("storyboard_id", storyboard.id);

  if (action === "cinematic") {
    for (const s of shots ?? []) {
      await supabase
        .from("shots")
        .update({
          camera: `${s.camera ?? "Static"} — anamorphic framing`,
          lighting: `${s.lighting ?? "Soft"} + hard rim, deeper falloff`,
          movement: s.movement && s.movement !== "None" ? `${s.movement}, slower` : "Slow dolly",
          prompt: `${s.prompt} Cinematic grade: teal-stone shadows, warm metallic highlights, shallow depth of field.`,
        })
        .eq("id", s.id);
    }
    return { ok: true, updated: shots?.length ?? 0 };
  }

  if (action === "egyptian") {
    await supabase.from("campaigns").update({ language: "ar-EG" }).eq("id", campaignId);
    for (const s of shots ?? []) {
      await supabase
        .from("shots")
        .update({ audio_note: `${s.audio_note ?? ""} · Egyptian Arabic VO, refined delivery`.trim() })
        .eq("id", s.id);
    }
    return { ok: true };
  }

  await supabase.from("campaigns").update({ language: "en" }).eq("id", campaignId);
  for (const s of shots ?? []) {
    await supabase
      .from("shots")
      .update({ audio_note: `${s.audio_note ?? ""} · Global version: MSA / English VO`.trim() })
      .eq("id", s.id);
  }
  return { ok: true };
}

export async function reviewCampaign(supabase: DB, campaignId: string) {
  const campaign = await getCampaign(supabase, campaignId);
  const { data: concept } = await supabase
    .from("creative_concepts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("selected", true)
    .maybeSingle();
  const { data: storyboard } = await supabase
    .from("storyboards")
    .select("id")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const { data: shots } = storyboard
    ? await supabase.from("shots").select("*").eq("storyboard_id", storyboard.id)
    : { data: [] as any[] };
  const { product } = await productTruth(supabase, campaign.product_id);

  const review = reviewCreative({
    concept,
    shots: shots ?? [],
    product,
    forbidden: product?.forbidden_claims ?? [],
  });
  const finalScore = creativeFinalScore(review);
  const band = reviewBand(review, finalScore);

  await supabase.from("creative_reviews").delete().eq("campaign_id", campaignId).eq("scope", "campaign");
  const { data, error } = await supabase
    .from("creative_reviews")
    .insert({
      campaign_id: campaignId,
      scope: "campaign",
      breakdown: review as never,
      ai_artifact_score: review.ai_artifact_score,
      raw_score: finalScore,
      final_score: finalScore,
      band,
      hard_fail: review.hard_fail,
      hard_fail_reasons: review.hard_fail_reasons as never,
      notes: review.notes,
      ai_approved: !review.hard_fail && finalScore >= 85,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("campaigns").update({ status: "reviewed" }).eq("id", campaignId);
  return data;
}

export async function humanApproveCampaign(supabase: DB, userId: string, campaignId: string, approve: boolean) {
  const { data: review, error } = await supabase
    .from("creative_reviews")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("scope", "campaign")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!review) throw new Error("Run the Creative Gatekeeper before approving.");
  if (approve && (!review.ai_approved || review.hard_fail)) {
    throw new Error("This campaign has not passed AI approval — it cannot be human approved.");
  }
  await supabase
    .from("creative_reviews")
    .update({
      human_approved_by: approve ? userId : null,
      human_approved_at: approve ? new Date().toISOString() : null,
    })
    .eq("id", review.id);
  await supabase
    .from("campaigns")
    .update({ status: approve ? "approved" : "needs_revision" })
    .eq("id", campaignId);
  return { ok: true };
}

/** Used by the mock pipeline sanity check and by the worker fallback. */
export const mockShotPreview = (seconds: number, product: any | null) =>
  mockShots(seconds, productLine(product));
