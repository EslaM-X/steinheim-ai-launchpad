/** Test harness: declarative expectations checked against a pipeline result. */

export type Expected = {
  expected_content_type?: string;
  expected_audience?: string;
  expected_platform?: string;
  expect_hard_fail?: boolean;
  expected_claim_behavior?: string;
  expected_penalty?: string;
  require_disclaimer?: boolean;
  min_score?: number;
  max_unverified?: number;
  max_similarity?: number;
};

export type PipelineResult = {
  contentType: string;
  audienceName: string | null;
  score: number;
  hardFail: boolean;
  penaltyCodes: string[];
  similarity: number;
  accuracyPassed: boolean;
  unverifiedClaims: string[];
  copyText: string;
};

export type Check = { name: string; passed: boolean; detail: string };

const DISCLAIMER_HINTS = [
  "subject to confirmation",
  "pending confirmation",
  "to be confirmed",
  "not confirmed",
  "reference project",
  "قيد التأكيد",
  "بانتظار التأكيد",
];

const NOT_AVAILABLE_HINTS = [
  "not available in verified",
  "not published",
  "not specified",
  "available on request",
  "غير متاح",
  "غير محدد",
];

export function evaluateScenario(expected: Expected, r: PipelineResult): { checks: Check[]; passed: boolean } {
  const checks: Check[] = [];
  const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });

  if (expected.expected_content_type) {
    add(
      "content_type",
      r.contentType === expected.expected_content_type,
      `expected ${expected.expected_content_type}, got ${r.contentType}`,
    );
  }
  if (expected.expected_audience) {
    add(
      "audience",
      (r.audienceName ?? "").toLowerCase().includes(expected.expected_audience.toLowerCase()),
      `expected ${expected.expected_audience}, got ${r.audienceName ?? "none"}`,
    );
  }
  if (expected.expect_hard_fail !== undefined) {
    add(
      "hard_fail",
      r.hardFail === expected.expect_hard_fail,
      `expected hard_fail=${expected.expect_hard_fail}, got ${r.hardFail}`,
    );
  }
  if (expected.max_unverified !== undefined) {
    add(
      "unverified_claims",
      r.unverifiedClaims.length <= expected.max_unverified,
      `${r.unverifiedClaims.length} unverified (max ${expected.max_unverified})`,
    );
  }
  if (expected.min_score !== undefined) {
    add("min_score", r.score >= expected.min_score, `score ${r.score} (min ${expected.min_score})`);
  }
  if (expected.max_similarity !== undefined) {
    add(
      "originality",
      r.similarity <= expected.max_similarity,
      `similarity ${r.similarity.toFixed(2)} (max ${expected.max_similarity})`,
    );
  }
  if (expected.expected_penalty) {
    add(
      "penalty_detected",
      r.penaltyCodes.includes(expected.expected_penalty),
      `expected penalty ${expected.expected_penalty}; got ${r.penaltyCodes.join(", ") || "none"}`,
    );
  }
  if (expected.require_disclaimer) {
    const text = r.copyText.toLowerCase();
    add(
      "confirmation_disclaimer",
      DISCLAIMER_HINTS.some((h) => text.includes(h)),
      "copy must carry a project-confirmation disclaimer",
    );
  }
  if (expected.expected_claim_behavior?.includes("not available")) {
    const text = r.copyText.toLowerCase();
    add(
      "fact_gap_handling",
      NOT_AVAILABLE_HINTS.some((h) => text.includes(h)) || r.unverifiedClaims.length === 0,
      "missing specs must be stated as unavailable, never invented",
    );
  }

  return { checks, passed: checks.length > 0 && checks.every((c) => c.passed) };
}
