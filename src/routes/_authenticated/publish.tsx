import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { postsQuery, type PostRow } from "@/lib/queries";
import { setHumanApproval } from "@/lib/testing.functions";

export const Route = createFileRoute("/_authenticated/publish")({
  head: () => ({
    meta: [
      { title: "Approvals & publish queue — Steinheim AI Marketing" },
      {
        name: "description",
        content:
          "AI-recommended Steinheim posts awaiting human approval, and the approved publish queue.",
      },
      { property: "og:title", content: "Approvals & publish queue — Steinheim AI Marketing" },
      {
        property: "og:description",
        content:
          "AI-recommended Steinheim posts awaiting human approval, and the approved publish queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublishPage,
});

type Post = PostRow & {
  ai_approved?: boolean;
  ai_recommendation?: string | null;
  is_test?: boolean;
};

function PublishPage() {
  const { t, lang } = useI18n();
  const posts = useQuery(postsQuery);
  const qc = useQueryClient();
  const approveFn = useServerFn(setHumanApproval);

  const approve = useMutation({
    mutationFn: (vars: { postId: string; approve: boolean }) => approveFn({ data: vars }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = (posts.data ?? []) as Post[];
  const live = all.filter((p) => !p.is_test);
  const awaiting = live.filter(
    (p) => p.status === "ai_approved" || (p.ai_approved && p.status === "reviewed"),
  );
  const approved = live.filter((p) => p.status === "approved" || p.status === "published");

  const card = (post: Post, actions: boolean) => (
    <Card key={post.id} className="h-full">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="capitalize">
            {post.platform}
          </Badge>
          <div className="flex items-center gap-2">
            {post.review_score != null && <Badge variant="outline">{post.review_score}/100</Badge>}
            <Badge variant="secondary">{post.status}</Badge>
          </div>
        </div>
        {post.ai_recommendation && (
          <p className="text-xs text-accent-foreground/80">{post.ai_recommendation}</p>
        )}
        <Link to="/posts/$postId" params={{ postId: post.id }}>
          <p className="line-clamp-4 text-sm text-muted-foreground hover:text-foreground">
            {lang === "ar" ? post.body_ar : post.body_en}
          </p>
        </Link>
        {actions && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={approve.isPending}
              onClick={() => approve.mutate({ postId: post.id, approve: true })}
            >
              Human approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={approve.isPending}
              onClick={() => approve.mutate({ postId: post.id, approve: false })}
            >
              Send back
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl">{t("publish")}</h1>
        <p className="text-sm text-muted-foreground">
          The AI only recommends. Nothing enters the publish queue until a human approves it.
        </p>
      </div>
      {posts.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

      <section className="space-y-3">
        <h2 className="font-serif text-xl">
          AI approved — awaiting human approval ({awaiting.length})
        </h2>
        {awaiting.length === 0 && !posts.isLoading && (
          <p className="text-sm text-muted-foreground">{t("noData")}</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">{awaiting.map((p) => card(p, true))}</div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl">Human approved — publish queue ({approved.length})</h2>
        {approved.length === 0 && !posts.isLoading && (
          <p className="text-sm text-muted-foreground">{t("noData")}</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">{approved.map((p) => card(p, false))}</div>
      </section>
    </div>
  );
}
