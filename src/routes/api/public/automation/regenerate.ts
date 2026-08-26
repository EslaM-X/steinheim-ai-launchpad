import { createFileRoute } from "@tanstack/react-router";

/**
 * Rewrites posts the gatekeeper held back.
 *
 * The gatekeeper parking anything under its threshold at needs_revision is
 * correct, but it left no way forward from a phone: the only option was another
 * full daily run on a different topic, throwing away an idea whose claims had
 * already passed the truth layer. This asks the writer for another attempt at
 * the same idea, and the gatekeeper judges the result exactly as before.
 *
 * The pipeline is untouched. This calls the same regeneration the Creative
 * Studio button calls, with the same review afterwards — a rewrite that skipped
 * the gatekeeper would be a way of publishing rejected work by asking twice.
 *
 *   POST …/regenerate?posts=<id>,<id>       rewrite these
 *   POST …/regenerate?posts=<id>&async=1    return a job id and keep working
 */
export const Route = createFileRoute("/api/public/automation/regenerate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "regenerate", async ({ supabase, url }) => {
          const raw = url.searchParams.get("posts") ?? "";
          const ids = raw
            .split(",")
            .map((id) => id.trim())
            .filter((id) => /^[0-9a-f-]{36}$/i.test(id));

          if (ids.length === 0) {
            return json({ error: "posts is required: one or more post ids, comma separated" }, 400);
          }
          if (ids.length > MAX_PER_CALL) {
            return json(
              { error: `Too many posts: ${ids.length}. At most ${MAX_PER_CALL} per call.` },
              400,
            );
          }

          const { startJob } = await import("@/lib/jobs/runner.server");
          const detached = url.searchParams.get("async") === "1";

          const started = await startJob(
            supabase,
            {
              kind: "post_rewrite",
              trigger: url.searchParams.get("by") ? "manual" : "scheduled",
              awaitCompletion: !detached,
            },
            async (job) => {
              const { regeneratePostCopy, reviewSinglePost } = await import("@/lib/agents.actions");
              // Imported rather than copied. The pipeline exports its threshold,
              // and a rewrite judged by a different bar than the run that
              // produced it would be indefensible - a second number that drifts
              // is how that happens.
              const { PASS_SCORE } = await import("@/lib/agents.pipeline");

              const results: Array<{
                id: string;
                ok: boolean;
                score?: number;
                passed?: boolean;
                error?: string;
              }> = [];
              let done = 0;

              for (const id of ids) {
                await job.report({ phase: `Rewriting ${id.slice(0, 8)}`, done, total: ids.length });
                done += 1;
                try {
                  await regeneratePostCopy(supabase as never, id);
                  // Reviewed straight after, so the gatekeeper's verdict is
                  // current rather than left over from the rejected draft.
                  const review = (await reviewSinglePost(supabase as never, id)) as {
                    score?: number;
                    hard_fail?: boolean;
                  };

                  // reviewSinglePost writes the score and the status but never
                  // ai_approved — that flag is set by the pipeline's own gate,
                  // and it is what the approval queue reads. Without applying it
                  // here a rewrite could score 96 and still never reach anyone:
                  // observed, on the first post this feature ever fixed.
                  //
                  // The rule is the pipeline's, not a new one. A rewrite that
                  // used a softer bar would be a way of publishing rejected work
                  // by asking twice.
                  const score = review?.score ?? 0;
                  const passed = !review?.hard_fail && score >= PASS_SCORE;
                  await supabase
                    .from("posts")
                    .update({
                      status: passed ? "ai_approved" : "needs_revision",
                      ai_approved: passed,
                      ai_approved_at: passed ? new Date().toISOString() : null,
                      ai_recommendation: passed
                        ? `Rewritten and cleared review (${Math.round(score)}/100). Awaiting human approval.`
                        : `Rewritten but still below the bar (${Math.round(score)}/100).`,
                    })
                    .eq("id", id);

                  results.push({ id, ok: true, score: Math.round(score), passed });
                } catch (error) {
                  results.push({
                    id,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              }

              await job.report({ phase: "Complete", done: ids.length, total: ids.length });
              return {
                rewritten: results.filter((r) => r.ok).length,
                cleared: results.filter((r) => r.passed).length,
                failed: results.filter((r) => !r.ok).length,
                results,
              };
            },
          );

          if (detached) {
            return json(
              {
                ok: true,
                jobId: started.id,
                alreadyRunning: started.alreadyRunning,
                posts: ids.length,
              },
              202,
            );
          }
          if (started.alreadyRunning) {
            return json(
              { ok: false, jobId: started.id, error: "A rewrite is already running." },
              409,
            );
          }
          return json({ ok: true, jobId: started.id, ...((await started.completion) as object) });
        });
      },
    },
  },
});

/**
 * A rewrite is a model call per post, so a careless request could occupy the
 * worker for an hour. The gatekeeper rejects a whole idea's posts together —
 * three or four at a time — so this ceiling never binds in practice.
 */
const MAX_PER_CALL = 12;
