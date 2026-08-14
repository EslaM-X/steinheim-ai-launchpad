import type { SupabaseClient } from "@supabase/supabase-js";

import {
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
  sendMessage,
  type InlineButton,
} from "@/lib/platforms/telegram";

import { applyHumanApproval } from "./approvals.server";

type DB = SupabaseClient<any, "public", any>;

/**
 * Telegram command centre: the human-in-the-loop interface.
 *
 * It reads state and flips approval flags. It never publishes — approving marks
 * the post `approved`, and the n8n publisher picks it up from the queue. Keeping
 * the two apart is what stops a chat button from becoming a publishing path.
 */

interface TelegramConfig {
  chatId: string;
  /** telegram user id → Supabase user uuid, so approvals keep a real author. */
  approvers: Record<string, string>;
}

async function loadConfig(supabase: DB): Promise<TelegramConfig | null> {
  const { data } = await supabase
    .from("integrations")
    .select("external_id, config, status")
    .eq("kind", "telegram")
    .eq("status", "active")
    .maybeSingle();
  if (!data?.external_id) return null;
  const config = (data.config ?? {}) as { approvers?: Record<string, string> };
  return { chatId: String(data.external_id), approvers: config.approvers ?? {} };
}

const HELP = [
  "<b>Steinheim AI — command centre</b>",
  "",
  "/status — today's pipeline at a glance",
  "/today — what was generated today",
  "/pending — posts waiting for your approval",
  "/analytics — last 7 days of performance",
  "/help — this message",
  "",
  "Approving a post only queues it. Publishing runs on its own schedule.",
].join("\n");

function postSummary(post: Record<string, any>): string {
  const body = String(post["body_en"] ?? post["body_ar"] ?? "").slice(0, 400);
  const score = post["review_score"] != null ? `${post["review_score"]}/100` : "unscored";
  return [
    `<b>${escapeHtml(String(post["platform"]).toUpperCase())}</b> · ${escapeHtml(score)}`,
    escapeHtml(body),
  ].join("\n\n");
}

function approvalButtons(postId: string): InlineButton[][] {
  return [
    [
      { text: "✅ Approve", callback_data: `approve:${postId}` },
      { text: "❌ Reject", callback_data: `reject:${postId}` },
    ],
  ];
}

async function commandStatus(supabase: DB, chatId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("posts")
    .select("status, created_at")
    .eq("is_test", false)
    .gte("created_at", `${today}T00:00:00Z`);
  const rows = (data ?? []) as Array<{ status: string }>;
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const lines = Object.entries(counts).map(([status, count]) => `${status}: ${count}`);
  await sendMessage(
    chatId,
    [
      `<b>📊 Today (${today})</b>`,
      "",
      lines.length ? lines.join("\n") : "Nothing generated yet.",
    ].join("\n"),
  );
}

async function commandToday(supabase: DB, chatId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("content_ideas")
    .select("topic, content_type, funnel_stage, planned_date")
    .eq("planned_date", today)
    .order("created_at", { ascending: false })
    .limit(3);
  const ideas = (data ?? []) as Array<Record<string, unknown>>;
  if (!ideas.length) {
    await sendMessage(chatId, "Nothing generated for today yet.");
    return;
  }
  const lines = ideas.map(
    (idea) =>
      `• <b>${escapeHtml(String(idea["topic"]))}</b>\n  ${escapeHtml(
        [idea["content_type"], idea["funnel_stage"]].filter(Boolean).join(" · "),
      )}`,
  );
  await sendMessage(chatId, [`<b>🗓 Today's ideas</b>`, "", ...lines].join("\n"));
}

export async function commandPending(supabase: DB, chatId: string) {
  const { data } = await supabase
    .from("posts")
    .select("id, platform, body_en, body_ar, review_score, ai_recommendation")
    .eq("is_test", false)
    .eq("ai_approved", true)
    .eq("hard_fail", false)
    .is("human_approved_at", null)
    .in("status", ["ai_approved", "reviewed"])
    .order("created_at", { ascending: false })
    .limit(5);
  const posts = (data ?? []) as Array<Record<string, unknown>>;
  if (!posts.length) {
    await sendMessage(chatId, "✅ Nothing waiting for approval.");
    return;
  }
  await sendMessage(chatId, `<b>🟡 ${posts.length} post(s) awaiting your approval</b>`);
  for (const post of posts) {
    await sendMessage(chatId, postSummary(post), approvalButtons(String(post["id"])));
  }
}

async function commandAnalytics(supabase: DB, chatId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("post_analytics")
    .select("platform, impressions, reach, engagements, clicks")
    .gte("measured_on", since);
  const rows = (data ?? []) as Array<Record<string, number | string>>;
  if (!rows.length) {
    await sendMessage(chatId, "No metrics collected in the last 7 days.");
    return;
  }
  const byPlatform = rows.reduce<Record<string, { impressions: number; engagements: number }>>(
    (acc, row) => {
      const key = String(row["platform"] ?? "unknown");
      acc[key] ??= { impressions: 0, engagements: 0 };
      acc[key].impressions += Number(row["impressions"] ?? 0);
      acc[key].engagements += Number(row["engagements"] ?? 0);
      return acc;
    },
    {},
  );
  const lines = Object.entries(byPlatform).map(([platform, totals]) => {
    const rate = totals.impressions
      ? ((totals.engagements / totals.impressions) * 100).toFixed(1)
      : "—";
    return `${platform}: ${totals.impressions} impressions · ${totals.engagements} engagements (${rate}%)`;
  });
  await sendMessage(chatId, [`<b>📈 Last 7 days</b>`, "", ...lines].join("\n"));
}

async function handleCallback(
  supabase: DB,
  config: TelegramConfig,
  callback: Record<string, any>,
): Promise<void> {
  const fromId = String(callback["from"]?.["id"] ?? "");
  const approverUserId = config.approvers[fromId];
  if (!approverUserId) {
    await answerCallbackQuery(callback["id"], "You are not an approver for this system.");
    return;
  }

  const [action, postId] = String(callback["data"] ?? "").split(":");
  if ((action !== "approve" && action !== "reject") || !postId) {
    await answerCallbackQuery(callback["id"], "Unknown action.");
    return;
  }

  const result = await applyHumanApproval(supabase, postId, action === "approve", approverUserId);
  await answerCallbackQuery(
    callback["id"],
    result.ok
      ? action === "approve"
        ? "Approved — queued for publishing."
        : "Sent back for revision."
      : result.reason,
  );

  const message = callback["message"];
  if (message?.["message_id"]) {
    const outcome = result.ok
      ? action === "approve"
        ? "✅ <b>Approved</b> — queued for publishing."
        : "❌ <b>Sent back</b> for revision."
      : `⚠️ ${escapeHtml(result.reason)}`;
    // Clear the buttons so the same decision cannot be submitted twice.
    await editMessageText(
      config.chatId,
      Number(message["message_id"]),
      `${String(message["text"] ?? "").slice(0, 3500)}\n\n${outcome}`,
      result.ok ? [] : approvalButtons(postId),
    );
  }
}

/**
 * Pushes the approval queue to the configured chat. Called after a generation
 * run; a Telegram outage must never fail the run, so callers swallow errors.
 */
export async function pushPendingApprovals(supabase: DB): Promise<boolean> {
  const config = await loadConfig(supabase);
  if (!config) return false;
  await commandPending(supabase, config.chatId);
  return true;
}

/** Entry point for a Telegram webhook update. */
export async function handleTelegramUpdate(
  supabase: DB,
  update: Record<string, any>,
): Promise<void> {
  const config = await loadConfig(supabase);
  if (!config) return;

  if (update["callback_query"]) {
    await handleCallback(supabase, config, update["callback_query"]);
    return;
  }

  const message = update["message"];
  if (!message) return;

  // Only the configured chat is served; anything else is ignored silently.
  if (String(message["chat"]?.["id"] ?? "") !== config.chatId) return;

  const text = String(message["text"] ?? "").trim();
  if (!text.startsWith("/")) return;
  const command = text.split(/[\s@]/)[0]!.toLowerCase();

  switch (command) {
    case "/status":
      await commandStatus(supabase, config.chatId);
      break;
    case "/today":
      await commandToday(supabase, config.chatId);
      break;
    case "/pending":
      await commandPending(supabase, config.chatId);
      break;
    case "/analytics":
      await commandAnalytics(supabase, config.chatId);
      break;
    case "/help":
    case "/start":
      await sendMessage(config.chatId, HELP);
      break;
    default:
      await sendMessage(config.chatId, "Unknown command. Try /help");
  }
}
