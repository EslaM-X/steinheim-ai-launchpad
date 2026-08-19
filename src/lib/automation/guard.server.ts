import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Security envelope for the automation API.
 *
 * These routes sit under /api/public/ because they are unauthenticated by
 * Supabase session — they are not public. Every request must carry a shared
 * secret, a fresh timestamp and a single-use nonce, and may carry an
 * idempotency key. Nothing here is ever logged: not the secret, not the tokens
 * a handler may touch.
 *
 * The worker channel (`x-worker-secret`) stays separate on purpose — a leaked
 * n8n credential must not let anyone claim GPU jobs, and vice versa.
 */

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT = 60;
const LEDGER_RETENTION_DAYS = 7;

type DB = SupabaseClient<any, "public", any>;

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/**
 * Compares digests rather than the raw strings: constant time over a fixed 32
 * bytes, so neither the value nor its length leaks through timing.
 */
export async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function parseTimestamp(raw: string): number | null {
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    // Accept seconds or milliseconds; anything below this threshold is seconds.
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export interface AutomationContext {
  supabase: DB;
  body: unknown;
  url: URL;
  idempotencyKey: string | null;
}

/**
 * Runs `handler` only for a request that passes every check, and records the
 * outcome so a retry with the same idempotency key replays it instead of
 * repeating the work.
 */
/**
 * Turns anything a handler can throw into a readable line.
 *
 * Provider SDKs reject with plain objects rather than Errors, and String() on
 * one of those yields "[object Object]" — a 500 that tells the operator nothing
 * about what actually broke.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
    }
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "Unserialisable error";
    }
  }
  return "Internal error";
}

export async function withAutomationGuard(
  request: Request,
  endpoint: string,
  handler: (context: AutomationContext) => Promise<Response>,
): Promise<Response> {
  try {
    return await runGuarded(request, endpoint, handler);
  } catch (error) {
    // Without this, a throw here (a missing service-role key, a dead database)
    // escapes to the SSR error page and n8n receives HTML instead of JSON.
    console.error(`[automation:${endpoint}] request failed`, error);
    return json({ error: describeError(error) }, 500);
  }
}

async function runGuarded(
  request: Request,
  endpoint: string,
  handler: (context: AutomationContext) => Promise<Response>,
): Promise<Response> {
  const expected = process.env["AUTOMATION_SECRET"];
  if (!expected) return json({ error: "Automation channel not configured" }, 503);

  const provided = request.headers.get("x-automation-secret");
  if (!provided || !(await secretMatches(provided, expected))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const rawTimestamp = request.headers.get("x-automation-timestamp");
  if (!rawTimestamp) return json({ error: "Missing x-automation-timestamp" }, 400);
  const timestamp = parseTimestamp(rawTimestamp);
  if (timestamp === null) return json({ error: "Malformed x-automation-timestamp" }, 400);
  if (Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) {
    return json({ error: "Request timestamp outside the accepted window" }, 401);
  }

  const nonce = request.headers.get("x-automation-nonce");
  if (!nonce || nonce.length < 8 || nonce.length > 128) {
    return json({ error: "Missing or malformed x-automation-nonce" }, 400);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
    return json({ error: "Malformed idempotency-key" }, 400);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin as unknown as DB;

  const limit = Number(process.env["AUTOMATION_RATE_LIMIT"] ?? DEFAULT_RATE_LIMIT);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("automation_requests")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", endpoint)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= limit) {
    return json({ error: "Rate limit exceeded" }, 429, { "retry-after": "60" });
  }

  // A completed attempt under the same key is replayed verbatim: the caller
  // that never learned its first request succeeded must not cause a second one.
  if (idempotencyKey) {
    const { data: previous } = await supabase
      .from("automation_requests")
      .select("status_code, response, completed_at")
      .eq("endpoint", endpoint)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (previous?.completed_at) {
      return json(previous.response, previous.status_code ?? 200, { "idempotent-replay": "true" });
    }
  }

  const { data: ledgerRow, error: ledgerError } = await supabase
    .from("automation_requests")
    .insert({ endpoint, nonce, idempotency_key: idempotencyKey })
    .select("id")
    .maybeSingle();

  if (ledgerError) {
    // 23505 = unique violation. Which index fired tells us which guard tripped.
    if (ledgerError.code === "23505") {
      const replayedNonce = (ledgerError.message ?? "").includes("nonce");
      return json(
        {
          error: replayedNonce
            ? "Nonce already used"
            : "A request with this idempotency key is in flight",
        },
        409,
      );
    }
    return json({ error: "Could not record request" }, 500);
  }

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.json().catch(() => null);
  }

  let response: Response;
  let status = 500;
  let payload: unknown = { error: "Internal error" };
  try {
    response = await handler({ supabase, body, url: new URL(request.url), idempotencyKey });
    status = response.status;
    payload = await response
      .clone()
      .json()
      .catch(() => null);
  } catch (error) {
    console.error(`[automation:${endpoint}] handler threw`, error);
    payload = { error: describeError(error) };
    response = json(payload, 500);
    status = 500;
  }

  await supabase
    .from("automation_requests")
    .update({
      status_code: status,
      response: payload as never,
      completed_at: new Date().toISOString(),
    })
    .eq("id", ledgerRow!.id);

  // Opportunistic housekeeping — keeps the ledger bounded without a cron job.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("automation_requests").delete().lt("created_at", cutoff);
  }

  return response;
}
