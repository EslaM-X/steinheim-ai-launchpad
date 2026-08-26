import { createFileRoute } from "@tanstack/react-router";

/**
 * Renders the product photograph that belongs with a post.
 *
 * The pipeline produces an image_prompt and nothing else, so posts have been
 * going out as text. This fills image_url from the campaign renderer — the real
 * plate, in the finish the copy names, fitted into a photographed room — rather
 * than from a text-to-image model, which would illustrate a verified claim with
 * an invented tap.
 *
 *   POST …/post-images?posts=<id>,<id>     these posts
 *   POST …/post-images?idea=<id>           every post of one idea
 *   POST …/post-images?pending=1           every approved post still missing one
 *   POST …/post-images?…&force=1           replace images that already exist
 *   POST …/post-images?…&async=1           return a job id and keep working
 */
export const Route = createFileRoute("/api/public/automation/post-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "post-images", async ({ supabase, url }) => {
          const force = url.searchParams.get("force") === "1";
          const ideaId = url.searchParams.get("idea");
          const pending = url.searchParams.get("pending") === "1";

          const explicit = (url.searchParams.get("posts") ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => /^[0-9a-f-]{36}$/i.test(id));

          let ids = explicit;

          if (ids.length === 0 && ideaId) {
            const { data } = await supabase.from("posts").select("id").eq("idea_id", ideaId);
            ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
          }

          if (ids.length === 0 && pending) {
            // Approved work only. Rendering images for drafts the gatekeeper
            // rejected spends minutes of libvips time on frames nobody will
            // ever see.
            //
            // force widens the selection rather than only overwriting: after a
            // fix to the renderer the posts that need redoing are precisely the
            // ones that already have an image, so a force that still filtered
            // on image_url IS NULL would always find nothing.
            let query = supabase
              .from("posts")
              .select("id")
              .eq("ai_approved", true)
              .eq("is_test", false);
            if (!force) query = query.is("image_url", null);
            const { data } = await query
              .order("created_at", { ascending: false })
              .limit(MAX_PER_CALL);
            ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
          }

          if (ids.length === 0) {
            return json(
              {
                error:
                  "Nothing to render. Pass posts=<id,…>, idea=<id>, or pending=1 for approved posts with no image.",
              },
              400,
            );
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
              kind: "post_images",
              trigger: url.searchParams.get("by") ? "manual" : "scheduled",
              awaitCompletion: !detached,
            },
            async (job) => {
              const { attachImageToPost } = await import("@/lib/creative/post-image.server");

              const results = [];
              let done = 0;
              for (const id of ids) {
                await job.report({
                  phase: `Rendering ${id.slice(0, 8)}`,
                  done,
                  total: ids.length,
                });
                done += 1;
                try {
                  results.push(await attachImageToPost(supabase as never, id, { force }));
                } catch (error) {
                  results.push({
                    postId: id,
                    ok: false,
                    reason: error instanceof Error ? error.message : String(error),
                  });
                }
              }

              await job.report({ phase: "Complete", done: ids.length, total: ids.length });
              return {
                rendered: results.filter((r) => r.ok).length,
                skipped: results.filter((r) => !r.ok).length,
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
              { ok: false, jobId: started.id, error: "Images are already being rendered." },
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
 * Each frame is several seconds of libvips work at full resolution, so a
 * careless request could hold the worker for an hour. A day's run produces
 * three or four posts, so this ceiling never binds in practice.
 */
const MAX_PER_CALL = 12;
