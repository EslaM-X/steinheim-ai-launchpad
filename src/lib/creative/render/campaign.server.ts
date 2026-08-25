import { buildCampaignAssets, type CampaignAssets } from "./index";
import { platePath } from "./plates.server";

/**
 * Produces a campaign's assets for one product, straight from the catalogue.
 *
 * Nothing here is chosen by hand. The finishes, their photographs and the SKU
 * all come from the row the catalogue sync wrote, so an asset set can only ever
 * show finishes the official site actually lists — and when the site drops one,
 * the next sync drops it here too.
 */

type DB = {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        options?: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export interface RenderCampaignRequest {
  productId: string;
  palette: string;
  format: "square" | "story" | "landscape" | "square-4k" | "story-4k" | "landscape-4k";
  motion: boolean;
  /** Defaults on. Off produces clean plates for a designer to set type over. */
  caption?: boolean;
  /**
   * "auto" picks a room matching the product's mounting; a scene id names one;
   * omitted keeps the studio backdrop.
   */
  scene?: string | null;
}

export interface RenderedCampaign {
  productName: string;
  sku: string | null;
  stills: Array<{ finish: string; url: string; corrected: boolean }>;
  video: { url: string; durationSeconds: number } | null;
  warnings: string[];
}

/** Where rendered assets live. Created by the migration alongside this module. */
const BUCKET = "campaign-assets";

export async function renderCampaignForProduct(
  supabase: DB,
  request: RenderCampaignRequest,
): Promise<RenderedCampaign> {
  const { data: product } = await supabase
    .from("products")
    .select("id, name, sku, finishes, images, installation_type, source_slug")
    .eq("id", request.productId)
    .maybeSingle();
  if (!product) throw new Error(`No product ${request.productId}.`);

  const finishes: string[] = Array.isArray(product.finishes) ? product.finishes : [];
  const images: string[] = Array.isArray(product.images) ? product.images : [];

  // The catalogue names each file after its finish, which is the only link
  // between a photograph and the finish it is supposed to show. Pairing them
  // here — rather than assuming order — means a reordered image array cannot
  // silently label chrome as black.
  const variants = images
    .map((url) => ({
      finish:
        String(url)
          .split("/")
          .pop()
          ?.replace(/\.\w+$/, "")
          .replace(/-/g, " ") ?? "",
      imageUrl: url,
    }))
    .filter((v) => finishes.includes(v.finish));

  if (variants.length === 0) {
    throw new Error(
      `${product.name} has ${images.length} photographs and ${finishes.length} finishes, but none could be paired by filename.`,
    );
  }

  // A plate, when one exists, is the canonical image of this product in this
  // finish: backdrop already removed, colour already taken from the
  // specification. Falling back to the raw photograph keeps a product whose
  // plates have not been built from dropping out of a campaign.
  const withPlates = await Promise.all(
    variants.map(async (variant) => {
      const url = supabase.storage
        .from(BUCKET)
        .getPublicUrl(platePath(String(product.source_slug ?? product.id), variant.finish))
        .data.publicUrl;
      const exists = await head(url);
      return { ...variant, plateUrl: exists ? url : null };
    }),
  );

  const wallMounted = /wall/i.test(String(product.installation_type ?? product.name ?? ""));

  // A room is chosen by how the product mounts, not by preference. Standing a
  // deck-mounted mixer on a wall bracket would be a picture of something that
  // cannot be installed.
  let sceneId: string | null = null;
  if (request.scene) {
    const { scenesFor } = await import("./scenes");
    if (request.scene === "auto") {
      sceneId = scenesFor(wallMounted ? "wall" : "deck")[0]?.id ?? null;
    } else {
      sceneId = request.scene;
    }
  }

  const assets: CampaignAssets = await buildCampaignAssets({
    productName: String(product.name),
    sku: product.sku ? String(product.sku) : null,
    variants: withPlates,
    palette: request.palette,
    format: request.format,
    motion: request.motion,
    wallMounted,
    caption: request.caption !== false,
    sceneId,
  });

  const slug = String(product.source_slug ?? product.id);
  const stills: RenderedCampaign["stills"] = [];
  for (const still of assets.stills) {
    const folder = sceneId ? `scene-${sceneId}` : request.palette;
    const path = `${slug}/${request.format}/${folder}/${still.finish.replace(/\s+/g, "-")}.png`;
    stills.push({
      finish: still.finish,
      url: await put(supabase, path, still.png, "image/png"),
      corrected: still.corrected,
    });
  }

  let video: RenderedCampaign["video"] = null;
  if (assets.video) {
    const path = `${slug}/${request.format}/${sceneId ? `scene-${sceneId}` : request.palette}/motion.mp4`;
    video = {
      url: await put(supabase, path, assets.video.mp4, "video/mp4"),
      durationSeconds: assets.video.durationSeconds,
    };
  }

  return {
    productName: String(product.name),
    sku: product.sku ? String(product.sku) : null,
    stills,
    video,
    warnings: assets.warnings,
  };
}

/** Whether a public object is actually there, without downloading it. */
async function head(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function put(supabase: DB, path: string, body: Buffer, contentType: string): Promise<string> {
  // Upsert on purpose: re-rendering the same product, palette and format is
  // meant to replace what was there, not accumulate a second copy nobody can
  // tell apart from the first.
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Could not store ${path}: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
