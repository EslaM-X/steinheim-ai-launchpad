import type { SupabaseClient } from "@supabase/supabase-js";

import { generateTodayPipeline, type StrategyBrief } from "./agents.pipeline";
import { evaluateScenario, type Expected, type PipelineResult } from "./testing";

type DB = SupabaseClient<any, "public", any>;

export type ScenarioRow = {
  id: string;
  key: string;
  suite: string;
  name: string;
  brief: StrategyBrief;
  expected: Expected;
};

export async function runScenario(
  supabase: DB,
  userId: string | null,
  scenario: ScenarioRow,
  batchId: string,
) {
  const started = Date.now();
  try {
    const result = await generateTodayPipeline(supabase, userId as string, scenario.brief, { isTest: true });
    const { checks, passed } = evaluateScenario(scenario.expected, result as unknown as PipelineResult);
    const row = {
      scenario_id: scenario.id,
      scenario_key: scenario.key,
      suite: scenario.suite,
      batch_id: batchId,
      idea_id: result.ideaId,
      final_score: result.score,
      raw_score: result.rawScore,
      band: result.band,
      penalties: result.penalties as never,
      hard_fail: result.hardFail,
      hard_fail_reasons: result.hardFailReasons as never,
      accuracy_passed: result.accuracyPassed,
      unverified_count: result.unverifiedClaims.length,
      similarity_score: result.similarity,
      revisions: result.revisions,
      checks: checks as never,
      passed,
      duration_ms: Date.now() - started,
      created_by: userId,
    };
    await supabase.from("test_runs").insert(row);
    return { scenario: scenario.key, passed, score: result.score, checks };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("test_runs").insert({
      scenario_id: scenario.id,
      scenario_key: scenario.key,
      suite: scenario.suite,
      batch_id: batchId,
      passed: false,
      error: message,
      duration_ms: Date.now() - started,
      created_by: userId,
    });
    return { scenario: scenario.key, passed: false, error: message, checks: [] };
  }
}

export async function runSuite(supabase: DB, userId: string | null, suite: string, onlyPending: boolean) {
  const { data, error } = await supabase
    .from("test_scenarios")
    .select("id, key, suite, name, brief, expected")
    .eq("suite", suite)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  let scenarios = (data ?? []) as ScenarioRow[];

  if (onlyPending) {
    const { data: done } = await supabase.from("test_runs").select("scenario_key").eq("passed", true);
    const passedKeys = new Set((done ?? []).map((d: { scenario_key: string }) => d.scenario_key));
    scenarios = scenarios.filter((s) => !passedKeys.has(s.key));
  }

  const batchId = crypto.randomUUID();
  const results = [];
  for (const scenario of scenarios) {
    // Sequential on purpose: each run must see the previous run's angles for originality.
    results.push(await runScenario(supabase, userId, scenario, batchId));
  }
  return { batchId, total: results.length, passed: results.filter((r) => r.passed).length, results };
}
