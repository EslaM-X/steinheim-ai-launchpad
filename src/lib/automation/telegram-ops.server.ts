/**
 * The operational half of the Telegram command centre.
 *
 * Approvals already worked from a phone; running the system did not — a
 * catalogue sync, a generation or a campaign render each meant opening the site
 * or n8n. These commands close that gap, so the whole pipeline can be driven
 * from the chat that already carries the approvals.
 *
 * Every command here starts a job rather than doing the work. The operations
 * take minutes, Telegram expects a webhook answered in seconds, and a bot that
 * blocks while a catalogue is read looks broken long before it looks slow. The
 * reply carries a job id, and /jobs reports on it.
 */

type DB = {
  from: (table: string) => any;
};

export interface OpsContext {
  supabase: DB;
  /** Who asked, so a manual run is distinguishable from a scheduled one. */
  telegramId: string;
}

export interface OpsReply {
  text: string;
  /** Set when the command started something worth following. */
  jobId?: string;
}

/**
 * Reaches the automation endpoints over the loopback interface.
 *
 * The bot runs inside the app it is driving, so this could call the functions
 * directly. Going through the HTTP surface keeps one code path: the guard, the
 * job runner and the single-active rule all apply to a Telegram-triggered run
 * exactly as they do to n8n's, and a command cannot quietly bypass a check that
 * protects a scheduled run.
 */
async function callAutomation(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const secret = process.env["AUTOMATION_SECRET"];
  if (!secret) throw new Error("AUTOMATION_SECRET is not set.");
  const base = (process.env["WORKER_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");

  const query = new URLSearchParams({ ...params, async: "1", by: "telegram" });
  const res = await fetch(`${base}/api/public/automation/${path}?${query}`, {
    method: "POST",
    headers: {
      "x-automation-secret": secret,
      "x-automation-timestamp": String(Date.now()),
      "x-automation-nonce": `tg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

function started(label: string, body: Record<string, unknown>): OpsReply {
  const jobId = typeof body["jobId"] === "string" ? body["jobId"] : undefined;
  if (body["alreadyRunning"] === true) {
    return {
      text: `⏳ <b>${label}</b> is already running.\nFollowing that run: <code>${jobId ?? "?"}</code>`,
      ...(jobId ? { jobId } : {}),
    };
  }
  return {
    text: [
      `▶️ <b>${label}</b> started.`,
      `Job: <code>${jobId ?? "?"}</code>`,
      "",
      "Send /jobs to see how it is going.",
    ].join("\n"),
    ...(jobId ? { jobId } : {}),
  };
}

function refused(label: string, status: number, body: Record<string, unknown>): OpsReply {
  const error = typeof body["error"] === "string" ? body["error"] : `HTTP ${status}`;
  return { text: `🔴 <b>${label}</b> could not start.\n${escape(error)}` };
}

export async function opsSync(): Promise<OpsReply> {
  const res = await callAutomation("catalog-sync", {});
  return res.ok
    ? started("Catalogue sync", res.body)
    : refused("Catalogue sync", res.status, res.body);
}

export async function opsGenerate(verification: boolean): Promise<OpsReply> {
  const res = await callAutomation("generate-today", verification ? { mode: "verification" } : {});
  const label = verification ? "Verification run" : "Daily generation";
  return res.ok ? started(label, res.body) : refused(label, res.status, res.body);
}

export async function opsPlates(productId?: string): Promise<OpsReply> {
  const res = await callAutomation("build-plates", productId ? { product: productId } : {});
  return res.ok
    ? started("Plate library", res.body)
    : refused("Plate library", res.status, res.body);
}

export interface RenderRequest {
  productQuery: string;
  palette: string;
  format: string;
  motion: boolean;
  /** "auto" fits the product into one of the brand's own photographed rooms. */
  scene?: string | null;
}

/**
 * Finds the product a person named in chat.
 *
 * Nobody types a UUID into Telegram. A name, a fragment of one or a SKU is
 * matched against the catalogue, and an ambiguous match lists the candidates
 * rather than guessing — rendering the wrong product is a slower failure than
 * being asked which one.
 */
export async function resolveProduct(
  supabase: DB,
  query: string,
): Promise<{ id: string; name: string } | { candidates: string[] } | null> {
  const term = query.trim();
  if (!term) return null;

  const { data } = await supabase
    .from("products")
    .select("id, name, sku, source_slug")
    .not("source_id", "is", null);

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    sku: string | null;
    source_slug: string | null;
  }>;
  const needle = term.toLowerCase();

  const exact = rows.filter(
    (r) =>
      r.sku?.toLowerCase() === needle ||
      r.source_slug?.toLowerCase() === needle ||
      r.name.toLowerCase() === needle,
  );
  if (exact.length === 1) return { id: exact[0]!.id, name: exact[0]!.name };

  const partial = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(needle) ||
      r.source_slug?.toLowerCase().includes(needle) ||
      r.sku?.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return { id: partial[0]!.id, name: partial[0]!.name };
  if (partial.length > 1) return { candidates: partial.slice(0, 8).map((r) => r.name) };
  return null;
}

export async function opsRender(supabase: DB, request: RenderRequest): Promise<OpsReply> {
  const found = await resolveProduct(supabase, request.productQuery);
  if (!found) {
    return { text: `🔍 No product matches “${escape(request.productQuery)}”.` };
  }
  if ("candidates" in found) {
    return {
      text: [
        `🔍 “${escape(request.productQuery)}” matches ${found.candidates.length} products:`,
        "",
        ...found.candidates.map((c) => `• ${escape(c)}`),
        "",
        "Send more of the name, or its SKU.",
      ].join("\n"),
    };
  }

  const res = await callAutomation("render-campaign", {
    product: found.id,
    palette: request.palette,
    format: request.format,
    motion: request.motion ? "1" : "0",
    ...(request.scene ? { scene: request.scene } : {}),
  });
  const label = `Render — ${found.name}`;
  return res.ok ? started(label, res.body) : refused(label, res.status, res.body);
}

/** Recent jobs, newest first. */
export async function opsJobs(supabase: DB): Promise<OpsReply> {
  const { data } = await supabase
    .from("jobs")
    .select("id, kind, status, phase, progress_done, progress_total, error, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { text: "No jobs have run yet." };

  const icon: Record<string, string> = {
    running: "⏳",
    queued: "⏳",
    succeeded: "✅",
    failed: "🔴",
    interrupted: "⚠️",
  };

  const lines = rows.map((j) => {
    const status = String(j["status"]);
    const total = j["progress_total"];
    const progress =
      typeof total === "number" && total > 0 ? ` ${j["progress_done"]}/${total}` : "";
    const detail =
      status === "failed" || status === "interrupted"
        ? `\n   ${escape(String(j["error"] ?? "").slice(0, 90))}`
        : j["phase"]
          ? `\n   ${escape(String(j["phase"]))}${progress}`
          : "";
    return `${icon[status] ?? "•"} <b>${escape(String(j["kind"]))}</b>${detail}`;
  });

  return { text: ["<b>Recent jobs</b>", "", ...lines].join("\n") };
}

/** What the catalogue currently holds, and when it was last read. */
export async function opsCatalogue(supabase: DB): Promise<OpsReply> {
  const { data: source } = await supabase
    .from("catalog_sources")
    .select("last_sync_at, last_sync_status, last_sync_summary")
    .eq("name", "steinheim-official")
    .maybeSingle();

  const { count: products } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .not("source_id", "is", null);
  const { count: claims } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("extracted_by", "catalog_sync")
    .eq("verified", true);

  const when = source?.last_sync_at
    ? new Date(String(source.last_sync_at)).toLocaleString("en-GB", { timeZone: "Africa/Cairo" })
    : "never";

  return {
    text: [
      "<b>Catalogue</b>",
      "",
      `Products: ${products ?? 0}`,
      `Verified claims: ${claims ?? 0}`,
      `Last synced: ${escape(when)}`,
      `Status: ${escape(String(source?.last_sync_status ?? "unknown"))}`,
      "",
      "/sync reads the official site again.",
    ].join("\n"),
  };
}

/**
 * Sends a rejected post back through the writer.
 *
 * The gatekeeper holds anything under its threshold at needs_revision, which is
 * correct — but until now that was a dead end from a phone: the only way
 * forward was another full daily run, on a different topic, discarding work
 * that had already passed the truth layer. This asks for another attempt at the
 * same idea.
 */
export async function opsRetry(supabase: DB, target: string): Promise<OpsReply> {
  const wanted = target.trim().toLowerCase();

  const { data } = await supabase
    .from("posts")
    .select("id, platform, status, review_score, idea_id, is_test")
    .eq("status", "needs_revision")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as Array<{
    id: string;
    platform: string;
    status: string;
    review_score: number | null;
    idea_id: string | null;
    is_test: boolean;
  }>;

  if (rows.length === 0) {
    return { text: "Nothing is sitting at needs_revision." };
  }

  // "all" is the common case: the gatekeeper rejects a whole idea's posts
  // together, because they share the claims that scored badly.
  const chosen =
    wanted === "all" || wanted === ""
      ? rows
      : rows.filter((r) => r.id.startsWith(wanted) || r.platform.toLowerCase() === wanted);

  if (chosen.length === 0) {
    return {
      text: [
        `No rejected post matches "${escape(target)}".`,
        "",
        ...rows
          .slice(0, 6)
          .map(
            (r) =>
              `• <code>${r.id.slice(0, 8)}</code> ${escape(r.platform)} — ${r.review_score ?? "?"}/100`,
          ),
        "",
        "Send /retry all, or /retry &lt;platform&gt;, or /retry &lt;id&gt;.",
      ].join("\n"),
    };
  }

  const res = await callAutomation("regenerate", {
    posts: chosen.map((r) => r.id).join(","),
  });
  const label = `Rewrite — ${chosen.length} post${chosen.length === 1 ? "" : "s"}`;
  return res.ok ? started(label, res.body) : refused(label, res.status, res.body);
}

/**
 * Stops a job that should not have been started.
 *
 * Marks it cancelled rather than killing the process: the worker checks the row
 * and stops at its next step. A half-written campaign is worse than one that
 * finishes and is ignored, so nothing is torn out mid-write.
 */
export async function opsStop(supabase: DB, target: string): Promise<OpsReply> {
  const { data } = await supabase
    .from("jobs")
    .select("id, kind, status, phase")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false });

  const running = (data ?? []) as Array<{
    id: string;
    kind: string;
    status: string;
    phase: string | null;
  }>;

  if (running.length === 0) return { text: "Nothing is running." };

  const wanted = target.trim().toLowerCase();
  const chosen =
    wanted === "" || wanted === "all"
      ? running
      : running.filter((j) => j.id.startsWith(wanted) || j.kind.toLowerCase() === wanted);

  if (chosen.length === 0) {
    return {
      text: [
        `Nothing running matches "${escape(target)}".`,
        "",
        ...running.map(
          (j) => `• <code>${j.id.slice(0, 8)}</code> ${escape(j.kind)} — ${escape(j.phase ?? "")}`,
        ),
      ].join("\n"),
    };
  }

  for (const job of chosen) {
    await supabase
      .from("jobs")
      .update({
        status: "interrupted",
        finished_at: new Date().toISOString(),
        error: "Stopped from Telegram.",
      })
      .eq("id", job.id);
  }

  return {
    text: [
      `🛑 Stopped ${chosen.length} job${chosen.length === 1 ? "" : "s"}.`,
      "",
      ...chosen.map((j) => `• ${escape(j.kind)}`),
      "",
      "The worker finishes its current step and stops there; nothing is left half-written.",
    ].join("\n"),
  };
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
