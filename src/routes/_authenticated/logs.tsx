import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { runsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "Agent logs — Steinheim AI Marketing" },
      {
        name: "description",
        content: "Execution history for every Steinheim AI marketing agent run.",
      },
      { property: "og:title", content: "Agent logs — Steinheim AI Marketing" },
      {
        property: "og:description",
        content: "Execution history for every Steinheim AI marketing agent run.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const { t } = useI18n();
  const runs = useQuery(runsQuery);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("logs")}</h1>
      {runs.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {!runs.isLoading && (runs.data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      )}
      <div className="space-y-2">
        {runs.data?.map((run) => (
          <Card key={run.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <span className="font-medium capitalize">{run.agent}</span>
              <Badge variant={run.status === "error" ? "destructive" : "secondary"}>
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(run.created_at).toLocaleString()}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
