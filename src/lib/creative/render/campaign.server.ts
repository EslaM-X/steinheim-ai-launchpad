import { buildCampaignAssets, type CampaignAssets } from "./index";

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
  format: "square" | "story" | "landscape";
  motion: boolean;
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

  const wallMounted = /wall/i.test(String(product.installation_type ?? product.name ?? ""));

  const assets: CampaignAssets = await buildCampaignAssets({
    productName: String(product.name),
    sku: product.sku ? String(product.sku) : null,
    variants,
    palette: request.palette,
    format: request.format,
    motion: request.motion,
    wallMounted,
  });

  const slug = String(product.source_slug ?? product.id);
  const stills: RenderedCampaign["stills"] = [];
  for (const still of assets.stills) {
    const path = `${slug}/${request.format}/${request.palette}/${still.finish.replace(/\s+/g, "-")}.png`;
    stills.push({
      finish: still.finish,
      url: await put(supabase, path, still.png, "image/png"),
      corrected: still.corrected,
    });
  }

  let video: RenderedCampaign["video"] = null;
  if (assets.video) {
    const path = `${slug}/${request.format}/${request.palette}/motion.mp4`;
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
