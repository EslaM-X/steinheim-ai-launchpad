import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The one button behind "Sync Steinheim Catalog".
 *
 * It runs the same connector n8n calls on a schedule, so a person pressing the
 * button and a cron firing overnight cannot drift apart. Authentication is the
 * user's own session — the automation secret never reaches the browser.
 */
export const syncSteinheimCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncCatalog } = await import("./catalog/steinheim.server");
    const summary = await syncCatalog(context.supabase as never);
    return {
      scanned: summary.scanned,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      archived: summary.archived ?? 0,
      claimsWritten: summary.claimsWritten,
      claimsStale: summary.claimsStale,
      failed: summary.failed.map((f) => `${f.slug}: ${f.error}`),
    };
  });

/** Last-run status for the catalogue card, so the page can say when it last ran. */
export const catalogSourceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as never as SourceReader)
      .from("catalog_sources")
      .select("base_url, status, last_sync_at, last_sync_status, last_sync_summary")
      .eq("name", "steinheim-official")
      .maybeSingle();
    if (!data) return null;
    return {
      baseUrl: String(data.base_url ?? ""),
      status: String(data.status ?? ""),
      lastSyncAt: data.last_sync_at ? String(data.last_sync_at) : null,
      lastSyncStatus: data.last_sync_status ? String(data.last_sync_status) : null,
      lastSyncSummary: JSON.stringify(data.last_sync_summary ?? null),
    };
  });

interface SourceRow {
  base_url: unknown;
  status: unknown;
  last_sync_at: unknown;
  last_sync_status: unknown;
  last_sync_summary: unknown;
}

interface SourceReader {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { maybeSingle: () => Promise<{ data: SourceRow | null }> };
    };
  };
}
