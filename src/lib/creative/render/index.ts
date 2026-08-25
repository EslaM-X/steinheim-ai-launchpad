import { composeProductScene, type Composition } from "./compose";
import { renderMotion } from "./motion";

export { PALETTES, paletteNames } from "./backdrop";
export { composeProductScene } from "./compose";
export { knownFinishes, verifyFinish } from "./finish";
export { renderMotion } from "./motion";
export { SCENE_PRESETS } from "./scene";

/**
 * Everything a campaign needs from one product, in one call.
 *
 * The unit is the product rather than the image, because a finish set is what
 * a campaign actually posts: the same part in chrome, nickel and black is one
 * idea, not three. Producing them together also means the still set and the
 * video are cut from identical frames, so what the approver sees in the grid is
 * exactly what plays.
 */

export interface CampaignAssetRequest {
  productName: string;
  sku: string | null;
  /** Official photograph per finish, in the order they should appear. */
  variants: Array<{ finish: string; imageUrl: string; plateUrl?: string | null }>;
  palette: string;
  /** Wall-mounted parts get a wall and no contact shadow. */
  wallMounted?: boolean;
  /** Set the product's name, SKU and finish over each frame. */
  caption?: boolean;
  /** 1080 square for feed, 1080×1920 for stories and reels. */
  format: "square" | "story" | "landscape" | "square-4k" | "story-4k" | "landscape-4k";
  /** Cut a video as well as the stills. */
  motion: boolean;
}

export interface CampaignAssets {
  stills: Array<{
    finish: string;
    png: Buffer;
    /** True when the photograph disagreed with its label and was corrected. */
    corrected: boolean;
    note: string;
  }>;
  video: { mp4: Buffer; durationSeconds: number } | null;
  width: number;
  height: number;
  /** Anything a human should look at before this goes out. */
  warnings: string[];
}

/** Palettes dark enough to need light type. */
const DARK_PALETTES = new Set(["obsidian", "forest", "slate"]);

function titleCase(value: string): string {
  return value.replace(/\w/g, (c) => c.toUpperCase());
}

const FORMATS: Record<CampaignAssetRequest["format"], { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1350, height: 1080 },
  "square-4k": { width: 2160, height: 2160 },
  "story-4k": { width: 2160, height: 3840 },
  "landscape-4k": { width: 2700, height: 2160 },
};

export async function buildCampaignAssets(request: CampaignAssetRequest): Promise<CampaignAssets> {
  const { width, height } = FORMATS[request.format];
  const warnings: string[] = [];
  const stills: CampaignAssets["stills"] = [];

  for (const variant of request.variants) {
    let composition: Composition;
    try {
      composition = await composeProductScene({
        imageUrl: variant.imageUrl,
        plateUrl: variant.plateUrl ?? null,
        finish: variant.finish,
        mood: `studio:${request.palette}`,
        wallMounted: request.wallMounted === true,
        // Only the product's own name, SKU and verified finish are ever set.
        // A strapline written to fill the space would be an unverified claim
        // in a typeface.
        ...(request.caption === false
          ? {}
          : {
              caption: {
                title: request.productName,
                subtitle: [request.sku, titleCase(variant.finish)].filter(Boolean).join("  ·  "),
                placement: "bottom-left" as const,
                onDark: DARK_PALETTES.has(request.palette),
              },
            }),
        width,
        height,
        // Fixed: the backdrop is built, not sampled, so a re-render of the same
        // product must produce the same file.
        seed: 1,
      });
    } catch (error) {
      // One unreachable photograph should cost that finish, not the campaign.
      warnings.push(`${variant.finish}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (composition.finishCorrected) {
      warnings.push(
        `${variant.finish}: the official photograph did not match its label (${composition.finish.reason}); colour was corrected, geometry untouched.`,
      );
    }
    stills.push({
      finish: variant.finish,
      png: composition.png,
      corrected: composition.finishCorrected,
      note: composition.finish.reason,
    });
  }

  if (stills.length === 0) {
    throw new Error(
      `No usable photographs for ${request.productName}: ${warnings.join("; ") || "none supplied"}`,
    );
  }

  const video =
    request.motion && stills.length > 1
      ? await renderMotion({ frames: stills.map((s) => s.png), width, height }).then((m) => ({
          mp4: m.mp4,
          durationSeconds: m.durationSeconds,
        }))
      : null;

  if (request.motion && stills.length < 2) {
    warnings.push("Only one finish was usable, so there was nothing to cut a video between.");
  }

  return { stills, video, width, height, warnings };
}
