import type { SupabaseClient } from "@supabase/supabase-js";

import {
  answerCallbackQuery,
  editMessageCaption,
  editMessageText,
  escapeHtml,
  sendPhoto,
  sendMessage,
  type InlineButton,
} from "@/lib/platforms/telegram";

import { applyHumanApproval } from "./approvals.server";

type DB = SupabaseClient<any, "public", any>;

/**
 * Telegram command centre — full interactive interface.
 *
 * Both approvers can browse posts with images, approve/reject with reasons,
 * explore ideas, view campaign renders, and see analytics — all from chat.
 */

interface TelegramConfig {
  chatId: string;
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

// ─── Help & formatting ───────────────────────────────────────────────

const HELP = [
  "<b>Steinheim AI — Command Centre</b>",
  "",
  "<b>Content</b>",
  "/pending — posts awaiting approval (with images)",
  "/post &lt;id&gt; — full post detail",
  "/approve all — approve everything pending",
  "/rejected — rejected posts",
  "",
  "<b>Planning</b>",
  "/today — today's generated content",
  "/ideas — content ideas in the queue",
  "/campaigns — active campaign renders",
  "",
  "<b>Reports</b>",
  "/status — pipeline at a glance",
  "/analytics — last 7 days performance",
  "",
  "<b>Run it</b>",
  "/sync — read the official catalogue again",
  "/plates — rebuild every product in every finish",
  "/render &lt;product&gt; | &lt;palette&gt; | &lt;format&gt; — campaign images + video",
  "/generate — write today's content",
  "/verify — a test run that publishes nowhere",
  "/jobs — what is running now",
  "/catalogue — what the catalogue holds",
  "",
  "<b>Admin</b>",
  "/register — register as an approver",
  "/help — this message",
  "",
  "Approving queues for publishing. Publishing runs on schedule.",
].join("\n");

function postCaption(post: Record<string, any>): string {
  const body = String(post["body_en"] ?? post["body_ar"] ?? "").slice(0, 800);
  const score = post["review_score"] != null ? `${post["review_score"]}/100` : "—";
  const platform = String(post["platform"] ?? "").toUpperCase();
  const rec = post["ai_recommendation"]
    ? `\n💡 ${escapeHtml(String(post["ai_recommendation"]))}`
    : "";
  const hashtags =
    Array.isArray(post["hashtags"]) && post["hashtags"].length
      ? `\n${post["hashtags"].map((h: string) => `#${h.replace(/\s+/g, "")}`).join(" ")}`
      : "";
  return [
    `<b>${escapeHtml(platform)}</b> · Score: ${escapeHtml(score)}`,
    "",
    escapeHtml(body),
    hashtags,
    rec,
  ]
    .filter(Boolean)
    .join("\n");
}

function approvalButtons(postId: string): InlineButton[][] {
  return [
    [
      { text: "✅ Approve", callback_data: `approve:${postId}` },
      { text: "❌ Reject", callback_data: `reject:${postId}` },
    ],
    [{ text: "📋 Details", callback_data: `detail:${postId}` }],
  ];
}

function detailButtons(postId: string): InlineButton[][] {
  return [
    [
      { text: "✅ Approve", callback_data: `approve:${postId}` },
      { text: "❌ Reject", callback_data: `reject:${postId}` },
    ],
  ];
}

// ─── Send post with or without image ─────────────────────────────────

async function sendPostPreview(chatId: string, post: Record<string, any>): Promise<void> {
  const caption = postCaption(post);
  const imageUrl = post["image_url"];

  if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
    await sendPhoto(chatId, imageUrl, caption, approvalButtons(String(post["id"])));
  } else {
    await sendMessage(chatId, caption, approvalButtons(String(post["id"])));
  }
}

// ─── Commands ────────────────────────────────────────────────────────

async function commandStatus(supabase: DB, chatId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("posts")
    .select("status")
    .eq("is_test", false)
    .gte("created_at", `${today}T00:00:00Z`);
  const rows = (data ?? []) as Array<{ status: string }>;
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = rows.length;
  const lines = Object.entries(counts)
    .map(([s, c]) => `  ${statusEmoji(s)} ${s}: <b>${c}</b>`)
    .join("\n");
  await sendMessage(
    chatId,
    [
      `<b>📊 Pipeline Status — ${today}</b>`,
      `Total: <b>${total}</b>`,
      "",
      lines || "Nothing generated yet.",
    ].join("\n"),
  );
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    draft: "📝",
    reviewed: "🔍",
    ai_approved: "🟡",
    approved: "🟢",
    publishing: "⏳",
    published: "✅",
    needs_revision: "🔴",
    failed: "💥",
    unknown: "❓",
  };
  return map[status] ?? "•";
}

async function commandToday(supabase: DB, chatId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("content_ideas")
    .select("id, topic, topic_ar, content_type, funnel_stage, angle")
    .eq("planned_date", today)
    .order("created_at", { ascending: false })
    .limit(5);
  const ideas = (data ?? []) as Array<Record<string, unknown>>;
  if (!ideas.length) {
    await sendMessage(chatId, "Nothing generated for today yet.");
    return;
  }
  const lines = ideas.map((idea, i) => {
    const topic = escapeHtml(String(idea["topic"] ?? ""));
    const topicAr = idea["topic_ar"] ? ` (${escapeHtml(String(idea["topic_ar"]))})` : "";
    const type = idea["content_type"] ? escapeHtml(String(idea["content_type"])) : "";
    const stage = idea["funnel_stage"] ? escapeHtml(String(idea["funnel_stage"])) : "";
    const angle = idea["angle"] ? escapeHtml(String(idea["angle"]).slice(0, 120)) : "";
    return [
      `<b>${i + 1}. ${topic}${topicAr}</b>`,
      [type, stage].filter(Boolean).join(" · "),
      angle ? `📝 ${angle}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  await sendMessage(chatId, [`<b>🗓 Today's Content — ${today}</b>`, "", ...lines].join("\n"));
}

export async function commandPending(supabase: DB, chatId: string) {
  const { data } = await supabase
    .from("posts")
    .select("id, platform, body_en, body_ar, review_score, ai_recommendation, image_url, hashtags")
    .eq("is_test", false)
    .eq("ai_approved", true)
    .eq("hard_fail", false)
    .is("human_approved_at", null)
    .in("status", ["ai_approved", "reviewed"])
    .order("created_at", { ascending: false })
    .limit(10);
  const posts = (data ?? []) as Array<Record<string, unknown>>;
  if (!posts.length) {
    await sendMessage(chatId, "✅ Nothing waiting for approval — all clear!");
    return;
  }
  await sendMessage(
    chatId,
    `<b>🟡 ${posts.length} post(s) awaiting approval</b>\nSwipe through and tap Approve or Reject.`,
  );
  for (const post of posts) {
    await sendPostPreview(chatId, post);
  }
}

async function commandPostDetail(supabase: DB, chatId: string, postId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, platform, body_en, body_ar, review_score, ai_recommendation, image_url, hashtags, status, review_notes, accuracy_report, penalties, created_at",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!post) {
    await sendMessage(chatId, "Post not found.");
    return;
  }
  const body = String(post["body_en"] ?? post["body_ar"] ?? "");
  const bodyAr = post["body_ar"] ? escapeHtml(String(post["body_ar"])) : "—";
  const score = post["review_score"] != null ? `${post["review_score"]}/100` : "—";
  const hashtags = Array.isArray(post["hashtags"])
    ? post["hashtags"].map((h: string) => `#${h.replace(/\s+/g, "")}`).join(" ")
    : "—";
  const notes = post["review_notes"] ? escapeHtml(String(post["review_notes"]).slice(0, 300)) : "—";
  const created = post["created_at"]
    ? new Date(String(post["created_at"])).toLocaleString("en-GB")
    : "—";

  const caption = [
    `<b>📋 Post Detail</b>`,
    "",
    `<b>Platform:</b> ${escapeHtml(String(post["platform"]).toUpperCase())}`,
    `<b>Status:</b> ${statusEmoji(String(post["status"]))} ${escapeHtml(String(post["status"]))}`,
    `<b>Score:</b> ${escapeHtml(score)}`,
    `<b>Created:</b> ${created}`,
    "",
    `<b>English:</b>`,
    escapeHtml(body.slice(0, 1000)),
    "",
    `<b>Arabic:</b>`,
    bodyAr,
    "",
    `<b>Hashtags:</b> ${escapeHtml(hashtags)}`,
    `<b>Notes:</b> ${notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const imageUrl = post["image_url"];
  if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
    await sendPhoto(chatId, imageUrl, caption, detailButtons(postId));
  } else {
    await sendMessage(chatId, caption, detailButtons(postId));
  }
}

async function commandApproveAll(
  supabase: DB,
  chatId: string,
  config: TelegramConfig,
  approverUserId: string,
) {
  const { data } = await supabase
    .from("posts")
    .select("id")
    .eq("is_test", false)
    .eq("ai_approved", true)
    .eq("hard_fail", false)
    .is("human_approved_at", null)
    .in("status", ["ai_approved", "reviewed"])
    .limit(20);
  const posts = (data ?? []) as Array<{ id: string }>;
  if (!posts.length) {
    await sendMessage(chatId, "✅ Nothing pending to approve.");
    return;
  }
  let approved = 0;
  let failed = 0;
  for (const post of posts) {
    const result = await applyHumanApproval(supabase, post.id, true, approverUserId);
    if (result.ok) approved++;
    else failed++;
  }
  await sendMessage(
    chatId,
    [
      `<b>✅ Bulk approve complete</b>`,
      `Approved: <b>${approved}</b>`,
      failed ? `Skipped: <b>${failed}</b>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function commandRejected(supabase: DB, chatId: string) {
  const { data } = await supabase
    .from("posts")
    .select("id, platform, body_en, body_ar, review_score, image_url")
    .eq("is_test", false)
    .eq("status", "needs_revision")
    .order("updated_at", { ascending: false })
    .limit(5);
  const posts = (data ?? []) as Array<Record<string, unknown>>;
  if (!posts.length) {
    await sendMessage(chatId, "No rejected posts.");
    return;
  }
  await sendMessage(chatId, `<b>🔴 ${posts.length} rejected post(s)</b>`);
  for (const post of posts) {
    const body = String(post["body_en"] ?? post["body_ar"] ?? "").slice(0, 300);
    const score = post["review_score"] != null ? `${post["review_score"]}/100` : "—";
    const caption = [
      `<b>${escapeHtml(String(post["platform"]).toUpperCase())}</b> · Score: ${escapeHtml(score)}`,
      "",
      escapeHtml(body),
      "",
      "Send /post &lt;id&gt; to view full details.",
    ].join("\n");
    const imageUrl = post["image_url"];
    if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
      await sendPhoto(chatId, imageUrl, caption);
    } else {
      await sendMessage(chatId, caption);
    }
  }
}

async function commandIdeas(supabase: DB, chatId: string) {
  const { data } = await supabase
    .from("content_ideas")
    .select("id, topic, topic_ar, goal, angle, content_type, funnel_stage, planned_date, status")
    .in("status", ["planned", "in_progress"])
    .order("planned_date", { ascending: true })
    .limit(10);
  const ideas = (data ?? []) as Array<Record<string, unknown>>;
  if (!ideas.length) {
    await sendMessage(chatId, "No content ideas in the queue.");
    return;
  }
  const lines = ideas.map((idea, i) => {
    const topic = escapeHtml(String(idea["topic"] ?? ""));
    const topicAr = idea["topic_ar"] ? ` (${escapeHtml(String(idea["topic_ar"]))})` : "";
    const date = idea["planned_date"] ? String(idea["planned_date"]) : "TBD";
    const type = idea["content_type"] ? escapeHtml(String(idea["content_type"])) : "";
    const stage = idea["funnel_stage"] ? escapeHtml(String(idea["funnel_stage"])) : "";
    const angle = idea["angle"] ? escapeHtml(String(idea["angle"]).slice(0, 100)) : "";
    const goal = idea["goal"] ? escapeHtml(String(idea["goal"]).slice(0, 80)) : "";
    return [
      `<b>${i + 1}. ${topic}${topicAr}</b>`,
      `📅 ${date} · ${[type, stage].filter(Boolean).join(" · ")}`,
      angle ? `📐 ${angle}` : "",
      goal ? `🎯 ${goal}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  await sendMessage(chatId, [`<b>💡 Content Ideas (${ideas.length})</b>`, "", ...lines].join("\n"));
}

async function commandCampaigns(supabase: DB, chatId: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status, objective, market, platforms, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  const campaigns = (data ?? []) as Array<Record<string, unknown>>;
  if (!campaigns.length) {
    await sendMessage(chatId, "No campaigns yet. Run a campaign render first.");
    return;
  }
  const lines = campaigns.map((c, i) => {
    const name = escapeHtml(String(c["name"] ?? "Unnamed"));
    const status = c["status"] ? escapeHtml(String(c["status"])) : "unknown";
    const objective = c["objective"] ? escapeHtml(String(c["objective"]).slice(0, 60)) : "";
    const market = c["market"] ? escapeHtml(String(c["market"])) : "";
    const platforms = Array.isArray(c["platforms"]) ? c["platforms"].join(", ") : "";
    const date = c["created_at"]
      ? new Date(String(c["created_at"])).toLocaleDateString("en-GB")
      : "";
    return [
      `<b>${i + 1}. ${name}</b>`,
      `  ${statusEmoji(status)} ${status} · ${market} · ${escapeHtml(platforms)} · ${date}`,
      objective ? `  🎯 ${objective}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  await sendMessage(chatId, [`<b>🎨 Campaigns</b>`, "", ...lines].join("\n"));
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
  const byPlatform = rows.reduce<
    Record<string, { impressions: number; engagements: number; reach: number; clicks: number }>
  >((acc, row) => {
    const key = String(row["platform"] ?? "unknown");
    acc[key] ??= { impressions: 0, engagements: 0, reach: 0, clicks: 0 };
    acc[key].impressions += Number(row["impressions"] ?? 0);
    acc[key].engagements += Number(row["engagements"] ?? 0);
    acc[key].reach += Number(row["reach"] ?? 0);
    acc[key].clicks += Number(row["clicks"] ?? 0);
    return acc;
  }, {});
  const lines = Object.entries(byPlatform).map(([platform, t]) => {
    const rate = t.impressions ? ((t.engagements / t.impressions) * 100).toFixed(1) : "—";
    return [
      `<b>${escapeHtml(platform.toUpperCase())}</b>`,
      `  👁 ${t.impressions.toLocaleString()} views · 💬 ${t.engagements.toLocaleString()} engagements`,
      `  📊 ${rate}% rate · 🔗 ${t.clicks.toLocaleString()} clicks`,
    ].join("\n");
  });
  await sendMessage(chatId, [`<b>📈 Last 7 Days</b>`, "", ...lines].join("\n"));
}

/**
 * Runs an operational command.
 *
 * Failures are reported into the chat rather than thrown. A bot that goes quiet
 * when something breaks is indistinguishable from one that is still working,
 * and the person waiting has no other window onto it.
 */
async function commandOps(supabase: DB, chatId: string, command: string, rest: string) {
  const ops = await import("./telegram-ops.server");
  try {
    let reply;
    switch (command) {
      case "/sync":
        reply = await ops.opsSync();
        break;
      case "/generate":
        reply = await ops.opsGenerate(false);
        break;
      case "/verify":
        reply = await ops.opsGenerate(true);
        break;
      case "/plates":
        reply = await ops.opsPlates(rest || undefined);
        break;
      case "/jobs":
        reply = await ops.opsJobs(supabase as never);
        break;
      case "/catalogue":
      case "/catalog":
        reply = await ops.opsCatalogue(supabase as never);
        break;
      case "/render": {
        // /render <product> | <palette> | <format> — the pipe keeps a product
        // name with spaces in it from being mistaken for an option.
        const [productQuery = "", palette = "obsidian", format = "square"] = rest
          .split("|")
          .map((part) => part.trim());
        if (!productQuery) {
          reply = {
            text: [
              "<b>/render</b> &lt;product&gt; | &lt;palette&gt; | &lt;format&gt;",
              "",
              "Example: <code>/render joy basin mixer | obsidian | story</code>",
              "",
              "Palettes: porcelain, obsidian, forest, champagne, slate",
              "Formats: square, story, landscape",
            ].join("\n"),
          };
          break;
        }
        reply = await ops.opsRender(supabase as never, {
          productQuery,
          palette,
          format,
          motion: true,
        });
        break;
      }
      default:
        reply = { text: "Unknown command. Try /help" };
    }
    await sendMessage(chatId, reply.text);
  } catch (error) {
    await sendMessage(
      chatId,
      `🔴 <b>${escapeHtml(command)}</b> failed.\n${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}`,
    );
  }
}

async function commandRegister(supabase: DB, chatId: string, fromId: string, fromName: string) {
  const config = await loadConfig(supabase);
  if (!config) return;

  if (config.approvers[fromId]) {
    await sendMessage(
      chatId,
      `✅ <b>${escapeHtml(fromName)}</b> is already registered as an approver.`,
    );
    return;
  }

  // An approver has to be a real identity.
  //
  // The first version minted a random UUID and inserted it into profiles. That
  // table's primary key is a foreign key onto auth.users, so the insert failed
  // — silently, because nothing checked — and the dead id went into the
  // approvers map anyway. posts.approved_by has no foreign key, so approvals
  // from that account would have been recorded against an id belonging to
  // nobody. An approval nobody can be traced to is worse than one that fails.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("telegram_id", fromId)
    .maybeSingle();

  let supabaseUserId: string;
  if (existing?.id) {
    supabaseUserId = String(existing.id);
  } else {
    const admin = supabase as unknown as {
      auth: {
        admin: {
          createUser: (input: Record<string, unknown>) => Promise<{
            data: { user: { id: string } | null };
            error: { message: string } | null;
          }>;
        };
      };
    };
    // A routed address rather than a real inbox: this account exists to carry
    // an approval, never to receive mail or sign in with a password.
    const { data: created, error } = await admin.auth.admin.createUser({
      email: `telegram-${fromId}@steinheim.invalid`,
      email_confirm: true,
      user_metadata: { telegram_id: fromId, display_name: fromName, source: "telegram" },
    });
    if (error || !created?.user?.id) {
      await sendMessage(
        chatId,
        `⚠️ Could not register <b>${escapeHtml(fromName)}</b>: ${escapeHtml(error?.message ?? "no account was created")}`,
      );
      return;
    }
    supabaseUserId = created.user.id;
    // on_auth_user_created writes the profile row; this only adds the link back
    // to Telegram, and its failure is reported rather than swallowed.
    const { error: linkError } = await supabase
      .from("profiles")
      .update({ telegram_id: fromId, display_name: fromName })
      .eq("id", supabaseUserId);
    if (linkError) {
      await sendMessage(
        chatId,
        `⚠️ Registered, but the Telegram link was not saved: ${escapeHtml(linkError.message)}`,
      );
    }
  }

  // Merged, not replaced. Writing { approvers } over the whole config drops
  // every other key the integration holds.
  const { data: current } = await supabase
    .from("integrations")
    .select("config")
    .eq("kind", "telegram")
    .eq("status", "active")
    .maybeSingle();
  const merged = {
    ...((current?.config as Record<string, unknown>) ?? {}),
    approvers: { ...config.approvers, [fromId]: supabaseUserId },
  };
  const { error: saveError } = await supabase
    .from("integrations")
    .update({ config: merged as never })
    .eq("kind", "telegram")
    .eq("status", "active");
  if (saveError) {
    await sendMessage(
      chatId,
      `⚠️ Could not save the approver list: ${escapeHtml(saveError.message)}`,
    );
    return;
  }

  await sendMessage(
    chatId,
    [
      `✅ <b>${escapeHtml(fromName)}</b> registered as approver!`,
      `Telegram ID: <code>${escapeHtml(fromId)}</code>`,
      "",
      "You can now approve and reject posts.",
    ].join("\n"),
  );
}

// ─── Callback handling (button presses) ──────────────────────────────

async function handleCallback(
  supabase: DB,
  config: TelegramConfig,
  callback: Record<string, any>,
): Promise<void> {
  const fromId = String(callback["from"]?.["id"] ?? "");
  const fromName = [callback["from"]?.["first_name"], callback["from"]?.["last_name"]]
    .filter(Boolean)
    .join(" ");
  const approverUserId = config.approvers[fromId];

  if (!approverUserId) {
    await answerCallbackQuery(
      callback["id"],
      `${fromName || "Unknown"}, you're not registered. Send /register first.`,
    );
    return;
  }

  const data = String(callback["data"] ?? "");
  const [action, postId] = data.split(":");

  if (action === "detail" && postId) {
    await answerCallbackQuery(callback["id"], "Opening details...");
    await commandPostDetail(supabase, config.chatId, postId);
    return;
  }

  if ((action !== "approve" && action !== "reject") || !postId) {
    await answerCallbackQuery(callback["id"], "Unknown action.");
    return;
  }

  const result = await applyHumanApproval(supabase, postId, action === "approve", approverUserId);
  const approverTag = escapeHtml(fromName || fromId);

  await answerCallbackQuery(
    callback["id"],
    result.ok
      ? action === "approve"
        ? `Approved by ${approverTag}`
        : `Rejected by ${approverTag}`
      : result.reason,
  );

  const message = callback["message"];
  if (message?.["message_id"]) {
    const outcome = result.ok
      ? action === "approve"
        ? `✅ <b>Approved</b> by ${approverTag}\nQueued for publishing.`
        : `❌ <b>Rejected</b> by ${approverTag}\nSent back for revision.`
      : `⚠️ ${escapeHtml(result.reason)}`;

    if (message.photo) {
      // Photo message — edit caption
      const oldCaption = message.caption ?? "";
      await editMessageCaption(
        config.chatId,
        Number(message["message_id"]),
        `${oldCaption.slice(0, 900)}\n\n${outcome}`,
        result.ok ? [] : detailButtons(postId),
      );
    } else {
      await editMessageText(
        config.chatId,
        Number(message["message_id"]),
        `${String(message["text"] ?? "").slice(0, 3500)}\n\n${outcome}`,
        result.ok ? [] : detailButtons(postId),
      );
    }
  }
}

// ─── Queue pusher (called after generation) ──────────────────────────

export async function pushPendingApprovals(supabase: DB): Promise<boolean> {
  const config = await loadConfig(supabase);
  if (!config) return false;
  await commandPending(supabase, config.chatId);
  return true;
}

// ─── Main entry point ────────────────────────────────────────────────

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

  // Only the configured chat is served
  if (String(message["chat"]?.["id"] ?? "") !== config.chatId) return;

  const fromId = String(message["from"]?.["id"] ?? "");
  const fromName = [message["from"]?.["first_name"], message["from"]?.["last_name"]]
    .filter(Boolean)
    .join(" ");

  const text = String(message["text"] ?? "").trim();
  if (!text.startsWith("/")) return;

  const parts = text.split(/\s+/);
  // Telegram addresses commands in a group as /render@SteinheimBot, so the
  // suffix is stripped before matching. `?? ""` because split can, in principle,
  // return nothing — and an undefined here would index the wrong slice below.
  const command = parts[0]!.toLowerCase().split("@")[0] ?? "";
  const args = parts.slice(1);

  // Everything after the command word: /render joy basin mixer | obsidian
  const rest = text.slice(parts[0]!.length).trim();

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
    case "/post":
      if (args[0]) {
        await commandPostDetail(supabase, config.chatId, args[0]);
      } else {
        await sendMessage(config.chatId, "Usage: /post &lt;id&gt;");
      }
      break;
    case "/approve":
      if (args[0]?.toLowerCase() === "all") {
        const approverUserId = config.approvers[fromId];
        if (!approverUserId) {
          await sendMessage(config.chatId, "You are not registered. Send /register first.");
          break;
        }
        await commandApproveAll(supabase, config.chatId, config, approverUserId);
      } else if (args[0]) {
        const approverUserId = config.approvers[fromId];
        if (!approverUserId) {
          await sendMessage(config.chatId, "You are not registered. Send /register first.");
          break;
        }
        const result = await applyHumanApproval(supabase, args[0], true, approverUserId);
        await sendMessage(
          config.chatId,
          result.ok
            ? `✅ Post approved — queued for publishing.`
            : `⚠️ ${escapeHtml(result.reason)}`,
        );
      } else {
        await sendMessage(config.chatId, "Usage: /approve all  or  /approve &lt;id&gt;");
      }
      break;
    case "/rejected":
      await commandRejected(supabase, config.chatId);
      break;
    case "/ideas":
      await commandIdeas(supabase, config.chatId);
      break;
    case "/campaigns":
      await commandCampaigns(supabase, config.chatId);
      break;
    case "/analytics":
      await commandAnalytics(supabase, config.chatId);
      break;
    case "/register":
      await commandRegister(supabase, config.chatId, fromId, fromName);
      break;

    // Operations. Each starts a job and answers immediately: these runs take
    // minutes, and Telegram treats a slow webhook as a broken one.
    case "/sync":
    case "/generate":
    case "/verify":
    case "/plates":
    case "/render":
    case "/jobs":
    case "/catalogue":
    case "/catalog":
      await commandOps(supabase, config.chatId, command, rest);
      break;
    case "/help":
    case "/start":
      await sendMessage(config.chatId, HELP);
      break;
    default:
      await sendMessage(config.chatId, "Unknown command. Try /help");
  }
}
