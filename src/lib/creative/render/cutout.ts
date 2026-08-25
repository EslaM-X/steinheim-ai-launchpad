import sharp from "sharp";

import { BACKDROP_TOLERANCE, measureFinish, type FinishMeasurement } from "./finish";

/**
 * Lifts the product off its studio backdrop.
 *
 * No model is involved, and none is wanted. These are catalogue shots: one
 * object, one flat backdrop, hard edges. A flood fill from the border is exact
 * on that input, runs in milliseconds, and — unlike a segmentation model —
 * cannot decide to round off a spout or erase a lever it did not recognise.
 * Preserving the part's silhouette exactly is the whole requirement.
 *
 * The flood starts at the border rather than thresholding globally, so a light
 * highlight inside the part stays part of the product: it is not connected to
 * the outside.
 */

export interface Cutout {
  /** PNG with alpha, cropped to the product's bounding box. */
  png: Buffer;
  width: number;
  height: number;
  measurement: FinishMeasurement | null;
  /** Fraction of the frame the product occupied. */
  coverage: number;
}

export async function cutOutProduct(input: Buffer): Promise<Cutout> {
  const source = sharp(input).ensureAlpha();
  const meta = await source.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("The product image has no dimensions.");

  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const measurement = measureFinish(data, width, height, channels);
  const backdrop = measurement?.backdrop ?? [255, 255, 255];

  // Breadth-first from every border pixel. `outside` ends up marking exactly
  // the backdrop region that touches the frame edge.
  const outside = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const near = (idx: number) => {
    const i = idx * channels;
    return (
      Math.hypot(data[i]! - backdrop[0], data[i + 1]! - backdrop[1], data[i + 2]! - backdrop[2]) <
      BACKDROP_TOLERANCE
    );
  };
  const push = (idx: number) => {
    if (outside[idx] || !near(idx)) return;
    outside[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }

  // Alpha is graded rather than binary across the backdrop boundary, so the
  // anti-aliased rim of the original photograph survives instead of turning
  // into a stair-stepped edge on the new background.
  const out = Buffer.alloc(width * height * 4);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;

  for (let idx = 0; idx < width * height; idx++) {
    const s = idx * channels;
    const d = idx * 4;
    out[d] = data[s]!;
    out[d + 1] = data[s + 1]!;
    out[d + 2] = data[s + 2]!;

    let alpha: number;
    if (outside[idx]) {
      alpha = 0;
    } else {
      const distance = Math.hypot(
        data[s]! - backdrop[0],
        data[s + 1]! - backdrop[1],
        data[s + 2]! - backdrop[2],
      );
      alpha =
        distance >= BACKDROP_TOLERANCE + FEATHER
          ? 255
          : Math.round(255 * Math.max(0, (distance - BACKDROP_TOLERANCE) / FEATHER));
      // A hole enclosed by the product keeps whatever the photograph had.
      if (distance < BACKDROP_TOLERANCE) alpha = 0;
    }
    out[d + 3] = alpha;

    if (alpha > 24) {
      kept += 1;
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error("Nothing survived the cutout — the backdrop filled the frame.");

  const pad = 2;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropWidth = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const cropHeight = Math.min(height - top, maxY - minY + 1 + pad * 2);

  const png = await sharp(out, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  return {
    png,
    width: cropWidth,
    height: cropHeight,
    measurement,
    coverage: kept / (width * height),
  };
}

/** Width of the soft band where backdrop fades into product, in colour distance. */
const FEATHER = 26;
