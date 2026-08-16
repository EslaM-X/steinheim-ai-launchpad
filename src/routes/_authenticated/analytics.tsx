import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { analyticsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Steinheim AI Marketing" },
      {
        name: "description",
        content: "Reach and engagement performance for published Steinheim posts.",
      },
      { property: "og:title", content: "Analytics — Steinheim AI Marketing" },
      {
        property: "og:description",
        content: "Reach and engagement performance for published Steinheim posts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t } = useI18n();
  const rows = useQuery(analyticsQuery);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("analytics")}</h1>
      {rows.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {!rows.isLoading && (rows.data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      )}
      <div className="space-y-2">
        {rows.data?.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
              <span className="text-muted-foreground">{row.measured_on}</span>
              <span className="capitalize">{row.posts?.platform}</span>
              <span>{row.impressions ?? 0} impressions</span>
              <span>{row.engagements ?? 0} engagements</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
