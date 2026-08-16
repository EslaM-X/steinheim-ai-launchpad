import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { generatePostImage, regeneratePost, reviewPost } from "@/lib/agents.functions";
import { useI18n } from "@/lib/i18n";
import { postQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/posts/$postId")({
  head: () => ({
    meta: [
      { title: "Post editor — Steinheim AI Marketing" },
      {
        name: "description",
        content: "Edit, review and approve a generated Steinheim social post.",
      },
      { property: "og:title", content: "Post editor — Steinheim AI Marketing" },
      {
        property: "og:description",
        content: "Edit, review and approve a generated Steinheim social post.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostEditor,
});

function PostEditor() {
  const { postId } = Route.useParams();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const post = useQuery(postQuery(postId));

  const [en, setEn] = useState("");
  const [ar, setAr] = useState("");
  const [tags, setTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!post.data) return;
    setEn(post.data.body_en ?? "");
    setAr(post.data.body_ar ?? "");
    setTags((post.data.hashtags ?? []).join(" "));
    setPrompt(post.data.image_prompt ?? "");
    setUrl(post.data.published_url ?? "");
  }, [post.data]);

  const regen = useServerFn(regeneratePost);
  const review = useServerFn(reviewPost);
  const image = useServerFn(generatePostImage);

  const save = useMutation({
    mutationFn: async (patch: {
      body_en?: string;
      body_ar?: string;
      hashtags?: string[];
      image_prompt?: string;
      published_url?: string | null;
      published_at?: string;
      status?: string;
    }) => {
      const { error } = await supabase.from("posts").update(patch).eq("id", postId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const agent = useMutation({
    mutationFn: async (kind: "regen" | "review" | "image") => {
      if (kind === "regen") return regen({ data: { postId } });
      if (kind === "review") return review({ data: { postId } });
      return image({ data: { postId } });
    },
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم" : "Done");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  if (post.isLoading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (!post.data) return <p className="text-sm text-muted-foreground">{t("noData")}</p>;

  const idea = post.data.content_ideas;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">
            {(lang === "ar" ? idea?.topic_ar : idea?.topic) ?? idea?.topic ?? t("draft")}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {post.data.platform}
            </Badge>
            <Badge variant="secondary">{post.data.status}</Badge>
            {post.data.review_score != null && (
              <Badge className="bg-accent text-accent-foreground">
                {t("reviewScore")}: {post.data.review_score}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={agent.isPending}
            onClick={() => agent.mutate("regen")}
          >
            <RefreshCw className="size-4" /> {t("regenerate")}
          </Button>
          <Button
            variant="outline"
            disabled={agent.isPending}
            onClick={() => agent.mutate("review")}
          >
            <ShieldCheck className="size-4" /> {t("review")}
          </Button>
          <Button
            variant="outline"
            disabled={agent.isPending}
            onClick={() => agent.mutate("image")}
          >
            {agent.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImageIcon className="size-4" />
            )}
            {t("generateImage")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="space-y-2">
                <Label>{t("englishCopy")}</Label>
                <Textarea dir="ltr" rows={7} value={en} onChange={(e) => setEn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("arabicCopy")}</Label>
                <Textarea dir="rtl" rows={7} value={ar} onChange={(e) => setAr(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("hashtags")}</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("imagePrompt")}</Label>
                <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("publishedUrl")}</Label>
                <Input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    save.mutate({
                      body_en: en,
                      body_ar: ar,
                      hashtags: tags.split(/\s+/).filter(Boolean),
                      image_prompt: prompt,
                      published_url: url || null,
                    })
                  }
                >
                  {t("save")}
                </Button>
                <Button variant="secondary" onClick={() => save.mutate({ status: "approved" })}>
                  {t("approve")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    save.mutate({
                      status: "published",
                      published_at: new Date().toISOString(),
                      published_url: url || null,
                    })
                  }
                >
                  {t("markPublished")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {post.data.image_url && (
            <Card className="overflow-hidden">
              <img src={post.data.image_url} alt={post.data.image_prompt ?? "Generated visual"} />
            </Card>
          )}
          {post.data.review_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("reviewNotes")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {post.data.review_notes}
                </p>
              </CardContent>
            </Card>
          )}
          {idea?.research_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Research</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {idea.research_notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
