import { createFileRoute } from "@tanstack/react-router";

/**
 * Reads the official catalogue and writes it into the Truth Layer.
 *
 * Two response styles over one mechanism. Both create a job:
 *
 *   POST …/catalog-sync            waits and returns the summary. n8n wants
 *                                  this — it schedules the run and reports what
 *                                  changed, and reaching the app over the
 *                                  internal network it has no request ceiling.
 *
 *   POST …/catalog-sync?async=1    returns 202 with a job id and keeps working.
 *                                  A browser wants this: the run outlives the
 *                                  tab, and a front end with a request ceiling
 *                                  never holds a connection open for minutes.
 *
 * Routing both through the job runner is what makes "one sync at a time" a real
 * guarantee rather than a UI convention. A scheduled run and a button press
 * contend for the same slot, so they cannot interleave writes over the same
 * catalogue — which is exactly how a corrected price quietly reverts.
 *
 * `?limit=n` exists for a quick smoke run against the first few products.
 */
export const Route = createFileRoute("/api/public/automation/catalog-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "catalog-sync", async ({ supabase, url }) => {
          const raw = Number(url.searchParams.get("limit"));
          const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : undefined;

          const { syncCatalog } = await import("@/lib/catalog/steinheim.server");
          const { startJob } = await import("@/lib/jobs/runner.server");

          const detached = url.searchParams.get("async") === "1";

          const started = await startJob(
            supabase,
            {
              kind: "catalog_sync",
              trigger: url.searchParams.get("by") ? "manual" : "scheduled",
              awaitCompletion: !detached,
            },
            (job) =>
              syncCatalog(supabase, {
                ...(limit ? { limit } : {}),
                onProgress: (p) => job.report({ phase: p.phase, done: p.done, total: p.total }),
              }),
          );

          if (detached) {
            return json(
              { ok: true, jobId: started.id, alreadyRunning: started.alreadyRunning },
              202,
            );
          }

          if (started.alreadyRunning) {
            // Refusing beats queueing: n8n reports a skipped run, and nobody is
            // left wondering why two syncs produced one summary.
            return json(
              {
                ok: false,
                jobId: started.id,
                alreadyRunning: true,
                error: "A sync is already running.",
              },
              409,
            );
          }

          const summary = (await started.completion) as { failed: unknown[] } & Record<
            string,
            unknown
          >;
          return json({
            ok: summary.failed.length === 0,
            jobId: started.id,
            ...summary,
            note: "Claims are written only from the page's own structured data; prose is never promoted to a fact.",
          });
        });
      },
    },
  },
});
