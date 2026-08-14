import { ChannelNotAvailableError, validateAgainstSpec, type PlatformAdapter } from "./types";

/**
 * Contract only — Page publishing needs `pages_manage_posts` with a Page access
 * token. A Page admin can exercise this before App Review; public rollout needs
 * the review to pass.
 *
 * When access lands: `POST /{page-id}/feed` (or `/photos`, `/videos`) returns the
 * post id used as `platformPostId`; metrics come from `/{post-id}/insights`.
 */
export const facebookAdapter: PlatformAdapter = {
  channel: "facebook",
  validate: validateAgainstSpec,
  async publish() {
    throw new ChannelNotAvailableError("facebook");
  },
  async fetchMetrics() {
    throw new ChannelNotAvailableError("facebook");
  },
};
