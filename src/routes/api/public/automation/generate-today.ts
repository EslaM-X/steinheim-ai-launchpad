import { createFileRoute } from "@tanstack/react-router";

/** Control-flow marker: a verification run skips the Telegram announcement. */
class SkipNotification extends Error {}

/** The shape the endpoint reads back off the pipeline. */
interface PipelineResult {
  ideaId: string;
  topic: string;
  contentType: string;
  audienceName: string;
  productSku: string | null;
  score: number;
  band: string;
  aiApproved: boolean;
  hardFail: boolean;
  unverifiedClaims: unknown[];
  revisions: number;
  /** Added by this endpoint after the pipeline returns, never by the pipeline. */
  images?: ImageSummary;
}

/** What the photography step did, reported alongside the run rather than instead of it. */
interface ImageSummary {
  attempted: number;
  rendered: number;
  finishes?: string[];
  skipped?: Array<{ post: string; reason: string }>;
  error?: string;
}

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
          const { startJob } = await import("@/lib/jobs/runner.server");
          // created_by on the generated idea; null when no automation user is set.
          const userId = process.env["AUTOMATION_USER_ID"] ?? null;

          const detached = url.searchParams.get("async") === "1";

          // The pipeline is untouched; only its lifetime changes. A run takes
          // minutes, and a caller that hangs up used to abort it mid-write —
          // observed on a run that had already recovered from a provider
          // failover. Owning a job row also stops two pipelines writing the
          // same day, which would leave two ideas each believing it is today's.
          const started = await startJob(
            supabase,
            {
              kind: "daily_generation",
              trigger: url.searchParams.get("by") ? "manual" : "scheduled",
              awaitCompletion: !detached,
            },
            async (job) => {
              await job.report({ phase: verification ? "Verification run" : "Generating" });
              const pipeline = await generateTodayPipeline(
                supabase as never,
                userId as string,
                undefined,
                { isTest: verification },
              );

              // The pipeline writes an image_prompt and stops, which is why
              // posts have been going out as text. Rendering here rather than
              // inside it keeps the pipeline untouched: this reads what it
              // wrote and fills image_url from the catalogue's own plates.
              //
              // Deliberately not fatal. The copy is the valuable output, and
              // discarding a post that scored 97 because libvips failed on a
              // frame would be the wrong trade every time.
              const images: ImageSummary = { attempted: 0, rendered: 0 };
              if (pipeline?.ideaId) {
                try {
                  await job.report({ phase: "Rendering product photography" });
                  const { attachImagesForIdea } = await import("@/lib/creative/post-image.server");
                  const rendered = await attachImagesForIdea(
                    supabase as never,
                    pipeline.ideaId as string,
                  );
                  const ok = rendered.filter((r) => r.ok);
                  images.attempted = rendered.length;
                  images.rendered = ok.length;
                  images.finishes = ok.map((r) => r.finish ?? "?");
                  const failed = rendered.filter((r) => !r.ok);
                  if (failed.length) {
                    images.skipped = failed.map((r) => ({
                      post: r.postId,
                      reason: r.reason ?? "unknown",
                    }));
                  }
                } catch (error) {
                  images.error = error instanceof Error ? error.message : String(error);
                }
              }

              return { ...pipeline, images };
            },
          );

          if (detached) {
            return json(
              {
                ok: true,
                mode: verification ? "verification" : "production",
                jobId: started.id,
                alreadyRunning: started.alreadyRunning,
              },
              202,
            );
          }

          if (started.alreadyRunning) {
            return json(
              {
                ok: false,
                jobId: started.id,
                alreadyRunning: true,
                error: "A generation is already running.",
              },
              409,
            );
          }

          const result = (await started.completion) as PipelineResult;

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
            images: result.images ?? null,
            jobId: started.id,
          });
        });
      },
    },
  },
});
