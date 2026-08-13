import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { postsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/publish")({
  head: () => ({
    meta: [
      { title: "Publish queue — Steinheim AI Marketing" },
      { name: "description", content: "Approved Steinheim posts ready to go live on social channels." },
      { property: "og:title", content: "Publish queue — Steinheim AI Marketing" },
      { property: "og:description", content: "Approved Steinheim posts ready to go live on social channels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublishPage,
});

function PublishPage() {
  const { t, lang } = useI18n();
  const posts = useQuery(postsQuery);
  const queue = (posts.data ?? []).filter((p) => p.status === "approved" || p.status === "reviewed");

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("publish")}</h1>
      {posts.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {!posts.isLoading && queue.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {queue.map((post) => (
          <Link key={post.id} to="/posts/$postId" params={{ postId: post.id }}>
            <Card className="h-full transition-colors hover:border-accent">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="capitalize">
                    {post.platform}
                  </Badge>
                  <Badge variant="secondary">{post.status}</Badge>
                </div>
                <p className="line-clamp-4 text-sm text-muted-foreground">
                  {lang === "ar" ? post.body_ar : post.body_en}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
