import { createFileRoute } from "@tanstack/react-router";

/**
 * Reads the official catalogue and writes it into the Truth Layer.
 *
 * Long-running by nature — it fetches one page per product — so n8n should call
 * it on a schedule rather than a person waiting on a button. `?limit=n` exists
 * for a quick smoke run against the first few products.
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
          const summary = await syncCatalog(supabase, limit ? { limit } : undefined);

          return json({
            ok: summary.failed.length === 0,
            ...summary,
            note: "Claims are written only from the page's own structured data; prose is never promoted to a fact.",
          });
        });
      },
    },
  },
});
