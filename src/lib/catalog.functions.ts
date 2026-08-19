import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Where the long work actually runs.
 *
 * Defaults to this same process, which is correct when everything is on one
 * box. When the front end is hosted somewhere with a request ceiling, set
 * WORKER_URL to the Node box: the trigger is a sub-second call either way, and
 * the minutes of work happen where nothing is going to cut them short.
 */
function workerBase(): string {
  return (process.env["WORKER_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Asks the worker to start a catalogue sync and returns immediately.
 *
 * Nothing here waits for the sync. The button gets a job id, the page follows
 * that id, and the run survives the tab being closed — which the previous
 * version did not: it held the request open for the whole sync, so a reload
 * lost both the progress and any way of knowing whether it had finished.
 */
export const startCatalogSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["AUTOMATION_SECRET"];
    if (!secret) throw new Error("AUTOMATION_SECRET is not set on the server.");

    const userId = (context as { userId?: string }).userId ?? "";
    const res = await fetch(`${workerBase()}/api/public/automation/catalog-sync?async=1&by=user`, {
      method: "POST",
      headers: {
        "x-automation-secret": secret,
        "x-automation-timestamp": String(Date.now()),
        "x-automation-nonce": `ui-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      signal: AbortSignal.timeout(30_000),
    });

    const body = (await res.json().catch(() => null)) as {
      jobId?: string;
      alreadyRunning?: boolean;
      error?: string;
    } | null;

    if (!res.ok || !body?.jobId) {
      throw new Error(body?.error ?? `The worker refused the request (HTTP ${res.status}).`);
    }
    return { jobId: body.jobId, alreadyRunning: body.alreadyRunning === true };
  });

export interface JobView {
  id: string;
  status: string;
  phase: string | null;
  done: number;
  total: number | null;
  error: string | null;
  result: string | null;
  finishedAt: string | null;
}

/**
 * Reads one job. This is the half the browser polls, and it only ever touches
 * the database — no page fetches, no model calls — so it stays a few
 * milliseconds regardless of how long the job itself runs.
 */
export const getJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { jobId?: unknown } | null)?.jobId;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid job id");
    return { jobId: id };
  })
  .handler(async ({ data, context }): Promise<JobView | null> => {
    const { data: row } = await (context.supabase as never as JobReader)
      .from("jobs")
      .select(
        "id, status, phase, progress_done, progress_total, error, result, finished_at, heartbeat_at",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (!row) return null;

    // A worker that was killed cannot mark its own job failed, so a row can sit
    // at 'running' forever. The database is corrected by reap_dead_jobs before
    // the next run starts; here the staleness is applied on read, so a page
    // left open stops spinning on a run that is never coming back.
    const beat = row.heartbeat_at ? Date.parse(String(row.heartbeat_at)) : 0;
    const stale = Date.now() - beat > STALE_JOB_MS;
    const rawStatus = String(row.status);
    const status =
      (rawStatus === "running" || rawStatus === "queued") && stale ? "interrupted" : rawStatus;

    return {
      id: String(row.id),
      status,
      phase: row.phase ? String(row.phase) : null,
      done: Number(row.progress_done ?? 0),
      total: row.progress_total == null ? null : Number(row.progress_total),
      error: row.error
        ? String(row.error)
        : status === "interrupted"
          ? "The worker stopped reporting; the run was cut short."
          : null,
      result: row.result == null ? null : JSON.stringify(row.result),
      finishedAt: row.finished_at ? String(row.finished_at) : null,
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

/** Matches reap_dead_jobs' own window, so the two cannot disagree. */
const STALE_JOB_MS = 3 * 60 * 1000;

interface JobRow {
  id: unknown;
  status: unknown;
  phase: unknown;
  progress_done: unknown;
  progress_total: unknown;
  error: unknown;
  result: unknown;
  finished_at: unknown;
  heartbeat_at: unknown;
}

interface Reader<Row> {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: Row | null }> };
    };
  };
}

type SourceReader = Reader<SourceRow>;
type JobReader = Reader<JobRow>;
