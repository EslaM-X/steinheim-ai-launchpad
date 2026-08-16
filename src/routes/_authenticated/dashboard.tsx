import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateToday } from "@/lib/agents.functions";
import { useI18n } from "@/lib/i18n";
import { analyticsQuery, ideasQuery, postsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Steinheim AI Marketing" },
      { name: "description", content: "Daily AI-generated content pipeline for Steinheim Egypt." },
      { property: "og:title", content: "Overview — Steinheim AI Marketing" },
      {
        property: "og:description",
        content: "Daily AI-generated content pipeline for Steinheim Egypt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const posts = useQuery(postsQuery);
  const ideas = useQuery(ideasQuery);
  const analytics = useQuery(analyticsQuery);
  const run = useServerFn(generateToday);

  const generate = useMutation({
    mutationFn: () => run({}),
    onSuccess: (data) => {
      toast.success(lang === "ar" ? `تم توليد: ${data.topic}` : `Generated: ${data.topic}`);
      qc.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const now = new Date();
  const monthPosts = (posts.data ?? []).filter((p) => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const publishedCount = (posts.data ?? []).filter((p) => p.status === "published").length;
  const totals = (analytics.data ?? []).reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions ?? 0),
      engagements: acc.engagements + (row.engagements ?? 0),
    }),
    { impressions: 0, engagements: 0 },
  );
  const rate = totals.impressions
    ? ((totals.engagements / totals.impressions) * 100).toFixed(1)
    : "—";

  const recent = (posts.data ?? []).slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{t("overview")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("heroSub")}</p>
        </div>
        <Button size="lg" disabled={generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {generate.isPending ? t("generating") : t("generateToday")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("postsThisMonth")} value={monthPosts.length} />
        <Stat label={t("published")} value={publishedCount} />
        <Stat label={t("ideas")} value={ideas.data?.length ?? 0} />
        <Stat label={t("engagementRate")} value={rate === "—" ? "—" : `${rate}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">{t("allPosts")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {posts.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {!posts.isLoading && recent.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          )}
          {recent.map((post) => (
            <Link
              key={post.id}
              to="/posts/$postId"
              params={{ postId: post.id }}
              className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3 transition-colors hover:bg-secondary"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {post.content_ideas?.[lang === "ar" ? "topic_ar" : "topic"] ??
                    post.content_ideas?.topic ??
                    "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {(lang === "ar" ? post.body_ar : post.body_en)?.slice(0, 110)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {post.platform}
                </Badge>
                <Badge variant="secondary">{post.status}</Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-brand text-muted-foreground">{label}</p>
        <p className="mt-2 font-serif text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}
