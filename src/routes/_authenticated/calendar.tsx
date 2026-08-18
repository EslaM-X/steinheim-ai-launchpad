import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { postsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Steinheim" },
      {
        name: "description",
        content: "Plan and track every scheduled Steinheim post across platforms.",
      },
      { property: "og:title", content: "Calendar — Steinheim" },
      {
        property: "og:description",
        content: "Plan and track every scheduled Steinheim post across platforms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const STATUSES = ["all", "draft", "reviewed", "approved", "published"] as const;

function CalendarPage() {
  const { t, lang } = useI18n();
  const posts = useQuery(postsQuery);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("all");

  const rows = (posts.data ?? []).filter((p) => filter === "all" || p.status === filter);

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, post) => {
    const key = (post.scheduled_at ?? post.content_ideas?.planned_date ?? post.created_at).slice(
      0,
      10,
    );
    (acc[key] ??= []).push(post);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">{t("calendar")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("allPosts")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      {posts.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {!posts.isLoading && days.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      )}

      <div className="space-y-6">
        {days.map((day) => (
          <div key={day} className="space-y-2">
            <p className="text-xs uppercase tracking-brand text-muted-foreground">{day}</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grouped[day]!.map((post) => (
                <Link key={post.id} to="/posts/$postId" params={{ postId: post.id }}>
                  <Card className="h-full transition-colors hover:border-accent">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="capitalize">
                          {post.platform}
                        </Badge>
                        <Badge variant="secondary">{post.status}</Badge>
                      </div>
                      <p className="text-sm font-medium">
                        {(lang === "ar"
                          ? post.content_ideas?.topic_ar
                          : post.content_ideas?.topic) ?? post.content_ideas?.topic}
                      </p>
                      <p className="line-clamp-3 text-xs text-muted-foreground">
                        {lang === "ar" ? post.body_ar : post.body_en}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
