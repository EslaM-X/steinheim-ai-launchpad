/** Deterministic Gatekeeper scoring: the model judges, the code does the arithmetic. */

export const PENALTY_CODES = [
  "unverified_claim",
  "wrong_sku",
  "forbidden_claim",
  "platform_mismatch",
  "generic_ai_tone",
  "weak_cta",
  "poor_audience_relevance",
  "duplicate_angle",
  "platform_similarity",
] as const;

export type PenaltyCode = (typeof PENALTY_CODES)[number];

export const PENALTY_CATALOG: Record<
  PenaltyCode,
  { points: number; hardFail: boolean; label: string }
> = {
  unverified_claim: { points: 0, hardFail: true, label: "Unverified factual claim" },
  wrong_sku: { points: 0, hardFail: true, label: "Wrong or invented product / SKU" },
  forbidden_claim: { points: 0, hardFail: true, label: "Forbidden brand claim" },
  platform_mismatch: {
    points: 10,
    hardFail: false,
    label: "Post does not read native to its platform",
  },
  generic_ai_tone: { points: 8, hardFail: false, label: "Generic / AI-sounding copy" },
  weak_cta: { points: 5, hardFail: false, label: "Weak or vague CTA" },
  poor_audience_relevance: { points: 10, hardFail: false, label: "Poor audience relevance" },
  duplicate_angle: { points: 8, hardFail: false, label: "Duplicate / recycled strategic angle" },
  platform_similarity: { points: 8, hardFail: false, label: "Three platforms too similar" },
};

export function penaltyRulesPrompt(): string {
  return [
    "PENALTY CATALOG — report every penalty that applies, using these exact codes. Do NOT subtract points yourself; the system applies them.",
    ...Object.entries(PENALTY_CATALOG).map(
      ([code, p]) => `- ${code}: ${p.label} → ${p.hardFail ? "HARD FAIL" : `-${p.points}`}`,
    ),
  ].join("\n");
}

export type ScoreBand =
  | "exceptional"
  | "strong"
  | "pass_minor_revision"
  | "revision_required"
  | "fail";

export function scoreBand(score: number, hardFail: boolean): ScoreBand {
  if (hardFail) return "fail";
  if (score >= 95) return "exceptional";
  if (score >= 90) return "strong";
  if (score >= 85) return "pass_minor_revision";
  if (score >= 75) return "revision_required";
  return "fail";
}

export type AppliedPenalty = {
  code: PenaltyCode;
  points: number;
  hard_fail: boolean;
  reason: string;
};

export function applyPenalties(input: {
  components: Record<string, number>;
  penalties: Array<{ code: string; reason: string }>;
  extraHardFails?: string[];
}) {
  const raw = Object.values(input.components).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  const seen = new Set<string>();
  const applied: AppliedPenalty[] = [];
  for (const p of input.penalties) {
    const meta = PENALTY_CATALOG[p.code as PenaltyCode];
    if (!meta || seen.has(p.code)) continue;
    seen.add(p.code);
    applied.push({
      code: p.code as PenaltyCode,
      points: meta.points,
      hard_fail: meta.hardFail,
      reason: p.reason,
    });
  }
  const deduction = applied.reduce((s, p) => s + p.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw - deduction)));
  const hardFail = applied.some((p) => p.hard_fail) || (input.extraHardFails?.length ?? 0) > 0;
  return {
    rawScore: Math.round(raw),
    score,
    penalties: applied,
    hardFail,
    hardFailReasons: [
      ...applied.filter((p) => p.hard_fail).map((p) => `${p.code}: ${p.reason}`),
      ...(input.extraHardFails ?? []),
    ],
    band: scoreBand(score, hardFail),
  };
}
