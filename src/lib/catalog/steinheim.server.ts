import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, "public", any>;

/**
 * Reads the official Steinheim catalogue and writes it into the Truth Layer.
 *
 * The whole point is that nobody types a specification into this system again.
 * That only works if the connector is disciplined about one thing: it reads
 * facts, it never infers them. Everything below comes from the page's own
 * schema.org Product data — name, SKU, price, currency, availability, images.
 * Marketing prose on the page is captured as evidence but is never promoted to
 * a claim, because a sentence a copywriter wrote is not a specification.
 *
 * A claim written here carries the fingerprint of the exact page state it came
 * from, so when the page changes the stale claims are identifiable rather than
 * merely old.
 */

export interface Variant {
  sku: string;
  finish: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  url: string | null;
}

export interface NormalisedProduct {
  slug: string;
  url: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  /**
   * Per-product technical specifications, when the page publishes them as
   * product fields. It currently does not: the payload carries a shared
   * specification vocabulary for the whole site ("Brass body", "Sedal ·
   * Neoperl", "1/2 inch · 0.5-5 bar") rather than values attached to a SKU.
   * Attributing a site-wide phrase to one product would be an inference, so
   * this stays null until the page says otherwise.
   */
  specs: Record<string, string> | null;
  collection: string | null;
  images: string[];
  variants: Variant[];
  primarySku: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  fingerprint: string;
}

const USER_AGENT = "SteinheimLaunchpad/1.0 (+catalog-sync)";

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Every schema.org block on a page, parsed and flattened. */
function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const match of html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed = JSON.parse((match[1] ?? "").trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === "object") out.push(node as Record<string, unknown>);
      }
    } catch {
      // A malformed block is skipped rather than failing the whole sync.
    }
  }
  return out;
}

/** Product slugs on the catalogue page, in the order the site lists them. */
export function extractSlugs(html: string): string[] {
  const slugs = new Set<string>();
  for (const m of html.matchAll(/\/en\/products\/([a-z0-9][a-z0-9-]{2,})/g)) {
    const slug = m[1]!;
    // Guard against the listing page linking to itself or to a filter.
    if (slug !== "products" && !slug.includes("?")) slugs.add(slug);
  }
  return [...slugs];
}

function finishFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]finish=([a-z0-9-]+)/i);
  return match ? match[1]!.replace(/-/g, " ") : null;
}

function shortAvailability(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.split("/").pop() ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function fetchProduct(baseUrl: string, slug: string): Promise<NormalisedProduct> {
  const url = `${baseUrl}/en/products/${slug}`;
  const html = await fetchText(url);
  const product = jsonLdBlocks(html).find((n) => n["@type"] === "Product");
  if (!product) throw new Error(`${slug}: no Product schema on the page`);

  const offers = (
    Array.isArray(product["offers"]) ? product["offers"] : [product["offers"]]
  ).filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object");

  const variants: Variant[] = offers.map((offer) => ({
    sku: String(offer["sku"] ?? ""),
    finish: finishFromUrl(offer["url"] as string | undefined),
    price: typeof offer["price"] === "number" ? offer["price"] : Number(offer["price"]) || null,
    currency: (offer["priceCurrency"] as string) ?? null,
    availability: shortAvailability(offer["availability"]),
    url: (offer["url"] as string) ?? null,
  }));

  const images = (Array.isArray(product["image"]) ? product["image"] : [product["image"]])
    .filter((i): i is string => typeof i === "string")
    .map((i) => (i.startsWith("http") ? i : `${baseUrl}${i}`));

  const name = String(product["name"] ?? slug);

  // The page's own meta description is product-specific, unlike the shared
  // marketing vocabulary elsewhere in the payload. It is stored as prose on
  // the product, never promoted to a claim.
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const description = descMatch?.[1] ? decodeEntities(descMatch[1]).trim() || null : null;
  // The collection is the first word of the product name on this catalogue —
  // derived, not invented, and only used for grouping.
  const collection = name.split(" ")[0] ?? null;

  // Arabic is read from the site's own Arabic route. It is never machine
  // translated here: a translated specification is not a verified one.
  let nameAr: string | null = null;
  try {
    const arHtml = await fetchText(`${baseUrl}/ar/products/${slug}`);
    const arProduct = jsonLdBlocks(arHtml).find((n) => n["@type"] === "Product");
    const candidate = arProduct?.["name"];
    if (typeof candidate === "string" && candidate !== name) nameAr = candidate;
  } catch {
    // No Arabic route for this product; the field stays null rather than guessed.
  }

  const primary = variants[0] ?? null;
  const payload = JSON.stringify({ name, nameAr, description, images, variants });

  return {
    slug,
    url,
    name,
    nameAr,
    description,
    specs: null,
    collection,
    images,
    variants,
    primarySku: primary?.sku ?? null,
    price: primary?.price ?? null,
    currency: primary?.currency ?? null,
    availability: primary?.availability ?? null,
    fingerprint: await sha256(payload),
  };
}

/**
 * Facts, phrased plainly, each one traceable to a field in the source. Nothing
 * here is an opinion, a benefit or a claim about quality — those are exactly
 * what the accuracy validator is meant to reject.
 */
function claimsFor(product: NormalisedProduct): Array<{ text: string; textAr: string | null }> {
  const claims: Array<{ text: string; textAr: string | null }> = [];
  const money = (v: number, c: string | null) => `${v.toLocaleString("en-US")} ${c ?? ""}`.trim();

  if (product.primarySku) {
    claims.push({
      text: `${product.name} is listed in the official Steinheim catalogue with SKU ${product.primarySku}.`,
      textAr: product.nameAr
        ? `${product.nameAr} مُدرج في كتالوج Steinheim الرسمي برمز ${product.primarySku}.`
        : null,
    });
  }

  const finishes = product.variants.map((v) => v.finish).filter((f): f is string => Boolean(f));
  if (finishes.length) {
    claims.push({
      text: `${product.name} is offered in ${finishes.length} finishes: ${finishes.join(", ")}.`,
      textAr: product.nameAr
        ? `${product.nameAr} متاح بـ${finishes.length} تشطيبات: ${finishes.join("، ")}.`
        : null,
    });
  }

  for (const variant of product.variants) {
    if (variant.price && variant.sku) {
      claims.push({
        text: `${product.name}${variant.finish ? ` in ${variant.finish}` : ""} (${variant.sku}) is listed at ${money(variant.price, variant.currency)}.`,
        textAr: null,
      });
    }
  }

  if (product.availability) {
    claims.push({
      text: `${product.name} is listed as ${product.availability} on the official website.`,
      textAr: null,
    });
  }

  return claims;
}

export interface SyncSummary {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: Array<{ slug: string; error: string }>;
  claimsWritten: number;
  claimsStale: number;
  archived?: number;
}

/**
 * One pass over the catalogue. Idempotent: a product whose fingerprint has not
 * moved is left alone, which is what makes running this hourly harmless.
 */
export async function syncCatalog(
  supabase: DB,
  options?: {
    limit?: number;
    /**
     * Called as each product is read. Reporting is the job runner's concern,
     * not the connector's, so this stays an optional hook rather than a
     * dependency on the jobs table.
     */
    onProgress?: (progress: { phase: string; done: number; total: number }) => void | Promise<void>;
  },
): Promise<SyncSummary> {
  const { data: source } = await supabase
    .from("catalog_sources")
    .select("id, base_url, catalog_path")
    .eq("name", "steinheim-official")
    .maybeSingle();
  if (!source) throw new Error("catalog source 'steinheim-official' is not configured");

  const baseUrl = String(source.base_url).replace(/\/+$/, "");
  await options?.onProgress?.({ phase: "Reading the catalogue index", done: 0, total: 0 });
  const listing = await fetchText(`${baseUrl}${source.catalog_path}`);
  let slugs = extractSlugs(listing);
  if (options?.limit) slugs = slugs.slice(0, options.limit);

  const summary: SyncSummary = {
    scanned: slugs.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: [],
    claimsWritten: 0,
    claimsStale: 0,
    archived: 0,
  };

  let done = 0;
  for (const slug of slugs) {
    await options?.onProgress?.({
      phase: `Reading ${slug}`,
      done,
      total: slugs.length,
    });
    done += 1;
    try {
      const product = await fetchProduct(baseUrl, slug);

      const { data: existing } = await supabase
        .from("products")
        .select("id, content_fingerprint")
        .eq("source_slug", slug)
        .maybeSingle();

      if (existing?.content_fingerprint === product.fingerprint) {
        summary.unchanged += 1;
        continue;
      }

      const row = {
        source_id: source.id,
        source_slug: slug,
        sku: product.primarySku ?? slug.toUpperCase(),
        name: product.name,
        name_ar: product.nameAr,
        official_name: product.name,
        product_url: product.url,
        source_url: product.url,
        finishes: product.variants.map((v) => v.finish).filter(Boolean) as string[],
        price_egp: product.currency === "EGP" ? product.price : null,
        currency: product.currency,
        availability: product.availability,
        variants: product.variants as never,
        images: product.images as never,
        description: product.description,
        technical_specs: (product.specs ?? {}) as never,
        content_fingerprint: product.fingerprint,
        synced_at: new Date().toISOString(),
        // The catalogue proves the product exists and what it costs. It does not
        // prove a technical specification, so verification stops where the
        // evidence stops.
        verification_status: "verified",
        last_verified_at: new Date().toISOString(),
        is_active: product.availability !== "OutOfStock",
      };

      let productId = existing?.id as string | undefined;
      if (productId) {
        await supabase.from("products").update(row).eq("id", productId);
        summary.updated += 1;
      } else {
        const { data: inserted } = await supabase
          .from("products")
          .insert(row)
          .select("id")
          .maybeSingle();
        productId = inserted?.id as string | undefined;
        summary.created += 1;
      }
      if (!productId) throw new Error("product row was not returned after write");

      // Claims from the previous snapshot describe a page that no longer
      // exists. They are retired, not deleted: content already published
      // against them still needs an audit trail.
      const { data: retired } = await supabase
        .from("claims")
        .update({ verified: false, notes: "Superseded by a newer catalogue snapshot." })
        .eq("entity_id", productId)
        .eq("extracted_by", "catalog_sync")
        .neq("source_fingerprint", product.fingerprint)
        .select("id");
      summary.claimsStale += retired?.length ?? 0;

      const claims = claimsFor(product).map((claim) => ({
        claim_text: claim.text,
        claim_text_ar: claim.textAr,
        claim_type: "technical",
        entity_type: "product",
        entity_id: productId,
        entity_label: product.name,
        source_type: "official_product_page",
        source_url: product.url,
        source_tier: 1,
        verified: true,
        confidence: "high",
        extracted_by: "catalog_sync",
        source_fingerprint: product.fingerprint,
        evidence: `schema.org Product data published at ${product.url}`,
        verified_at: new Date().toISOString(),
      }));

      if (claims.length) {
        await supabase.from("claims").insert(claims);
        summary.claimsWritten += claims.length;
      }
    } catch (error) {
      summary.failed.push({
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // A product that disappeared from the catalogue is archived, never deleted:
  // content already published against it still needs its source to exist.
  // slugs.length is part of the guard on purpose: an empty listing (a site
  // outage, a moved catalogue path) would otherwise archive the whole
  // catalogue in one pass.
  await options?.onProgress?.({
    phase: "Writing changes",
    done: slugs.length,
    total: slugs.length,
  });

  if (!options?.limit && summary.failed.length === 0 && slugs.length > 0) {
    const { data: archived } = await supabase
      .from("products")
      .update({ is_active: false, availability: "Discontinued" })
      .eq("source_id", source.id)
      .not("source_slug", "in", `(${slugs.map((s) => `"${s}"`).join(",")})`)
      .eq("is_active", true)
      .select("id");
    summary.archived = archived?.length ?? 0;
  }

  await supabase
    .from("catalog_sources")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: summary.failed.length ? "partial" : "ok",
      last_sync_summary: summary as never,
    })
    .eq("id", source.id);

  return summary;
}
