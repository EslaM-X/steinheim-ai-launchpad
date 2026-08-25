/**
 * Generates the room, never the product.
 *
 * This is the line the whole system turns on. A text-to-image model asked for
 * "a Steinheim basin mixer" produces something that looks like a tap and is
 * not one — tested against the live catalogue, it returned a spout with no
 * lever at all. Publishing that as a product photograph is the same offence as
 * inventing a specification, which the Truth Layer exists to prevent.
 *
 * So the model is only ever asked for an empty scene. The product is composited
 * in afterwards from the official photograph, unchanged. Every prompt below
 * therefore carries explicit instructions to leave the fixture out; a scene that
 * arrives with its own tap in it would put two in the frame.
 */

export interface SceneRequest {
  /** What the room should feel like, in plain words. */
  mood: string;
  width: number;
  height: number;
  /** Same seed, same scene — so a re-render is reproducible. */
  seed: number;
}

export interface Scene {
  png: Buffer;
  prompt: string;
  seed: number;
  source: string;
}

/** Never generate these; they are the product's job. */
const EXCLUDED = [
  "no tap",
  "no faucet",
  "no mixer",
  "no shower head",
  "no sink",
  "no basin",
  "no bathtub",
  "no mirror",
  "no bottles",
  "no plants",
  "no objects of any kind",
  "no text",
  "no watermark",
  "no logo",
  "no people",
];

/**
 * Scene directions that read as luxury interiors rather than stock bathrooms.
 *
 * Kept as data because they are editorial choices, not code: a marketer should
 * be able to add one without a deploy.
 */
export const SCENE_PRESETS: Record<string, string> = {
  marble:
    "macro photograph of a honed Calacatta marble slab surface meeting a matching marble wall, nothing on the surface, soft directional daylight from the left, shallow depth of field, architectural material study",
  concrete:
    "macro photograph of a warm grey micro-cement surface meeting a matching wall, nothing on the surface, low sun raking across it, architectural material study",
  travertine:
    "macro photograph of a warm travertine stone surface meeting a matching stone wall, nothing on the surface, diffuse morning light, calm neutral palette, architectural material study",
  obsidian:
    "macro photograph of a deep charcoal micro-cement surface meeting a matching dark wall, nothing on the surface, dramatic side lighting, architectural material study",
  "warm-oak":
    "macro photograph of a white oak surface meeting an off-white plaster wall, nothing on the surface, soft window light, scandinavian material study",
};

export function buildScenePrompt(mood: string): string {
  const base = SCENE_PRESETS[mood] ?? mood;
  return [
    base,
    // Asking for a bathroom invites the model to furnish one, and a scene that
    // arrives with its own chrome tap in the corner puts two in the frame —
    // observed. Asking for a bare material surface leaves it nothing to
    // furnish.
    "an empty surface and wall only, completely bare, no fixtures, no fittings",
    ...EXCLUDED,
    "photorealistic, high detail, 8k, no CGI look",
  ].join(", ");
}

/**
 * Fetches a generated scene.
 *
 * Pollinations is the default because it needs no key and no account, which
 * keeps a working install one `docker compose up` away. SCENE_IMAGE_URL points
 * this at any other OpenAI-shaped image endpoint when quality matters more than
 * setup — the rest of the pipeline does not care where the pixels came from.
 */
export async function generateScene(request: SceneRequest): Promise<Scene> {
  const prompt = buildScenePrompt(request.mood);
  const base = process.env["SCENE_IMAGE_URL"] ?? "https://image.pollinations.ai/prompt";
  const url =
    `${base.replace(/\/+$/, "")}/${encodeURIComponent(prompt)}` +
    `?width=${request.width}&height=${request.height}&seed=${request.seed}&nologo=true&model=flux`;

  const res = await fetch(url, {
    headers: { "user-agent": "SteinheimCreative/1.0" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`Scene generation failed (HTTP ${res.status}).`);
  }
  const png = Buffer.from(await res.arrayBuffer());
  if (png.byteLength < 4096) {
    throw new Error("Scene generation returned an image too small to be real.");
  }
  return { png, prompt, seed: request.seed, source: base };
}
