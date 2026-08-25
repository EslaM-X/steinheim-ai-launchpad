import sharp from "sharp";

import { cutOutProduct } from "./cutout";
import { PLATING, replate } from "./plating";

/**
 * Builds the canonical image of every product in every finish it is sold in,
 * once, and stores it.
 *
 * The catalogue's own photographs cannot be used directly. They were generated
 * rather than shot, their colour drifts by a factor of five inside a single
 * finish name, and each one still carries its studio backdrop. Replating them
 * on every render worked but redid identical work for every campaign, every
 * format and every palette — and left no single artefact anyone could point at
 * and call "the Brushed Gold one".
 *
 * A plate is that artefact: backdrop removed, colour taken from the finish
 * specification, geometry untouched, stored at full source resolution with
 * transparency. Everything downstream — campaign stills, scene replacement,
 * video — starts from a plate rather than from a photograph nobody vouches for.
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

/** Where a product's plate for one finish lives. */
export function platePath(slug: string, finish: string): string {
  return `plates/${slug}/${finish.trim().toLowerCase().replace(/\s+/g, "-")}.png`;
}

export interface PlateResult {
  slug: string;
  finish: string;
  url: string;
  width: number;
  height: number;
}

export interface PlateLibrarySummary {
  products: number;
  plates: number;
  skipped: number;
  failed: Array<{ slug: string; finish: string; error: string }>;
  results: PlateResult[];
}

export interface PlateLibraryOptions {
  /** Restrict to one product. Omitted does the whole catalogue. */
  productId?: string;
  /** Report progress as each plate lands. */
  onProgress?: (progress: { phase: string; done: number; total: number }) => void | Promise<void>;
}

export async function buildPlateLibrary(
  supabase: DB,
  options: PlateLibraryOptions = {},
): Promise<PlateLibrarySummary> {
  let query = supabase
    .from("products")
    .select("id, name, sku, finishes, images, source_slug")
    .not("source_id", "is", null);
  if (options.productId) query = query.eq("id", options.productId);
  const { data: products } = await query;

  const summary: PlateLibrarySummary = {
    products: 0,
    plates: 0,
    skipped: 0,
    failed: [],
    results: [],
  };

  // Every finish the product is sold in gets a plate, whichever photograph is
  // available. One source image can therefore produce five plates: the geometry
  // is identical across finishes, only the plating differs, and using one clean
  // source for all of them is what finally makes a set match.
  const jobs: Array<{ slug: string; finish: string; sourceUrl: string }> = [];
  for (const product of products ?? []) {
    const slug = String(product.source_slug ?? product.id);
    const finishes: string[] = Array.isArray(product.finishes) ? product.finishes : [];
    const images: string[] = Array.isArray(product.images) ? product.images : [];
    if (finishes.length === 0 || images.length === 0) continue;
    summary.products += 1;

    for (const finish of finishes) {
      const source = bestSourceFor(images, finish);
      if (!source) {
        summary.skipped += 1;
        continue;
      }
      jobs.push({ slug, finish, sourceUrl: source });
    }
  }

  // Sources are fetched once and reused. A product with five finishes and one
  // usable photograph would otherwise download the same file five times.
  const cache = new Map<string, Buffer>();
  let done = 0;

  for (const job of jobs) {
    await options.onProgress?.({
      phase: `${job.slug} · ${job.finish}`,
      done,
      total: jobs.length,
    });
    done += 1;
    try {
      let source = cache.get(job.sourceUrl);
      if (!source) {
        const res = await fetch(job.sourceUrl, {
          headers: { "user-agent": "SteinheimCreative/1.0" },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        source = Buffer.from(await res.arrayBuffer());
        cache.set(job.sourceUrl, source);
      }

      const cut = await cutOutProduct(source);
      const plated = await replate(cut.png, job.finish);
      const finished = await enhance(plated.png);

      const path = platePath(job.slug, job.finish);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, finished.png, { contentType: "image/png", upsert: true });
      if (error) throw new Error(error.message);

      summary.plates += 1;
      summary.results.push({
        slug: job.slug,
        finish: job.finish,
        url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        width: finished.width,
        height: finished.height,
      });
    } catch (error) {
      summary.failed.push({
        slug: job.slug,
        finish: job.finish,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await options.onProgress?.({ phase: "Complete", done: jobs.length, total: jobs.length });
  return summary;
}

/**
 * Picks the one photograph every finish is plated from.
 *
 * Deliberately not the photograph already labelled with that finish. Those
 * disagree with each other by a factor of five inside a single finish name, and
 * plating each finish from its own image carries that disagreement straight
 * through — which was the original complaint.
 *
 * One neutral master, in luminance order. Chrome first: it holds the widest
 * range, bright specular through deep shadow, and the plating curve reads
 * luminance. Brushed nickel next for the same reason.
 *
 * Matte black is last, and only as a source of final resort. Asked to test it
 * as the master — the reasoning being that black shows the form most clearly —
 * the result settled it: gold came out flat olive, chrome came out like painted
 * plastic, and metal gun stayed black. Black describes the silhouette well and
 * the surface not at all, because a metal is its reflections and a matte finish
 * has none to read.
 */
function bestSourceFor(images: string[], _finish: string): string | null {
  const nameOf = (url: string) =>
    String(url)
      .split("/")
      .pop()
      ?.replace(/\.\w+$/, "")
      .replace(/-/g, " ") ?? "";

  for (const preferred of MASTER_ORDER) {
    const match = images.find((url) => nameOf(url) === preferred);
    if (match) return match;
  }
  return images[0] ?? null;
}

/** Sources in descending order of how much luminance they carry. */
const MASTER_ORDER = [
  "chrome",
  "brushed nickel",
  "brushed gold",
  "coffee gold",
  "metal gun",
  "matte black",
];

/**
 * Recovers what the source gives up.
 *
 * These images are soft — generated, then compressed. Nothing here invents
 * detail, which would be the same offence as inventing a specification: an
 * unsharp mask raises the contrast of edges that are already present, and
 * nothing more. It is applied gently, because an over-sharpened product looks
 * cheaper than a soft one.
 */
async function enhance(png: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const image = sharp(png);
  const meta = await image.metadata();
  const out = await image
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2.4 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png: out, width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** The finishes a plate can be built for. */
export function plateableFinishes(): string[] {
  return Object.keys(PLATING);
}
