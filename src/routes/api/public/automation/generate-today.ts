import { createFileRoute } from "@tanstack/react-router";

/**
 * Runs the daily content cycle. n8n calls this on a cron; the pipeline itself is
 * untouched — this is only a secured front door to it.
 *
 * Deliberately takes no strategy brief: the daily run is the strategist's own
 * decision, and letting an automation caller steer it would move editorial
 * control out of the system that reasons about rotation and originality.
 */
export const Route = createFileRoute("/api/public/automation/generate-today")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "generate-today", async ({ supabase }) => {
          const { generateTodayPipeline } = await import("@/lib/agents.pipeline");
          // created_by on the generated idea; null when no automation user is set.
          const userId = process.env["AUTOMATION_USER_ID"] ?? null;

          const result = await generateTodayPipeline(supabase as never, userId as string);

          // Push the approval queue to Telegram. A messaging outage must never
          // fail a generation run that already succeeded.
          let notified = false;
          try {
            const { pushPendingApprovals } = await import("@/lib/automation/telegram.server");
            notified = await pushPendingApprovals(supabase);
          } catch (error) {
            console.error("[automation] Telegram notification failed", error);
          }

          return json({
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
            awaitingHumanApproval: result.aiApproved,
          });
        });
      },
    },
  },
});
