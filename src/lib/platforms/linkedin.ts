import { ChannelNotAvailableError, validateAgainstSpec, type PlatformAdapter } from "./types";

/**
 * Contract only — LinkedIn organization posting needs `w_organization_social`,
 * which is granted through the Community Management API application.
 *
 * When access lands: create a UGC post at `POST /rest/posts` with the author set
 * to `urn:li:organization:{externalAccountId}`, read the returned `x-restli-id`
 * header as `platformPostId`, and pull metrics from the organization share
 * statistics endpoint.
 */
export const linkedinAdapter: PlatformAdapter = {
  channel: "linkedin",
  validate: validateAgainstSpec,
  async publish() {
    throw new ChannelNotAvailableError("linkedin");
  },
  async fetchMetrics() {
    throw new ChannelNotAvailableError("linkedin");
  },
};
