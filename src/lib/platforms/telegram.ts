import { PLATFORM_SPECS, validateAgainstSpec, type PlatformAdapter } from "./types";

/**
 * Telegram Bot API — the one channel that needs no platform review, which is why
 * it is the first end-to-end path: notifications, human approval and reports.
 *
 * The bot token lives in the environment, never in the database and never in a
 * log line.
 */

const API = "https://api.telegram.org";

export function getBotToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  return token;
}

/** Telegram rejects unescaped angle brackets and ampersands in HTML mode. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

async function callBotApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}/bot${getBotToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
  };
  // The token is in the URL, so never surface the URL in the error.
  if (!response.ok || !body.ok) {
    throw new Error(
      `Telegram ${method} failed (${response.status}): ${body.description ?? "unknown error"}`,
    );
  }
  return body.result as T;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][],
): Promise<{ message_id: number }> {
  const spec = PLATFORM_SPECS.telegram;
  return callBotApi<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, spec.maxCaptionChars),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  await callBotApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, PLATFORM_SPECS.telegram.maxCaptionChars),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons ?? [] },
  });
}

/** Every callback query must be answered or the button spins forever. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callBotApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 200) } : {}),
  });
}

export async function sendPhoto(
  chatId: string | number,
  photo: string,
  caption: string,
  buttons?: InlineButton[][],
): Promise<{ message_id: number }> {
  return callBotApi<{ message_id: number }>("sendPhoto", {
    chat_id: chatId,
    photo,
    caption: caption.slice(0, 1024),
    parse_mode: "HTML",
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export async function sendMediaGroup(
  chatId: string | number,
  media: Array<{ type: "photo"; media: string; caption?: string; parse_mode?: string }>,
): Promise<unknown> {
  return callBotApi("sendMediaGroup", { chat_id: chatId, media });
}

export async function editMessageCaption(
  chatId: string | number,
  messageId: number,
  caption: string,
  buttons?: InlineButton[][],
): Promise<void> {
  await callBotApi("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption: caption.slice(0, 1024),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons ?? [] },
  });
}

export const telegramAdapter: PlatformAdapter = {
  channel: "telegram",
  validate: validateAgainstSpec,
  async publish(request) {
    // externalAccountId is the target chat id; accessToken is unused because the
    // bot token is environment-scoped rather than per-account.
    const sent = await sendMessage(
      request.externalAccountId,
      [escapeHtml(request.caption), request.mediaUrl ? escapeHtml(request.mediaUrl) : ""]
        .filter(Boolean)
        .join("\n\n"),
    );
    return {
      platformPostId: String(sent.message_id),
      publishedUrl: null,
      visibility: "public",
    };
  },
  async fetchMetrics() {
    // Telegram exposes no per-message analytics for regular chats.
    return { canonical: {}, raw: {} };
  },
};
