import { createFileRoute } from "@tanstack/react-router";

/** Control-flow marker: a verification run skips the Telegram announcement. */
class SkipNotification extends Error {}

/**
 * Runs the daily content cycle. n8n calls this on a cron; the pipeline itself is
 * untouched — this is only a secured front door to it.
 *
 * Deliberately takes no strategy brief: the daily run is the strategist's own
 * decision, and letting an automation caller steer it would move editorial
 * control out of the system that reasons about rotation and originality.
 *
 * `?mode=verification` runs the identical pipeline but marks the output as a
 * test run, which every publish queue already filters out. It proves the whole
 * chain — truth, writers, accuracy, gatekeeper, storage — without putting a
 * first-ever run one human click away from a live channel.
 */
export const Route = createFileRoute("/api/public/automation/generate-today")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "generate-today", async ({ supabase, url }) => {
          const verification = url.searchParams.get("mode") === "verification";
          const { generateTodayPipeline } = await import("@/lib/agents.pipeline");
          // created_by on the generated idea; null when no automation user is set.
          const userId = process.env["AUTOMATION_USER_ID"] ?? null;

          const result = await generateTodayPipeline(
            supabase as never,
            userId as string,
            undefined,
            {
              isTest: verification,
            },
          );

          // A verification run has nothing to approve, so it announces nothing.
          let notified = false;
          try {
            if (verification) throw new SkipNotification();
            const { pushPendingApprovals } = await import("@/lib/automation/telegram.server");
            notified = await pushPendingApprovals(supabase);
          } catch (error) {
            if (!(error instanceof SkipNotification)) {
              console.error("[automation] Telegram notification failed", error);
            }
          }

          return json({
            mode: verification ? "verification" : "production",
            notified,
            ideaId: result.ideaId,
            topic: result.topic,
            contentType: result.contentType,
            audience: result.audienceName,
            productSku: result.productSku,
            score: result.score,
            band: result.band,
            aiApproved: result.aiApproved,
            hardFail: result.hardFail,
            unverifiedClaims: result.unverifiedClaims.length,
            revisions: result.revisions,
            // Posts land as ai_approved at best — a human still has to approve.
            // A verification run is excluded from every publish queue by design.
            awaitingHumanApproval: verification ? false : result.aiApproved,
          });
        });
      },
    },
  },
});
