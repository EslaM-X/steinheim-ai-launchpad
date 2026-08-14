/**
 * Platform adapter contract — the single place that knows how each channel
 * differs. Everything downstream (writers, Creative Studio exports, the n8n
 * publisher, the analytics collector) reads these specs instead of hardcoding
 * per-platform rules, so adding a channel means adding one entry here.
 *
 * TikTok and Telegram are declared from day one even though their publishing
 * is still gated on API approval — `publishMethod` carries that state.
 */

/** Channels that publish to a public audience through an OAuth social account. */
export const SOCIAL_PLATFORMS = ["linkedin", "facebook", "instagram", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Telegram is an operational channel: notifications, approvals, reports — not audience reach. */
export const CHANNELS = [...SOCIAL_PLATFORMS, "telegram"] as const;
export type Channel = (typeof CHANNELS)[number];

export const MEDIA_TYPES = [
  "text",
  "image",
  "carousel",
  "video",
  "story",
  "reel",
  "short",
] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Metrics every channel can be compared on. Anything platform-specific goes to raw_metrics. */
export const CANONICAL_METRICS = [
  "impressions",
  "reach",
  "engagements",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "video_views",
  "watch_time_seconds",
  "followers_gained",
  "profile_visits",
  "link_clicks",
] as const;
export type CanonicalMetric = (typeof CANONICAL_METRICS)[number];

export type PublishMethod =
  | "api" // fully automated through the platform API
  | "pending_approval" // integration built, waiting on the platform's app review
  | "manual"; // human posts it, we only record the result

export interface PlatformSpec {
  readonly channel: Channel;
  /** Aspect ratios the platform accepts, best-performing first. */
  readonly aspectRatios: readonly string[];
  readonly maxCaptionChars: number;
  readonly maxHashtags: number;
  readonly mediaTypes: readonly MediaType[];
  readonly publishMethod: PublishMethod;
  /** Metrics this platform actually reports — the collector must not invent the rest. */
  readonly reports: readonly CanonicalMetric[];
  /** What still blocks full automation, surfaced in the dashboard instead of buried in docs. */
  readonly blockedBy?: string;
}

/**
 * Caption and hashtag limits change without notice — treat these as guardrails
 * for the writers, and let the platform's own API error be the final authority.
 */
export const PLATFORM_SPECS: Record<Channel, PlatformSpec> = {
  linkedin: {
    channel: "linkedin",
    aspectRatios: ["1:1", "4:5", "16:9"],
    maxCaptionChars: 3000,
    maxHashtags: 5,
    mediaTypes: ["text", "image", "carousel", "video"],
    publishMethod: "pending_approval",
    reports: ["impressions", "engagements", "likes", "comments", "shares", "clicks"],
    blockedBy: "Community Management API access (w_organization_social) requires LinkedIn approval",
  },
  facebook: {
    channel: "facebook",
    aspectRatios: ["1:1", "4:5", "16:9", "9:16"],
    maxCaptionChars: 63206,
    maxHashtags: 5,
    mediaTypes: ["text", "image", "carousel", "video", "reel"],
    publishMethod: "pending_approval",
    reports: [
      "impressions",
      "reach",
      "engagements",
      "likes",
      "comments",
      "shares",
      "clicks",
      "video_views",
    ],
    blockedBy: "Meta App Review for pages_manage_posts (a Page admin can test before review)",
  },
  instagram: {
    channel: "instagram",
    aspectRatios: ["4:5", "1:1", "9:16"],
    maxCaptionChars: 2200,
    maxHashtags: 30,
    mediaTypes: ["image", "carousel", "video", "story", "reel"],
    publishMethod: "pending_approval",
    reports: [
      "impressions",
      "reach",
      "engagements",
      "likes",
      "comments",
      "shares",
      "saves",
      "video_views",
      "profile_visits",
    ],
    blockedBy: "Instagram Business account linked to a Page + instagram_content_publish approval",
  },
  tiktok: {
    channel: "tiktok",
    aspectRatios: ["9:16"],
    maxCaptionChars: 2200,
    maxHashtags: 10,
    mediaTypes: ["video", "short", "image", "carousel"],
    publishMethod: "pending_approval",
    reports: [
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "video_views",
      "watch_time_seconds",
    ],
    blockedBy:
      "Content Posting API: unaudited clients are restricted to private posts until the video.publish audit passes",
  },
  telegram: {
    channel: "telegram",
    aspectRatios: ["any"],
    maxCaptionChars: 4096,
    maxHashtags: 0,
    mediaTypes: ["text", "image", "video"],
    publishMethod: "api", // Bot API needs no review — the only channel live on day one
    reports: [],
  },
};

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ adapter contract */

export interface PublishRequest {
  postId: string;
  channel: Channel;
  /** Resolved from social_accounts; the adapter never reads tokens itself. */
  accessToken: string;
  externalAccountId: string;
  caption: string;
  hashtags: string[];
  mediaType: MediaType;
  /** Signed URL to the rendered asset, already in the channel's aspect ratio. */
  mediaUrl?: string;
  /**
   * Stable across retries of the same logical publish. An adapter that can ask
   * the platform "did this already go out?" should use it to answer that before
   * posting again — the dangerous failure is a request that succeeded while the
   * caller never learned it did.
   */
  idempotencyKey?: string;
}

export interface PublishResult {
  /** The platform's own id — without it the post can never be measured again. */
  platformPostId: string;
  publishedUrl: string | null;
  /** TikTok may accept an upload that is not publicly visible yet. */
  visibility: "public" | "private" | "pending";
  /** True when the adapter found the post already existed rather than creating it. */
  deduplicated?: boolean;
}

export interface MetricsSnapshot {
  canonical: Partial<Record<CanonicalMetric, number>>;
  /** Everything this platform reports that no other one does. */
  raw: Record<string, unknown>;
}

export interface PlatformAdapter {
  readonly channel: Channel;
  /** Reject before an API call what the channel would reject anyway. */
  validate(request: PublishRequest): { ok: true } | { ok: false; reason: string };
  /**
   * Throws {@link PublishUnconfirmedError} — never a plain error — whenever the
   * attempt ends without a definitive answer. The caller turns that into the
   * `unknown` state instead of `failed`, because "it failed" is a claim that the
   * post did not go out, and making that claim wrongly publishes it twice.
   */
  publish(request: PublishRequest): Promise<PublishResult>;
  fetchMetrics(args: {
    accessToken: string;
    externalAccountId: string;
    platformPostId: string;
  }): Promise<MetricsSnapshot>;
  /**
   * Asks the platform whether a given attempt already produced a post. Returns
   * the publication if found, `null` if the platform has no record of it — which
   * is the only evidence that makes a retry safe.
   *
   * Optional only because a channel may offer no way to ask; such a channel must
   * never be retried automatically out of `unknown`.
   */
  reconcile?(args: {
    accessToken: string;
    externalAccountId: string;
    idempotencyKey: string;
  }): Promise<PublishResult | null>;
}

/**
 * The attempt reached the platform but the outcome is unknown: a timeout, a
 * dropped connection, a 5xx after the write may already have happened.
 */
export class PublishUnconfirmedError extends Error {
  constructor(
    readonly channel: Channel,
    reason: string,
    readonly idempotencyKey?: string,
  ) {
    super(`Publish to ${channel} was not confirmed: ${reason}`);
    this.name = "PublishUnconfirmedError";
  }
}

/** Thrown by adapters whose platform access is still pending approval. */
export class ChannelNotAvailableError extends Error {
  constructor(readonly channel: Channel) {
    super(
      `Publishing to ${channel} is not available yet: ${PLATFORM_SPECS[channel].blockedBy ?? "not implemented"}`,
    );
    this.name = "ChannelNotAvailableError";
  }
}

/** Shared caption/hashtag/media validation driven by the specs above. */
export function validateAgainstSpec(
  request: PublishRequest,
): { ok: true } | { ok: false; reason: string } {
  const spec = PLATFORM_SPECS[request.channel];
  if (!spec.mediaTypes.includes(request.mediaType)) {
    return { ok: false, reason: `${request.channel} does not accept ${request.mediaType}` };
  }
  if (request.caption.length > spec.maxCaptionChars) {
    return {
      ok: false,
      reason: `Caption is ${request.caption.length} chars, over the ${spec.maxCaptionChars} limit for ${request.channel}`,
    };
  }
  if (request.hashtags.length > spec.maxHashtags) {
    return {
      ok: false,
      reason: `${request.hashtags.length} hashtags, over the ${spec.maxHashtags} limit for ${request.channel}`,
    };
  }
  if (request.mediaType !== "text" && !request.mediaUrl) {
    return { ok: false, reason: `${request.mediaType} requires mediaUrl` };
  }
  return { ok: true };
}
