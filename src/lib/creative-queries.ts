import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export const campaignsQuery = queryOptions({
  queryKey: ["campaigns"],
  queryFn: () =>
    unwrap<any[]>(
      supabase.from("campaigns").select("*, products(name, official_name, sku)").order("created_at", { ascending: false }),
    ),
});

export const conceptsQuery = (campaignId: string | null) =>
  queryOptions({
    queryKey: ["creative-concepts", campaignId],
    enabled: !!campaignId,
    queryFn: () =>
      unwrap<any[]>(
        supabase.from("creative_concepts").select("*").eq("campaign_id", campaignId!).order("slot"),
      ),
  });

export const storyboardQuery = (campaignId: string | null) =>
  queryOptions({
    queryKey: ["creative-storyboard", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data: sb, error } = await supabase
        .from("storyboards")
        .select("*")
        .eq("campaign_id", campaignId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!sb) return { storyboard: null, shots: [] as any[] };
      const shots = await unwrap<any[]>(
        supabase
          .from("shots")
          .select("*, image:creative_assets!shots_image_asset_fkey(external_url, storage_path)")
          .eq("storyboard_id", sb.id)
          .order("shot_number"),
      );
      return { storyboard: sb, shots };
    },
  });

export const creativeReviewQuery = (campaignId: string | null) =>
  queryOptions({
    queryKey: ["creative-review", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_reviews")
        .select("*")
        .eq("campaign_id", campaignId!)
        .eq("scope", "campaign")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const adVariantsQuery = (campaignId: string | null) =>
  queryOptions({
    queryKey: ["ad-variants", campaignId],
    enabled: !!campaignId,
    queryFn: () =>
      unwrap<any[]>(supabase.from("ad_variants").select("*").eq("campaign_id", campaignId!).order("variant_key")),
  });

export const referencesQuery = (campaignId: string | null) =>
  queryOptions({
    queryKey: ["creative-references", campaignId],
    enabled: !!campaignId,
    queryFn: () =>
      unwrap<any[]>(
        supabase
          .from("creative_references")
          .select("*")
          .eq("campaign_id", campaignId!)
          .order("created_at", { ascending: false }),
      ),
  });
