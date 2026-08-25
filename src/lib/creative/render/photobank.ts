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
 *   Unsplash — free, commercial use permitted
 *   Pexels   — free, commercial use permitted
 *
 * Both need a free key. Without one the caller falls back to the built-in
 * studio backdrop, which is never wrong, only plainer.
 *
 * Unsplash's API guidelines are followed rather than merely acknowledged: the
 * download endpoint is triggered whenever a photograph is actually used, and
 * attribution carries the photographer's name, a link to their profile and a
 * link to Unsplash, all with the referral parameters they ask for. Those are
 * conditions of the licence, and a campaign built on an unmet condition is a
 * campaign built on nothing.
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
  source: "unsplash" | "pexels";
  photographer: string;
  /** The photographer's profile, for attribution. */
  photographerUrl: string;
  /** The photograph's own page. */
  sourceUrl: string;
  licence: string;
  /** Ready to print or store: "Photo by X on Unsplash". */
  credit: string;
}

/**
 * Search terms that return the rooms a luxury brand advertises in.
 *
 * An earlier version searched for materials rather than rooms — "marble wall
 * texture minimal empty" — reasoning that a room might arrive with its own tap
 * in it. It returned rough stonework and rendered a gold mixer against what
 * looked like a cellar. Asking for the interior gets the interior; the product
 * is composited over the frame, so a fixture already in shot sits behind it
 * rather than beside it.
 */
export const SUBJECTS: Record<string, string> = {
  marble: "luxury marble bathroom interior modern minimal",
  stone: "travertine limestone luxury bathroom interior warm",
  concrete: "microcement minimalist bathroom interior warm grey",
  spa: "luxury hotel spa bathroom interior calm neutral",
  wood: "oak wood luxury bathroom interior scandinavian",
  "dark-luxury": "dark moody luxury bathroom interior black marble",
};

/**
 * The referral parameters Unsplash asks every application to add.
 *
 * Must match the registered application name, which is how they attribute
 * traffic back and part of what a production application is reviewed on.
 */
const UTM = "utm_source=Steinheim-AI&utm_medium=referral";

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
      user?: { name?: string; links?: { html?: string } };
      links?: { html?: string; download_location?: string };
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

  // Required by the API guidelines, and only after the photograph has actually
  // been retrieved: it is what credits the photographer for the use. It is
  // fired without blocking, because a campaign should not fail over a metrics
  // call — but it is not skipped, because the licence is conditional on it.
  void triggerDownload(key, chosen.links?.download_location);

  const photographer = chosen.user?.name ?? "unknown";
  const photographerUrl = chosen.user?.links?.html
    ? `${chosen.user.links.html}?${UTM}`
    : `https://unsplash.com/?${UTM}`;

  return {
    bytes: Buffer.from(await image.arrayBuffer()),
    source: "unsplash",
    photographer,
    photographerUrl,
    sourceUrl: chosen.links?.html ?? "https://unsplash.com",
    licence: "Unsplash Licence — commercial use permitted",
    credit: `Photo by ${photographer} (${photographerUrl}) on Unsplash (https://unsplash.com/?${UTM})`,
  };
}

/**
 * Tells Unsplash a photograph was used.
 *
 * Separate from fetching the pixels on purpose. Their guidelines are explicit
 * that this fires when a photograph is actually used rather than merely listed
 * in search results, and an application that skips it is refused production
 * access — the difference between fifty requests an hour and a thousand.
 */
async function triggerDownload(key: string, downloadLocation: string | undefined): Promise<void> {
  if (!downloadLocation) return;
  try {
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    /* a metrics call is not worth failing a campaign over */
  }
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
    photos?: Array<{
      src?: { original?: string };
      photographer?: string;
      photographer_url?: string;
      url?: string;
    }>;
  };
  const photos = body.photos ?? [];
  if (photos.length === 0) return null;

  const chosen = photos[query.seed % photos.length]!;
  const original = chosen.src?.original;
  if (!original) return null;

  const image = await fetch(original, { signal: AbortSignal.timeout(60_000) });
  if (!image.ok) return null;

  const photographer = chosen.photographer ?? "unknown";
  const photographerUrl = chosen.photographer_url ?? "https://www.pexels.com";

  return {
    bytes: Buffer.from(await image.arrayBuffer()),
    source: "pexels",
    photographer,
    photographerUrl,
    sourceUrl: chosen.url ?? "https://www.pexels.com",
    licence: "Pexels Licence — commercial use permitted",
    credit: `Photo by ${photographer} (${photographerUrl}) on Pexels (https://www.pexels.com)`,
  };
}
