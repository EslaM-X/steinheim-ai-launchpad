import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  storage_path: z.string().nullish(),
  external_url: z.string().nullish(),
  model_used: z.string().nullish(),
  error: z.string().nullish(),
  meta: z.record(z.string(), z.unknown()).nullish(),
});

/** The worker reports the finished asset back into the Truth/Assets plane. */
export const Route = createFileRoute("/api/public/creative/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CREATIVE_WORKER_SECRET"];
        if (!secret) return new Response("Worker channel not configured", { status: 503 });
        if (request.headers.get("x-worker-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: job } = await supabaseAdmin
          .from("generation_jobs")
          .select("*")
          .eq("id", body.job_id)
          .maybeSingle();
        if (!job) return new Response("Unknown job", { status: 404 });

        if (body.status === "failed") {
          await supabaseAdmin
            .from("generation_jobs")
            .update({
              status: "failed",
              error: body.error ?? "worker failure",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          return Response.json({ ok: true });
        }

        const { data: asset } = await supabaseAdmin
          .from("creative_assets")
          .insert({
            campaign_id: job.campaign_id,
            shot_id: job.shot_id,
            asset_type: job.kind === "i2v" ? "video" : job.kind === "image" ? "image" : job.kind,
            storage_path: body.storage_path ?? null,
            external_url: body.external_url ?? null,
            model_used: body.model_used ?? null,
            mode: job.mode,
            meta: (body.meta ?? {}) as never,
          })
          .select("id")
          .single();

        await supabaseAdmin
          .from("generation_jobs")
          .update({
            status: "done",
            result_asset_id: asset?.id ?? null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        if (job.shot_id && asset) {
          await supabaseAdmin
            .from("shots")
            .update(
              job.kind === "i2v"
                ? { video_asset_id: asset.id, status: "rendered" }
                : { image_asset_id: asset.id, status: "rendered" },
            )
            .eq("id", job.shot_id);
        }
        return Response.json({ ok: true, asset_id: asset?.id ?? null });
      },
    },
  },
});
