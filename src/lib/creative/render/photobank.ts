/**
 * Fetches real interior photography to place products into.
 *
 * Pinterest was asked for and is not used. Its images belong to the
 * photographers and brands who made them; putting one behind a Steinheim
 * product in a paid campaign is copyright infringement, and its terms forbid
 * the scraping that would be needed to get them. That is a liability for the
 * business rather than a technical obstacle, so the sources here are ones whose
 * licences permit commercial use in writing:
 *
 *   Unsplash — free, commercial use permitted, no attribution required
 *   Pexels   — free, commercial use permitted, no attribution required
 *
 * Both need a free key. Without one the caller falls back to the built-in
 * studio backdrop, which is never wrong, only plainer.
 *
 * Attribution is recorded whether or not the licence demands it. A campaign
 * asset whose background nobody can trace is exactly the kind of unsourced
 * claim the rest of this system exists to refuse.
 */

export interface PhotoQuery {
  /** What the scene should show. */
  subject: string;
  width: number;
  height: number;
  /** Same seed, same photograph, so a re-render is reproducible. */
  seed: number;
}

export interface Photo {
  bytes: Buffer;
  /** Where it came from, for the record. */
  source: "unsplash" | "pexels";
  photographer: string;
  sourceUrl: string;
  licence: string;
}

/**
 * Search terms that return rooms rather than product shots.
 *
 * A search for "luxury bathroom" returns pictures with taps in them, and a tap
 * in the background beside the product puts two in the frame. These lean on
 * material, surface and architecture, and the caller crops to the part of the
 * frame that holds no fixture.
 */
export const SUBJECTS: Record<string, string> = {
  marble: "marble bathroom wall texture minimal empty",
  stone: "travertine stone wall interior minimal empty",
  concrete: "microcement wall minimal interior empty warm",
  spa: "luxury spa interior minimal stone empty calm",
  wood: "oak wood panel wall minimal interior empty",
  "dark-luxury": "dark marble interior wall moody minimal empty",
};

export function photoBankConfigured(): boolean {
  return Boolean(process.env["UNSPLASH_ACCESS_KEY"] ?? process.env["PEXELS_API_KEY"]);
}

export async function fetchPhoto(query: PhotoQuery): Promise<Photo | null> {
  const unsplash = process.env["UNSPLASH_ACCESS_KEY"];
  const pexels = process.env["PEXELS_API_KEY"];

  if (unsplash) {
    const photo = await fromUnsplash(unsplash, query);
    if (photo) return photo;
  }
  if (pexels) {
    const photo = await fromPexels(pexels, query);
    if (photo) return photo;
  }
  return null;
}

async function fromUnsplash(key: string, query: PhotoQuery): Promise<Photo | null> {
  const term = SUBJECTS[query.subject] ?? query.subject;
  const orientation = query.height > query.width ? "portrait" : "landscape";
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(term)}` +
    `&orientation=${orientation}&per_page=30&content_filter=high`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    results?: Array<{
      urls?: { raw?: string };
      user?: { name?: string };
      links?: { html?: string };
    }>;
  };
  const results = body.results ?? [];
  if (results.length === 0) return null;

  // The seed picks the photograph, so the same request always returns the same
  // one — a re-render must not quietly change the background an approver saw.
  const chosen = results[query.seed % results.length]!;
  const raw = chosen.urls?.raw;
  if (!raw) return null;

  const image = await fetch(`${raw}&w=${query.width * 2}&fit=max&q=90&fm=jpg`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!image.ok) return null;

  return {
    bytes: Buffer.from(await image.arrayBuffer()),
    source: "unsplash",
    photographer: chosen.user?.name ?? "unknown",
    sourceUrl: chosen.links?.html ?? "https://unsplash.com",
    licence: "Unsplash Licence — commercial use permitted",
  };
}

async function fromPexels(key: string, query: PhotoQuery): Promise<Photo | null> {
  const term = SUBJECTS[query.subject] ?? query.subject;
  const orientation = query.height > query.width ? "portrait" : "landscape";
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}` +
    `&orientation=${orientation}&per_page=30`;

  const res = await fetch(url, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    photos?: Array<{ src?: { original?: string }; photographer?: string; url?: string }>;
  };
  const photos = body.photos ?? [];
  if (photos.length === 0) return null;

  const chosen = photos[query.seed % photos.length]!;
  const original = chosen.src?.original;
  if (!original) return null;

  const image = await fetch(original, { signal: AbortSignal.timeout(60_000) });
  if (!image.ok) return null;

  return {
    bytes: Buffer.from(await image.arrayBuffer()),
    source: "pexels",
    photographer: chosen.photographer ?? "unknown",
    sourceUrl: chosen.url ?? "https://pexels.com",
    licence: "Pexels Licence — commercial use permitted",
  };
}
