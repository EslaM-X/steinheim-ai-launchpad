import { facebookAdapter } from "./facebook";
import { instagramAdapter } from "./instagram";
import { linkedinAdapter } from "./linkedin";
import { telegramAdapter } from "./telegram";
import { tiktokAdapter } from "./tiktok";
import { CHANNELS, PLATFORM_SPECS, type Channel, type PlatformAdapter } from "./types";

/**
 * One lookup for every channel. Adding a platform means adding its adapter here
 * — the publisher, the collector and the dashboard all go through this map and
 * none of them names a platform directly.
 */
const ADAPTERS: Record<Channel, PlatformAdapter> = {
  linkedin: linkedinAdapter,
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  telegram: telegramAdapter,
};

export function getAdapter(channel: Channel): PlatformAdapter {
  return ADAPTERS[channel];
}

/** Channels that can actually publish today, as opposed to declared ones. */
export function liveChannels(): Channel[] {
  return CHANNELS.filter((channel) => PLATFORM_SPECS[channel].publishMethod === "api");
}

export function channelStatus() {
  return CHANNELS.map((channel) => ({
    channel,
    publishMethod: PLATFORM_SPECS[channel].publishMethod,
    blockedBy: PLATFORM_SPECS[channel].blockedBy ?? null,
  }));
}

export * from "./types";
