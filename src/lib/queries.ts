import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export type PostRow = {
  id: string;
  idea_id: string | null;
  platform: string;
  body_en: string | null;
  body_ar: string | null;
  hashtags: string[];
  image_prompt: string | null;
  image_url: string | null;
  status: string;
  review_score: number | null;
  review_notes: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  content_ideas?: {
    topic: string;
    topic_ar: string | null;
    goal: string;
    planned_date: string;
    angle?: string | null;
    research_notes?: string | null;
  } | null;
};

export type IdeaRow = {
  id: string;
  topic: string;
  topic_ar: string | null;
  goal: string;
  angle: string | null;
  research_notes: string | null;
  planned_date: string;
  status: string;
  created_at: string;
};

export const postsQuery = queryOptions({
  queryKey: ["posts"],
  queryFn: () =>
    unwrap<PostRow[]>(
      supabase
        .from("posts")
        .select("*, content_ideas(topic, topic_ar, goal, planned_date)")
        .order("created_at", { ascending: false }),
    ),
});

export const ideasQuery = queryOptions({
  queryKey: ["ideas"],
  queryFn: () =>
    unwrap<IdeaRow[]>(
      supabase.from("content_ideas").select("*").order("planned_date", { ascending: false }),
    ),
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () =>
    unwrap<any[]>(
      supabase.from("products").select("*, categories(name, name_ar)").order("created_at"),
    ),
});

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => unwrap<any[]>(supabase.from("categories").select("*").order("name")),
});

export const audiencesQuery = queryOptions({
  queryKey: ["audiences"],
  queryFn: () => unwrap<any[]>(supabase.from("audiences").select("*").order("name")),
});

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: () => unwrap<any[]>(supabase.from("projects").select("*").order("name")),
});

export const brandQuery = queryOptions({
  queryKey: ["brand"],
  queryFn: async () => {
    const { data, error } = await supabase.from("brand_profile").select("*").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data as any;
  },
});

export const analyticsQuery = queryOptions({
  queryKey: ["analytics"],
  queryFn: () =>
    unwrap<any[]>(
      supabase
        .from("post_analytics")
        .select("*, posts(platform, body_en, published_at)")
        .order("measured_on", { ascending: false }),
    ),
});

export const runsQuery = queryOptions({
  queryKey: ["runs"],
  queryFn: () =>
    unwrap<any[]>(
      supabase.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(100),
    ),
});

export const postQuery = (id: string) =>
  queryOptions({
    queryKey: ["post", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, content_ideas(topic, topic_ar, goal, angle, research_notes, planned_date)")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data as PostRow;
    },
  });
