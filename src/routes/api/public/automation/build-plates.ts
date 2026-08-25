import { createFileRoute } from "@tanstack/react-router";

/**
 * Builds the canonical plate for every product in every finish it is sold in.
 *
 * Run once after a catalogue sync, and again whenever the plating curves
 * change. Everything downstream reads plates rather than the catalogue's own
 * photographs, so this is the step that decides what the brand looks like.
 *
 * `?product=<uuid>` limits it to one product; `?async=1` returns a job id.
 */
export const Route = createFileRoute("/api/public/automation/build-plates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "build-plates", async ({ supabase, url }) => {
          const productId = url.searchParams.get("product");
          const { buildPlateLibrary } = await import("@/lib/creative/render/plates.server");
          const { startJob } = await import("@/lib/jobs/runner.server");

          const detached = url.searchParams.get("async") === "1";
          const started = await startJob(
            supabase,
            {
              kind: "plate_library",
              trigger: url.searchParams.get("by") ? "manual" : "scheduled",
              awaitCompletion: !detached,
            },
            (job) =>
              buildPlateLibrary(supabase as never, {
                ...(productId ? { productId } : {}),
                onProgress: (p) => job.report(p),
              }),
          );

          if (detached) {
            return json(
              { ok: true, jobId: started.id, alreadyRunning: started.alreadyRunning },
              202,
            );
          }
          if (started.alreadyRunning) {
            return json(
              { ok: false, jobId: started.id, error: "A plate build is already running." },
              409,
            );
          }

          const summary = (await started.completion) as {
            products: number;
            plates: number;
            skipped: number;
            failed: unknown[];
            results: unknown[];
          };
          return json({
            ok: summary.failed.length === 0,
            jobId: started.id,
            products: summary.products,
            plates: summary.plates,
            skipped: summary.skipped,
            failed: summary.failed,
          });
        });
      },
    },
  },
});
