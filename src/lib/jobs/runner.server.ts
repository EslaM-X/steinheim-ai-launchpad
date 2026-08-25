/**
 * Runs work that outlives the request that asked for it.
 *
 * The contract is deliberately narrow: a caller gets an id back immediately and
 * the work continues in this process. That only holds where the process keeps
 * running after the response — a plain Node server. On a serverless platform
 * the function is frozen the moment it responds and the detached work simply
 * stops, half-finished, with no error anywhere. So the trigger endpoint belongs
 * on the Node box; a serverless front end calls it over HTTP rather than
 * hosting it.
 */

// Structural, not the generated Supabase type: the runner only needs a table
// reader and an RPC caller, and pinning it to the full client would make every
// caller cast.
type DB = {
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type JobKind =
  | "catalog_sync"
  | "daily_generation"
  | "campaign_render"
  | "plate_library";

export interface JobProgress {
  phase?: string;
  done?: number;
  total?: number;
}

export interface JobHandle {
  id: string;
  /** Records what the job is doing. Failures here never fail the job itself. */
  report: (progress: JobProgress) => Promise<void>;
}

export interface StartedJob {
  id: string;
  alreadyRunning: boolean;
  /**
   * Resolves when the run finishes, and only exists when the caller asked to
   * wait. Every trigger goes through the same bookkeeping either way, which is
   * what keeps the single-active guarantee honest: a scheduled run that waited
   * for its result still holds the slot against a manual one, and vice versa.
   */
  completion?: Promise<unknown>;
}

/** How long a job may go without writing before it is presumed dead. */
const STALE_AFTER = "3 minutes";
const HEARTBEAT_MS = 20_000;

/**
 * Marks jobs whose worker died as interrupted.
 *
 * Worth calling on boot: a job that was running when the process was killed
 * still holds the single-active slot, and would otherwise block every future
 * run on behalf of a process that no longer exists.
 */
export async function reapDeadJobs(supabase: DB): Promise<number> {
  const { data, error } = await supabase.rpc("reap_dead_jobs", { stale_after: STALE_AFTER });
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

export async function startJob(
  supabase: DB,
  options: {
    kind: JobKind;
    trigger: "manual" | "scheduled";
    requestedBy?: string | null;
    /** Wait for the run instead of returning as soon as it is accepted. */
    awaitCompletion?: boolean;
  },
  run: (job: JobHandle) => Promise<unknown>,
): Promise<StartedJob> {
  await reapDeadJobs(supabase);

  const now = new Date().toISOString();
  const { data: created, error } = await supabase
    .from("jobs")
    .insert({
      kind: options.kind,
      trigger: options.trigger,
      requested_by: options.requestedBy ?? null,
      status: "running",
      phase: "Starting",
      started_at: now,
      heartbeat_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    // The single-active index rejected this insert, which means a run is
    // already in flight. Returning its id lets the caller attach to the run in
    // progress instead of reporting a failure the user cannot act on.
    const { data: active } = await supabase
      .from("jobs")
      .select("id")
      .eq("kind", options.kind)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active?.id) return { id: String(active.id), alreadyRunning: true };
    throw new Error(
      `Could not start ${options.kind}: ${error ? String((error as { message?: string }).message ?? error) : "no row created"}`,
    );
  }

  const id = String(created.id);

  const handle: JobHandle = {
    id,
    report: async (progress) => {
      const patch: Record<string, unknown> = { heartbeat_at: new Date().toISOString() };
      if (progress.phase !== undefined) patch["phase"] = progress.phase;
      if (progress.done !== undefined) patch["progress_done"] = progress.done;
      if (progress.total !== undefined) patch["progress_total"] = progress.total;
      // Progress is a convenience, not the work. A write that fails here must
      // not take the run down with it.
      try {
        await supabase.from("jobs").update(patch).eq("id", id);
      } catch {
        /* ignore */
      }
    },
  };

  // The heartbeat runs even while the job is inside a long fetch, so silence
  // means a dead process rather than a slow one.
  const beat = setInterval(() => {
    void handle.report({});
  }, HEARTBEAT_MS);
  if (typeof beat === "object" && "unref" in beat) (beat as { unref: () => void }).unref();

  const completion = (async () => {
    try {
      const result = await run(handle);
      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          phase: "Completed",
          result: (result ?? null) as never,
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", id);
      return result;
    } catch (error) {
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          phase: "Failed",
          error: error instanceof Error ? error.message : String(error),
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", id);
      throw error;
    } finally {
      clearInterval(beat);
    }
  })();

  if (options.awaitCompletion) {
    return { id, alreadyRunning: false, completion: Promise.resolve(await completion) };
  }

  // Not awaited: the caller gets the id straight away and the run continues in
  // this process. An unhandled rejection here would take the process down, and
  // the failure is already recorded on the row, so it is swallowed.
  completion.catch(() => {});
  return { id, alreadyRunning: false };
}
