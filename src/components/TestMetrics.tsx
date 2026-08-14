import { Card, CardContent } from "@/components/ui/card";
import type { ScenarioRow, TestRunRow } from "@/lib/queries";

type Props = { scenarios: ScenarioRow[]; runs: Map<string, TestRunRow> };

function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            tone === "good"
              ? "font-serif text-2xl text-primary"
              : tone === "bad"
                ? "font-serif text-2xl text-destructive"
                : "font-serif text-2xl"
          }
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export function TestMetrics({ scenarios, runs }: Props) {
  const executed = scenarios.filter((s) => runs.has(s.key));
  const rows = executed.map((s) => ({
    scenario: s,
    run: runs.get(s.key)!,
    expectHardFail: Boolean((s.expected as { expect_hard_fail?: boolean }).expect_hard_fail),
  }));
  if (rows.length === 0) return null;

  const total = rows.length;
  const passed = rows.filter((r) => r.run.passed).length;

  const shouldHardFail = rows.filter((r) => r.expectHardFail);
  const hardFailCorrect = shouldHardFail.filter((r) => r.run.hard_fail).length;

  const shouldPass = rows.filter((r) => !r.expectHardFail);
  const falseHardFail = shouldPass.filter((r) => r.run.hard_fail).length;
  const falsePositive = shouldPass.filter((r) => !r.run.passed && !r.run.hard_fail).length;

  const unverified = rows.reduce((a, r) => a + (r.run.unverified_count ?? 0), 0);

  const revised = rows.filter((r) => (r.run.revisions ?? 0) > 0);
  const revisedRecovered = revised.filter((r) => (r.run.final_score ?? 0) >= 85).length;

  const differentiated = rows.filter(
    (r) => !r.run.penalties.some((p) => p.code === "platform_similarity"),
  ).length;

  const scores = rows.map((r) => r.run.final_score ?? 0).filter(Boolean);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl">Evaluation report</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="1 · Functional pass rate"
          value={pct(passed, total)}
          detail={`${passed}/${total} scenarios · avg score ${avg}`}
          tone={passed === total ? "good" : "neutral"}
        />
        <Metric
          label="2 · Hard-fail precision"
          value={shouldHardFail.length ? pct(hardFailCorrect, shouldHardFail.length) : "n/a"}
          detail={`${hardFailCorrect}/${shouldHardFail.length} scenarios that must hard fail did`}
          tone={shouldHardFail.length && hardFailCorrect === shouldHardFail.length ? "good" : "bad"}
        />
        <Metric
          label="3 · False-positive rate"
          value={pct(falsePositive, shouldPass.length)}
          detail={`${falsePositive} valid scenarios rejected without a hard fail`}
          tone={falsePositive === 0 ? "good" : "bad"}
        />
        <Metric
          label="4 · Unverified claim rate"
          value={String(unverified)}
          detail="target 0 across all runs"
          tone={unverified === 0 ? "good" : "bad"}
        />
        <Metric
          label="5 · Revision effectiveness"
          value={revised.length ? pct(revisedRecovered, revised.length) : "n/a"}
          detail={`${revisedRecovered}/${revised.length} revised runs recovered to ≥85`}
          tone={revised.length && revisedRecovered / revised.length >= 0.7 ? "good" : "neutral"}
        />
        <Metric
          label="6 · Platform differentiation"
          value={pct(differentiated, total)}
          detail="runs with no platform_similarity penalty"
          tone={differentiated === total ? "good" : "neutral"}
        />
        <Metric
          label="7 · False hard fail"
          value={String(falseHardFail)}
          detail="valid scenarios wrongly hard failed — over-defensive signal"
          tone={falseHardFail === 0 ? "good" : "bad"}
        />
        <Metric
          label="Coverage"
          value={`${executed.length}/${scenarios.length}`}
          detail="scenarios executed at least once"
        />
      </div>
    </section>
  );
}
