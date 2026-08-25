/**
 * Checks a product photograph against the finish the catalogue claims for it,
 * and corrects it only when the two genuinely disagree.
 *
 * The restraint is the point. Measured against the live catalogue, 106 of 111
 * official photographs already match their label; the five that fell outside
 * were all within a rounding error of the boundary. A pipeline that "corrects"
 * every image would have introduced colour error into 106 correct photographs
 * to fix five that were not wrong. So the bands below are deliberately generous
 * and correction fires only on a real mismatch — a gold labelled part that
 * photographs black, not a chrome that reads 0.42 where 0.45 was expected.
 *
 * Correction is a tonal remap, never a regeneration: hue and saturation move,
 * luminance structure does not. The geometry, the highlights and the mounting
 * stay exactly as photographed, because those are the product.
 */

export interface FinishMeasurement {
  hue: number;
  saturation: number;
  lightness: number;
  /** Product pixels sampled, i.e. everything that was not backdrop. */
  pixels: number;
  backdrop: [number, number, number];
}

export interface FinishVerdict {
  finish: string;
  known: boolean;
  matches: boolean;
  /** Only set when the measurement is materially outside the band. */
  correction: FinishCorrection | null;
  reason: string;
}

export interface FinishCorrection {
  /** Degrees to rotate hue by. */
  hueShift: number;
  /** Multiplier on saturation. */
  saturationScale: number;
  /** Multiplier on lightness. */
  lightnessScale: number;
}

interface Band {
  hue: [number, number] | null;
  saturation: [number, number];
  lightness: [number, number];
  /** Where a mismatched image should be moved to. */
  target: { hue: number | null; saturation: number; lightness: number };
}

/**
 * What each catalogue finish looks like when measured.
 *
 * Bands are wide on purpose — see the note at the top of this file. They exist
 * to catch a photograph of the wrong part, not to enforce a house grade.
 */
const BANDS: Record<string, Band> = {
  chrome: {
    hue: null,
    saturation: [0, 0.2],
    lightness: [0.36, 0.9],
    target: { hue: null, saturation: 0.05, lightness: 0.62 },
  },
  "brushed nickel": {
    hue: [20, 80],
    saturation: [0, 0.28],
    lightness: [0.34, 0.78],
    target: { hue: 45, saturation: 0.12, lightness: 0.56 },
  },
  "matte black": {
    hue: null,
    saturation: [0, 0.3],
    lightness: [0, 0.36],
    target: { hue: null, saturation: 0.04, lightness: 0.18 },
  },
  "brushed gold": {
    hue: [28, 62],
    saturation: [0.15, 0.85],
    lightness: [0.3, 0.8],
    target: { hue: 45, saturation: 0.45, lightness: 0.58 },
  },
  "coffee gold": {
    hue: [12, 48],
    saturation: [0.12, 0.75],
    lightness: [0.16, 0.6],
    target: { hue: 30, saturation: 0.34, lightness: 0.38 },
  },
  "metal gun": {
    hue: [170, 270],
    saturation: [0, 0.3],
    lightness: [0.14, 0.5],
    target: { hue: 215, saturation: 0.08, lightness: 0.3 },
  },
};

export function knownFinishes(): string[] {
  return Object.keys(BANDS);
}

export function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * Measures the product, not the photograph.
 *
 * These shots are one object on a flat backdrop, so the backdrop is whatever
 * dominates the border. Pixels close to it are excluded, because averaging the
 * whole frame would mostly measure the backdrop and report every finish as
 * cream.
 */
export function measureFinish(
  raw: Buffer,
  width: number,
  height: number,
  channels: number,
): FinishMeasurement | null {
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * channels;
    return [raw[i]!, raw[i + 1]!, raw[i + 2]!];
  };

  const ring: Array<[number, number, number]> = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 140));
  for (let x = 0; x < width; x += step) {
    ring.push(at(x, 1));
    ring.push(at(x, height - 2));
  }
  for (let y = 0; y < height; y += step) {
    ring.push(at(1, y));
    ring.push(at(width - 2, y));
  }
  const median = (k: number) => {
    const values = ring.map((p) => p[k]!).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  const backdrop: [number, number, number] = [median(0), median(1), median(2)];

  let n = 0;
  let sumS = 0;
  let sumL = 0;
  let cos = 0;
  let sin = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const [r, g, b] = at(x, y);
      if (Math.hypot(r - backdrop[0], g - backdrop[1], b - backdrop[2]) < BACKDROP_TOLERANCE) {
        continue;
      }
      const { h, s, l } = rgbToHsl(r, g, b);
      n += 1;
      sumS += s;
      sumL += l;
      // Hue is circular: a naive mean of 350 and 10 gives 180, the opposite
      // colour. Averaging the unit vectors gives 0.
      cos += Math.cos((h * Math.PI) / 180);
      sin += Math.sin((h * Math.PI) / 180);
    }
  }
  if (n < 200) return null;

  let hue = (Math.atan2(sin / n, cos / n) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { hue, saturation: sumS / n, lightness: sumL / n, pixels: n, backdrop };
}

/** Pixels this close to the border colour are backdrop, not product. */
export const BACKDROP_TOLERANCE = 42;

export function verifyFinish(finish: string, m: FinishMeasurement | null): FinishVerdict {
  const key = finish.trim().toLowerCase();
  const band = BANDS[key];
  if (!band) {
    return {
      finish: key,
      known: false,
      matches: true,
      correction: null,
      reason: "no measurement band for this finish; the photograph is used unchanged",
    };
  }
  if (!m) {
    return {
      finish: key,
      known: true,
      matches: true,
      correction: null,
      reason: "too few product pixels to measure; the photograph is used unchanged",
    };
  }

  const failures: string[] = [];
  if (m.saturation < band.saturation[0] || m.saturation > band.saturation[1]) {
    failures.push(`saturation ${m.saturation.toFixed(2)} outside ${band.saturation.join("–")}`);
  }
  if (m.lightness < band.lightness[0] || m.lightness > band.lightness[1]) {
    failures.push(`lightness ${m.lightness.toFixed(2)} outside ${band.lightness.join("–")}`);
  }
  // Hue only means something once there is colour to speak of. On a near-grey
  // chrome the measured hue is sensor noise.
  if (band.hue && m.saturation > 0.12) {
    const [lo, hi] = band.hue;
    if (m.hue < lo || m.hue > hi) failures.push(`hue ${m.hue.toFixed(0)}° outside ${lo}–${hi}°`);
  }

  if (failures.length === 0) {
    return {
      finish: key,
      known: true,
      matches: true,
      correction: null,
      reason: "photograph agrees with the catalogue finish",
    };
  }

  let hueShift = 0;
  if (band.target.hue !== null && m.saturation > 0.12) {
    hueShift = ((band.target.hue - m.hue + 540) % 360) - 180;
  }
  return {
    finish: key,
    known: true,
    matches: false,
    correction: {
      hueShift,
      saturationScale: clamp(band.target.saturation / Math.max(m.saturation, 0.02), 0.2, 5),
      lightnessScale: clamp(band.target.lightness / Math.max(m.lightness, 0.02), 0.35, 3),
    },
    reason: failures.join("; "),
  };
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}
