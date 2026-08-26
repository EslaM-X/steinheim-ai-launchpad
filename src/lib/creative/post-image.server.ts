import { buildCampaignAssets } from "./render/index";
import { platePath } from "./render/plates.server";

/**
 * Gives a post a photograph of the product it is actually about.
 *
 * The pipeline's image agent writes an image_prompt and stops, so until now
 * every post went out as text: the writer described a mixer nobody could see.
 * The obvious fix — hand that prompt to a text-to-image model — is the one
 * thing this must not do. A generated tap is an invented product, and a post
 * whose claims passed the truth layer beside a picture of something the
 * catalogue does not sell is a worse failure than no picture at all.
 *
 * So the image is built the way a campaign is: the plate for this product in
 * this finish, fitted into a room the brand actually photographed.
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

const BUCKET = "campaign-assets";

export interface PostImageResult {
  postId: string;
  ok: boolean;
  url?: string;
  finish?: string;
  scene?: string | null;
  /** Why that room, or why none. */
  placement?: string;
  /** Why it was skipped, when it was. */
  reason?: string;
  warnings?: string[];
}

/**
 * Each network crops to its own shape, and a story-tall frame squeezed into a
 * LinkedIn card loses the product. Matching the aspect at render time means the
 * mixer sits where it was placed rather than wherever the crop happens to land.
 */
const FORMAT_BY_PLATFORM: Record<string, "square" | "landscape" | "story"> = {
  instagram: "square",
  facebook: "landscape",
  linkedin: "landscape",
  tiktok: "story",
};

/**
 * Finish names as they appear in copy, most specific first.
 *
 * Order matters: a naive scan for "gold" matches "coffee gold" just as well as
 * "brushed gold", and Arabic "ذهبي" is shared by both. Testing the longer name
 * first stops a coffee-gold post being illustrated in brushed gold.
 */
const FINISH_ALIASES: Array<{ finish: string; patterns: RegExp[] }> = [
  { finish: "coffee gold", patterns: [/coffee\s*gold/i, /ذهب[يى]\s*(?:ال)?قهوة/, /كوفي\s*جولد/] },
  {
    finish: "brushed gold",
    patterns: [/brushed\s*gold/i, /ذهب[يى]\s*مصقول/, /ذهب[يى]/, /دهب[يى]/],
  },
  { finish: "brushed nickel", patterns: [/brushed\s*nickel/i, /نيكل/] },
  {
    finish: "matte black",
    patterns: [/matte\s*black/i, /\bblack\b/i, /[اأ]سود\s*مطف[يى]/, /[اأ]سود/],
  },
  { finish: "metal gun", patterns: [/metal\s*gun/i, /gun\s*metal/i, /جن\s*ميتال/, /رصاص[يى]/] },
  { finish: "chrome", patterns: [/\bchrome\b/i, /كروم/] },
];

/**
 * When the copy names no finish, this is the order preferred.
 *
 * Chrome leads because it is the one finish every product in the catalogue is
 * offered in, so the fallback can never land on a colour this particular
 * product is not made in.
 */
const DEFAULT_ORDER = [
  "chrome",
  "brushed nickel",
  "matte black",
  "brushed gold",
  "coffee gold",
  "metal gun",
];

/** Reads the finish the post is talking about out of its own copy. */
export function finishFromCopy(copy: string, available: string[]): string | null {
  for (const { finish, patterns } of FINISH_ALIASES) {
    if (!available.includes(finish)) continue;
    if (patterns.some((p) => p.test(copy))) return finish;
  }
  return null;
}

export async function attachImageToPost(
  supabase: DB,
  postId: string,
  options: { force?: boolean; caption?: boolean } = {},
): Promise<PostImageResult> {
  const { data: post } = await supabase
    .from("posts")
    .select("id, platform, idea_id, image_url, body_en, body_ar")
    .eq("id", postId)
    .maybeSingle();

  if (!post) return { postId, ok: false, reason: "No such post." };
  if (post.image_url && !options.force) {
    return { postId, ok: true, url: String(post.image_url), reason: "Already had an image." };
  }
  if (!post.idea_id) return { postId, ok: false, reason: "Post is not linked to an idea." };

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("id, product_id")
    .eq("id", post.idea_id)
    .maybeSingle();

  // An idea with no product is a brand or category piece. There is no honest
  // product photograph for it, and inventing one is the failure this exists to
  // avoid — so it keeps its text and says why.
  if (!idea?.product_id) {
    return { postId, ok: false, reason: "The idea names no product, so there is nothing to show." };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, name, sku, finishes, images, installation_type, source_slug")
    .eq("id", idea.product_id)
    .maybeSingle();
  if (!product) return { postId, ok: false, reason: "The idea's product is missing." };

  const finishes: string[] = Array.isArray(product.finishes) ? product.finishes : [];
  const images: string[] = Array.isArray(product.images) ? product.images : [];
  if (finishes.length === 0) {
    return { postId, ok: false, reason: `${product.name} lists no finishes.` };
  }

  const copy = `${post.body_en ?? ""}\n${post.body_ar ?? ""}`;
  const finish =
    finishFromCopy(copy, finishes) ??
    DEFAULT_ORDER.find((f) => finishes.includes(f)) ??
    finishes[0]!;

  // The catalogue names each photograph after the finish it shows, which is the
  // only link between a file and a colour. Pairing by name rather than by
  // position means a reordered array cannot label chrome as black.
  const photograph =
    images.find(
      (url) =>
        String(url)
          .split("/")
          .pop()
          ?.replace(/\.\w+$/, "")
          .replace(/-/g, " ") === finish,
    ) ?? images[0];

  if (!photograph) {
    return { postId, ok: false, reason: `${product.name} has no photographs.` };
  }

  const slug = String(product.source_slug ?? product.id);
  const plateUrl = supabase.storage.from(BUCKET).getPublicUrl(platePath(slug, finish))
    .data.publicUrl;
  const hasPlate = await head(plateUrl);

  // Both rooms are photographed around a basin, so only a basin mixer can be
  // shown installed in one. Everything else keeps the studio backdrop rather
  // than being stood on a basin rim, which would be a false claim made in a
  // picture — and pictures are believed faster than sentences.
  const { sceneForProduct } = await import("./render/scenes");
  const placement = sceneForProduct(
    String(product.name),
    product.installation_type as string | null,
  );
  const sceneId = placement.sceneId;
  const wallMounted = placement.mount === "wall";

  const format = FORMAT_BY_PLATFORM[String(post.platform).toLowerCase()] ?? "square";

  const assets = await buildCampaignAssets({
    productName: String(product.name),
    sku: product.sku ? String(product.sku) : null,
    variants: [{ finish, imageUrl: String(photograph), plateUrl: hasPlate ? plateUrl : null }],
    palette: "linen",
    format,
    motion: false,
    wallMounted,
    // The post's own copy already carries the name, the SKU and the finish.
    // Burning them into the frame as well reads as a stock advertisement and
    // says the same thing twice.
    caption: options.caption === true,
    sceneId,
  });

  const still = assets.stills[0];
  if (!still) {
    return {
      postId,
      ok: false,
      reason: "The renderer produced no frame.",
      warnings: assets.warnings,
    };
  }

  const path = `posts/${postId}/${format}-${finish.replace(/\s+/g, "-")}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, still.png, { contentType: "image/png", upsert: true });
  if (error) return { postId, ok: false, reason: `Could not store the image: ${error.message}` };

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  await supabase.from("posts").update({ image_url: url }).eq("id", postId);

  return {
    postId,
    ok: true,
    url,
    finish,
    scene: sceneId,
    // Said out loud even on success: a studio frame where a room was expected
    // is a decision, and one worth seeing in the job's own report.
    placement: placement.reason,
    ...(assets.warnings.length ? { warnings: assets.warnings } : {}),
  };
}

/** Every post belonging to one idea — the shape the daily run produces. */
export async function attachImagesForIdea(
  supabase: DB,
  ideaId: string,
  options: { force?: boolean } = {},
): Promise<PostImageResult[]> {
  const { data } = await supabase.from("posts").select("id").eq("idea_id", ideaId);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);

  const results: PostImageResult[] = [];
  // Sequential on purpose: each render is libvips work measured in seconds and
  // holds a full-resolution frame in memory. Three at once on the box that runs
  // this would compete with the pipeline still writing the next idea.
  for (const id of ids) {
    try {
      results.push(await attachImageToPost(supabase, id, options));
    } catch (error) {
      results.push({
        postId: id,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

async function head(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}
