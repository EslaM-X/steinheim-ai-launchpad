import { ChannelNotAvailableError, validateAgainstSpec, type PlatformAdapter } from "./types";

/**
 * Contract only — needs an Instagram Business account linked to a Facebook Page
 * plus `instagram_content_publish`.
 *
 * When access lands, publishing is two calls, and the gap between them is where
 * duplicates are born: `POST /{ig-user-id}/media` creates a container, then
 * `POST /{ig-user-id}/media_publish` publishes it. Persist the container id
 * against the idempotency key before publishing, so a retry resumes at step two
 * instead of creating a second container.
 */
export const instagramAdapter: PlatformAdapter = {
  channel: "instagram",
  validate: validateAgainstSpec,
  async publish() {
    throw new ChannelNotAvailableError("instagram");
  },
  async fetchMetrics() {
    throw new ChannelNotAvailableError("instagram");
  },
};
