import { createFileRoute } from "@tanstack/react-router";

/**
 * Renders a product's campaign assets and stores them.
 *
 * Long by nature — one composite per finish, then a video cut from them — so it
 * follows the same rule as every other long job here: `?async=1` returns a job
 * id and keeps working, and the default waits.
 *
 * `?product=<uuid>` picks the product. Everything else about the output is
 * derived from the catalogue row, so an asset set can only ever show finishes
 * the official site actually lists.
 */
export const Route = createFileRoute("/api/public/automation/render-campaign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "render-campaign", async ({ supabase, url }) => {
          const productId = url.searchParams.get("product");
          if (!productId) return json({ error: "product is required" }, 400);

          const palette = url.searchParams.get("palette") ?? "porcelain";
          const formatParam = url.searchParams.get("format") ?? "square";
          const format = (["square", "story", "landscape"] as const).includes(formatParam as never)
            ? (formatParam as "square" | "story" | "landscape")
            : "square";
          const motion = url.searchParams.get("motion") !== "0";

          const { renderCampaignForProduct } =
            await import("@/lib/creative/render/campaign.server");
          const { startJob } = await import("@/lib/jobs/runner.server");

          const detached = url.searchParams.get("async") === "1";
          const started = await startJob(
            supabase,
            {
              kind: "campaign_render",
              trigger: url.searchParams.get("by") ? "manual" : "scheduled",
              awaitCompletion: !detached,
            },
            async (job) => {
              await job.report({ phase: `Rendering ${format} in ${palette}` });
              return renderCampaignForProduct(supabase as never, {
                productId,
                palette,
                format,
                motion,
                scene: url.searchParams.get("scene"),
              });
            },
          );

          if (detached) {
            return json(
              { ok: true, jobId: started.id, alreadyRunning: started.alreadyRunning },
              202,
            );
          }
          if (started.alreadyRunning) {
            return json(
              { ok: false, jobId: started.id, error: "A render is already running." },
              409,
            );
          }
          return json({ ok: true, jobId: started.id, ...((await started.completion) as object) });
        });
      },
    },
  },
});
