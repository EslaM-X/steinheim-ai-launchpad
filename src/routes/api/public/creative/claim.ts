import { createFileRoute } from "@tanstack/react-router";

/** External GPU worker (ComfyUI) claims the next queued generation job. */
export const Route = createFileRoute("/api/public/creative/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CREATIVE_WORKER_SECRET"];
        if (!secret) return new Response("Worker channel not configured", { status: 503 });
        if (request.headers.get("x-worker-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { worker_id } = (await request.json().catch(() => ({}))) as { worker_id?: string };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: job } = await supabaseAdmin
          .from("generation_jobs")
          .select("*")
          .eq("status", "queued")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (!job) return Response.json({ job: null });

        const { data: claimed } = await supabaseAdmin
          .from("generation_jobs")
          .update({
            status: "running",
            worker_id: worker_id ?? "worker",
            claimed_at: new Date().toISOString(),
            attempts: (job.attempts ?? 0) + 1,
          })
          .eq("id", job.id)
          .eq("status", "queued")
          .select("*")
          .maybeSingle();

        return Response.json({ job: claimed ?? null });
      },
    },
  },
});
