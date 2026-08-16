import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { audiencesQuery, brandQuery, projectsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge base — Steinheim AI Marketing" },
      {
        name: "description",
        content: "Brand voice, audiences and reference projects powering the agents.",
      },
      { property: "og:title", content: "Knowledge base — Steinheim AI Marketing" },
      {
        property: "og:description",
        content: "Brand voice, audiences and reference projects powering the agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const { t, lang } = useI18n();
  const brand = useQuery(brandQuery);
  const audiences = useQuery(audiencesQuery);
  const projects = useQuery(projectsQuery);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("knowledge")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">{t("brand")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {brand.isLoading && <p>{t("loading")}</p>}
          {brand.data && (
            <>
              <p className="text-foreground">{brand.data.positioning}</p>
              <p>{lang === "ar" ? brand.data.tone_of_voice_ar : brand.data.tone_of_voice}</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">{t("audiences")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audiences.data?.map((a) => (
              <div key={a.id} className="rounded-sm border border-border p-3">
                <p className="text-sm font-medium">
                  {lang === "ar" ? (a.name_ar ?? a.name) : a.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.pain_points ?? a.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projects.data?.map((p) => (
              <div key={p.id} className="rounded-sm border border-border p-3">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.description ?? p.location}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
