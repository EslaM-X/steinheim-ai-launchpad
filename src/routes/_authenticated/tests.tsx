import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TestMetrics } from "@/components/TestMetrics";
import { scenariosQuery, testRunsQuery, type TestRunRow } from "@/lib/queries";
import { runTestScenario, runTestSuite } from "@/lib/testing.functions";

export const Route = createFileRoute("/_authenticated/tests")({
  head: () => ({
    meta: [
      { title: "Test harness — Steinheim AI Marketing" },
      {
        name: "description",
        content: "Scenario matrix and red-team results for the Steinheim AI content pipeline.",
      },
      { property: "og:title", content: "Test harness — Steinheim AI Marketing" },
      {
        property: "og:description",
        content: "Scenario matrix and red-team results for the Steinheim AI content pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TestsPage,
});

function latestBy(runs: TestRunRow[]) {
  const map = new Map<string, TestRunRow>();
  for (const r of runs) if (!map.has(r.scenario_key)) map.set(r.scenario_key, r);
  return map;
}

function TestsPage() {
  const scenarios = useQuery(scenariosQuery);
  const runs = useQuery(testRunsQuery);
  const qc = useQueryClient();
  const runOne = useServerFn(runTestScenario);
  const runSuite = useServerFn(runTestSuite);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["test_runs"] });
    qc.invalidateQueries({ queryKey: ["posts"] });
  };

  const scenario = useMutation({
    mutationFn: (key: string) => runOne({ data: { key } }),
    onSuccess: (r) => {
      toast[r.passed ? "success" : "error"](`${r.scenario}: ${r.passed ? "PASS" : "FAIL"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyKey(null),
  });

  const suite = useMutation({
    mutationFn: (vars: { suite: "matrix" | "red_team"; onlyPending: boolean }) =>
      runSuite({ data: vars }),
    onSuccess: (r) => {
      toast.success(`${r.passed}/${r.total} scenarios passed`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyKey(null),
  });

  const latest = latestBy(runs.data ?? []);
  const all = scenarios.data ?? [];
  const suites: Array<{ id: "matrix" | "red_team"; label: string }> = [
    { id: "matrix", label: "Test Matrix" },
    { id: "red_team", label: "Red-Team Matrix" },
  ];

  const executed = all.filter((s) => latest.has(s.key));
  const passedCount = executed.filter((s) => latest.get(s.key)!.passed).length;
  const scores = executed.map((s) => latest.get(s.key)!.final_score ?? 0).filter(Boolean);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const unverified = executed.reduce((a, s) => a + (latest.get(s.key)!.unverified_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Test harness</h1>
          <p className="text-sm text-muted-foreground">
            Validated on {executed.length}/{all.length} scenarios · {passedCount} pass · avg score {avg} ·{" "}
            {unverified} unverified claims
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {suites.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              disabled={suite.isPending || scenario.isPending}
              onClick={() => {
                setBusyKey(s.id);
                suite.mutate({ suite: s.id, onlyPending: true });
              }}
            >
              {busyKey === s.id ? "Running…" : `Run pending ${s.label}`}
            </Button>
          ))}
        </div>
      </div>

      {suites.map((group) => (
        <section key={group.id} className="space-y-3">
          <h2 className="font-serif text-xl">{group.label}</h2>
          <div className="grid gap-3">
            {all
              .filter((s) => s.suite === group.id)
              .map((s) => {
                const run = latest.get(s.key);
                return (
                  <Card key={s.key}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{s.key}</Badge>
                          <span className="font-medium">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {run ? (
                            <>
                              <Badge variant={run.passed ? "secondary" : "destructive"}>
                                {run.passed ? "PASS" : "FAIL"}
                              </Badge>
                              {run.final_score != null && (
                                <Badge variant="outline">
                                  {run.final_score}/100 · raw {run.raw_score} · {run.band}
                                </Badge>
                              )}
                              {run.hard_fail && <Badge variant="destructive">HARD FAIL</Badge>}
                            </>
                          ) : (
                            <Badge variant="outline">not run</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={scenario.isPending || suite.isPending}
                            onClick={() => {
                              setBusyKey(s.key);
                              scenario.mutate(s.key);
                            }}
                          >
                            {busyKey === s.key ? "Running…" : "Run"}
                          </Button>
                        </div>
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      )}
                      {run && (
                        <div className="space-y-1 text-xs">
                          <p className="text-muted-foreground">
                            unverified {run.unverified_count} · similarity{" "}
                            {run.similarity_score?.toFixed?.(2) ?? "—"} · revisions {run.revisions} ·{" "}
                            {run.penalties.map((p) => p.code).join(", ") || "no penalties"}
                          </p>
                          {run.error && <p className="text-destructive">{run.error}</p>}
                          <ul className="space-y-0.5">
                            {run.checks.map((c) => (
                              <li key={c.name} className={c.passed ? "text-muted-foreground" : "text-destructive"}>
                                {c.passed ? "✓" : "✗"} {c.name} — {c.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
