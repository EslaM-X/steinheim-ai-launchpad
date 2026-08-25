import sharp from "sharp";

/**
 * The optics that separate a catalogue cut-out from an advertisement.
 *
 * A product dropped onto a gradient reads as a product dropped onto a gradient.
 * Four things change that, and none of them touch the part's geometry:
 *
 *   a reflection, because polished stone reflects and its absence is the first
 *   thing that looks wrong;
 *
 *   a rim light along the edge facing the key, which is how a studio separates
 *   a dark object from a dark ground without lifting the whole frame;
 *
 *   a vignette, which is where the eye goes;
 *
 *   and a shared grade, so the part and the ground look photographed in the
 *   same room rather than pasted together.
 *
 * All four are applied to pixels, not to the silhouette. The part that comes
 * out is still the part that was photographed.
 */

export interface ReflectionOptions {
  /** How much of the part's height reflects before it fades out. */
  extent: number;
  /** Opacity where the reflection meets the part. */
  strength: number;
  blur: number;
}

/**
 * Mirrors the part below itself and fades it into the surface.
 *
 * The fade is the whole trick: a reflection at constant opacity looks like a
 * second product standing upside down. Real ones lose contrast with distance
 * because the surface scatters, so the alpha ramps to nothing.
 */
export async function buildReflection(
  productPng: Buffer,
  width: number,
  height: number,
  options: ReflectionOptions,
): Promise<{ png: Buffer; height: number } | null> {
  const reflectHeight = Math.max(8, Math.round(height * options.extent));

  const flipped = await sharp(productPng)
    .flip()
    .extract({ left: 0, top: 0, width, height: reflectHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = flipped.info;
  if (channels < 4) return null;

  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    // Linear ramp squared: the falloff is faster near the surface than a
    // straight fade, which is what stops the tail of the reflection reading as
    // a smudge.
    const t = 1 - y / h;
    const fade = t * t * options.strength;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * channels;
      const d = (y * w + x) * 4;
      out[d] = flipped.data[s]!;
      out[d + 1] = flipped.data[s + 1]!;
      out[d + 2] = flipped.data[s + 2]!;
      out[d + 3] = Math.round(flipped.data[s + 3]! * fade);
    }
  }

  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .blur(options.blur)
    .png()
    .toBuffer();
  return { png, height: h };
}

/**
 * Adds a bright edge along the side of the part facing the key light.
 *
 * Built from the part's own alpha: the rim is the difference between the
 * silhouette and a slightly shrunken copy of it, which follows every curve of
 * the real outline instead of approximating one.
 */
export async function buildRimLight(
  productPng: Buffer,
  width: number,
  height: number,
  options: { fromLeft: boolean; strength: number; tint: [number, number, number] },
): Promise<Buffer | null> {
  const alpha = await sharp(productPng)
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = alpha.info.channels;

  const read = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return alpha.data[(y * width + x) * ch]!;
  };

  const out = Buffer.alloc(width * height * 4);
  const dir = options.fromLeft ? -1 : 1;
  let lit = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = read(x, y);
      if (here < 200) continue;
      // Inside the part, but with open space a few pixels towards the key: that
      // is the edge the light would catch.
      const outward = read(x + dir * RIM_WIDTH, y);
      if (outward > 60) continue;
      const d = (y * width + x) * 4;
      out[d] = options.tint[0];
      out[d + 1] = options.tint[1];
      out[d + 2] = options.tint[2];
      out[d + 3] = Math.round(255 * options.strength);
      lit += 1;
    }
  }
  if (lit === 0) return null;

  return sharp(out, { raw: { width, height, channels: 4 } })
    .blur(RIM_BLUR)
    .png()
    .toBuffer();
}

/**
 * Darkens the corners of a finished frame.
 *
 * Applied last, over everything, because a vignette that sits under the product
 * darkens the ground and leaves the part sitting on top of it looking cut out —
 * which is the opposite of the intent.
 */
export async function applyVignette(
  frame: Buffer,
  width: number,
  height: number,
  strength: number,
): Promise<Buffer> {
  const mask = Buffer.alloc(width * height * 4);
  const cx = 0.5;
  const cy = 0.46;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x / width - cx) / 0.72;
      const dy = (y / height - cy) / 0.78;
      const r = Math.sqrt(dx * dx + dy * dy);
      const darken = Math.min(1, Math.max(0, (r - 0.55) / 0.75));
      const d = (y * width + x) * 4;
      mask[d] = 0;
      mask[d + 1] = 0;
      mask[d + 2] = 0;
      mask[d + 3] = Math.round(255 * darken * darken * strength);
    }
  }
  return sharp(frame)
    .composite([{ input: mask, raw: { width, height, channels: 4 }, blend: "over" }])
    .png()
    .toBuffer();
}

/**
 * Adds fine grain.
 *
 * A perfectly clean gradient bands on a phone, and banding is the single most
 * recognisable sign that an image was generated rather than photographed.
 */
export async function applyGrain(
  frame: Buffer,
  width: number,
  height: number,
  amount: number,
  seed: number,
): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 4);
  // Deterministic: a re-render has to produce the same file, so the grain
  // cannot come from Math.random().
  let state = seed >>> 0 || 1;
  for (let i = 0; i < width * height; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const v = (state >>> 24) - 128;
    const d = i * 4;
    const lift = v > 0 ? 255 : 0;
    noise[d] = lift;
    noise[d + 1] = lift;
    noise[d + 2] = lift;
    noise[d + 3] = Math.round(Math.abs(v) * amount);
  }
  // soft-light rather than overlay. Overlay pushes midtones hard, and a brushed
  // gold surface is nearly all midtone — it came back visibly mottled, which is
  // worse than the banding the grain was added to prevent.
  return sharp(frame)
    .composite([{ input: noise, raw: { width, height, channels: 4 }, blend: "soft-light" }])
    .png()
    .toBuffer();
}

/** How far in from the edge the rim light sits, in pixels. */
const RIM_WIDTH = 5;

/** Softens the rim so it reads as light rather than a drawn outline. */
const RIM_BLUR = 3.2;
