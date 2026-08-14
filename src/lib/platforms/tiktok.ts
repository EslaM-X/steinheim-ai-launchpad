import { ChannelNotAvailableError, validateAgainstSpec, type PlatformAdapter } from "./types";

/**
 * Contract only — Content Posting API. Until the client passes TikTok's audit,
 * `video.publish` is restricted and uploads land as private, so treat a
 * successful upload as `visibility: "private"` rather than a live post.
 *
 * When access lands: initialise the upload, poll `publish/status/fetch` for the
 * publish id, and only record `platformPostId` once the status is final —
 * recording it early makes a failed upload look published.
 */
export const tiktokAdapter: PlatformAdapter = {
  channel: "tiktok",
  validate: validateAgainstSpec,
  async publish() {
    throw new ChannelNotAvailableError("tiktok");
  },
  async fetchMetrics() {
    throw new ChannelNotAvailableError("tiktok");
  },
};
