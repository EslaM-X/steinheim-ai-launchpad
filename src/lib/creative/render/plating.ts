import sharp from "sharp";

/**
 * Replates a product photograph in the finish the catalogue says it is.
 *
 * The catalogue's photographs disagree with each other. Measured across the
 * live catalogue, "brushed gold" ranges from 0.31 to 0.52 saturation and
 * "brushed nickel" from 0.04 to 0.19 — a five-fold spread inside one finish
 * name. They were generated rather than photographed, so nothing ever held them
 * to a standard. Publishing them as a set puts two different golds side by side
 * and calls both of them Brushed Gold.
 *
 * So colour is not sampled from the photograph any more. It is looked up from
 * the finish, and the photograph supplies everything else.
 *
 * The mechanism is a luminance ramp. Each pixel's brightness — which carries
 * every highlight, every shadow, every stroke of the brushed texture, the whole
 * description of the object's shape — is measured, normalised against the
 * product's own range, and used to look up a colour on that metal's curve. Form
 * comes from the photograph; hue comes from the specification. A replated image
 * is the same object under correct plating, down to the pixel, and two products
 * in the same finish now match each other exactly.
 */

export interface PlatingRamp {
  /** Deepest shadow on the metal. */
  shadow: [number, number, number];
  /** Its diffuse body colour. */
  mid: [number, number, number];
  /** Specular highlight. */
  highlight: [number, number, number];
  /**
   * How much of the original pixel colour survives, 0–1.
   *
   * A little is worth keeping: it preserves the faint colour variation a real
   * surface has, which a pure lookup flattens into something that reads as a
   * 3D render.
   */
  keep: number;
}

/**
 * What each finish actually looks like.
 *
 * These are the specification, not an average of the photographs — averaging
 * inconsistent sources would enshrine the inconsistency. Chrome is neutral and
 * very high contrast; brushed nickel warmer and softer; matte black almost
 * without a specular at all; the golds warm, with coffee gold darker and
 * redder; metal gun dark and cool.
 */
export const PLATING: Record<string, PlatingRamp> = {
  chrome: {
    shadow: [38, 42, 48],
    mid: [152, 158, 166],
    highlight: [248, 250, 253],
    keep: 0.12,
  },
  "brushed nickel": {
    shadow: [56, 53, 48],
    mid: [150, 145, 134],
    highlight: [228, 222, 209],
    keep: 0.14,
  },
  "matte black": {
    shadow: [12, 12, 13],
    mid: [40, 40, 42],
    highlight: [92, 92, 96],
    keep: 0.16,
  },
  "brushed gold": {
    shadow: [72, 53, 18],
    mid: [180, 147, 71],
    highlight: [243, 224, 158],
    keep: 0.12,
  },
  "coffee gold": {
    shadow: [46, 33, 25],
    mid: [131, 99, 80],
    highlight: [208, 172, 148],
    keep: 0.12,
  },
  "metal gun": {
    shadow: [26, 28, 32],
    mid: [82, 86, 92],
    highlight: [152, 157, 164],
    keep: 0.12,
  },
};

export function platedFinishes(): string[] {
  return Object.keys(PLATING);
}

export interface PlatingResult {
  png: Buffer;
  /** False when the finish has no ramp and the photograph was left alone. */
  replated: boolean;
  finish: string;
  note: string;
}

/**
 * Applies the finish's ramp to a cut-out product.
 *
 * Expects RGBA with the backdrop already removed: transparent pixels are
 * skipped, so nothing outside the part is touched.
 */
export async function replate(cutoutPng: Buffer, finish: string): Promise<PlatingResult> {
  const key = finish.trim().toLowerCase();
  const ramp = PLATING[key];
  if (!ramp) {
    return {
      png: cutoutPng,
      replated: false,
      finish: key,
      note: "no plating curve for this finish; the photograph is used unchanged",
    };
  }

  const { data, info } = await sharp(cutoutPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Luminance first, so the normalisation range is measured on the product
  // alone. Including the transparent surround would put the floor at zero and
  // crush every shadow on the part into black.
  const total = width * height;
  const luma = new Float32Array(total);
  const histogram = new Uint32Array(256);
  let opaque = 0;

  for (let i = 0; i < total; i++) {
    const s = i * channels;
    if (data[s + 3]! < 8) {
      luma[i] = -1;
      continue;
    }
    // Rec. 709: green carries most of perceived brightness, blue almost none.
    const l = 0.2126 * data[s]! + 0.7152 * data[s + 1]! + 0.0722 * data[s + 2]!;
    luma[i] = l;
    histogram[Math.min(255, Math.max(0, Math.round(l)))]! += 1;
    opaque += 1;
  }
  if (opaque === 0) {
    return { png: cutoutPng, replated: false, finish: key, note: "nothing opaque to replate" };
  }

  // Percentiles, not min and max. One blown highlight or one black speck would
  // otherwise set the whole range and flatten everything between them.
  const floor = percentile(histogram, opaque, 0.02);
  const ceiling = percentile(histogram, opaque, 0.98);
  const span = Math.max(1, ceiling - floor);

  const out = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i++) {
    const s = i * channels;
    const d = i * 4;
    const alpha = data[s + 3]!;
    out[d + 3] = alpha;
    if (luma[i]! < 0) continue;

    const t = clamp01((luma[i]! - floor) / span);
    const [r, g, b] = sample(ramp, t);
    // A trace of the original keeps the surface from reading as a render.
    out[d] = mix(r, data[s]!, ramp.keep);
    out[d + 1] = mix(g, data[s + 1]!, ramp.keep);
    out[d + 2] = mix(b, data[s + 2]!, ramp.keep);
  }

  return {
    png: await sharp(out, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
    replated: true,
    finish: key,
    note: `replated to the ${key} curve; luminance ${Math.round(floor)}–${Math.round(ceiling)} preserved`,
  };
}

/** Two straight segments through shadow, mid and highlight. */
function sample(ramp: PlatingRamp, t: number): [number, number, number] {
  if (t <= 0.5) {
    const k = t * 2;
    return [
      lerp(ramp.shadow[0], ramp.mid[0], k),
      lerp(ramp.shadow[1], ramp.mid[1], k),
      lerp(ramp.shadow[2], ramp.mid[2], k),
    ];
  }
  const k = (t - 0.5) * 2;
  return [
    lerp(ramp.mid[0], ramp.highlight[0], k),
    lerp(ramp.mid[1], ramp.highlight[1], k),
    lerp(ramp.mid[2], ramp.highlight[2], k),
  ];
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]!;
    if (seen >= target) return v;
  }
  return 255;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (target: number, original: number, keep: number) =>
  Math.round(Math.min(255, Math.max(0, target * (1 - keep) + original * keep)));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
