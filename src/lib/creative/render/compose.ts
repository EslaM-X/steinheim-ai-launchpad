import sharp from "sharp";
import type { OverlayOptions } from "sharp";

import { buildBackdrop } from "./backdrop";
import { applyGrain, applyVignette, buildReflection, buildRimLight } from "./light";
import { replate } from "./plating";
import { applyCaption, type Caption } from "./typography";
import { cutOutProduct, type Cutout } from "./cutout";
import { verifyFinish, type FinishVerdict } from "./finish";
import { generateScene, type Scene } from "./scene";

/**
 * Puts the real product into a generated room.
 *
 * Three things make a composite read as a photograph rather than a sticker: the
 * part sits at a plausible size, it casts a contact shadow, and it shares the
 * room's colour temperature. All three are applied here, and all three stop
 * short of touching the product's geometry — the silhouette that comes out is
 * the silhouette that was photographed.
 */

export interface CompositionRequest {
  /** URL of the official product photograph. */
  imageUrl: string;
  /** The finish the catalogue claims for that photograph. */
  finish: string;
  /**
   * "studio:<palette>" builds the background in code; anything else is passed
   * to the image model as a scene mood.
   *
   * Studio is the default for campaigns because it is the only one that cannot
   * put a second tap in the frame — see backdrop.ts.
   */
  mood: string;
  width: number;
  height: number;
  seed: number;
  /** Set for wall-mounted parts: no floor plane, no contact shadow. */
  wallMounted?: boolean;
  /** Words to set over the frame. Omitted leaves it clean. */
  caption?: Caption;
  /**
   * A stored plate for this product and finish.
   *
   * When present it is used as-is: it has already had its backdrop removed and
   * its colour taken from the finish specification, so re-running either step
   * would only cost time and re-quantise the pixels.
   */
  plateUrl?: string | null;
}

export interface Composition {
  png: Buffer;
  width: number;
  height: number;
  finish: FinishVerdict;
  scene: { prompt: string; seed: number; source: string };
  /** True when the finish had a plating curve and the product was replated. */
  finishCorrected: boolean;
  platingNote: string;
}

export async function composeProductScene(request: CompositionRequest): Promise<Composition> {
  const studio = request.mood.startsWith("studio:");
  const [productImage, background] = await Promise.all([
    fetchProduct(request.plateUrl ?? request.imageUrl),
    studio
      ? buildBackdrop({
          palette: request.mood.slice("studio:".length),
          width: request.width,
          height: request.height,
          wallOnly: request.wallMounted === true,
        }).then((b) => ({
          png: b.png,
          prompt: `studio backdrop, ${b.palette}`,
          seed: 0,
          source: "built-in",
        }))
      : generateScene({
          mood: request.mood,
          width: request.width,
          height: request.height,
          seed: request.seed,
        }),
  ]);

  let cutout: Cutout;
  let product: Buffer;
  let platingNote: string;

  if (request.plateUrl) {
    // A plate arrives cut out and plated. Only its dimensions are needed.
    const meta = await sharp(productImage).metadata();
    cutout = {
      png: productImage,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      measurement: null,
      coverage: 1,
    };
    product = productImage;
    platingNote = "stored plate used as supplied";
  } else {
    cutout = await cutOutProduct(productImage);
    // Replating runs every time, not only when the photograph is measurably
    // wrong. The catalogue's images were generated rather than photographed and
    // disagree with each other by a factor of five inside a single finish name;
    // correcting only the outliers would still ship two different golds in one
    // set.
    const plating = await replate(cutout.png, request.finish);
    product = plating.png;
    platingNote = plating.note;
  }

  const verdict = verifyFinish(request.finish, cutout.measurement);

  return {
    png: await assemble(background, product, cutout, request),
    width: request.width,
    height: request.height,
    finish: verdict,
    scene: { prompt: background.prompt, seed: background.seed, source: background.source },
    finishCorrected: true,
    platingNote,
  };
}

async function fetchProduct(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "user-agent": "SteinheimCreative/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Product image ${url} returned HTTP ${res.status}.`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Moves a mislabelled finish onto its declared colour.
 *
 * Hue rotation and saturation/brightness scaling only. Luminance structure —
 * every highlight, every shadow that describes the shape of the part — is left
 * alone, so a corrected image is the same object under a different plating, not
 * a different object.
 */
async function recolour(cutout: Cutout, verdict: FinishVerdict): Promise<Buffer> {
  const c = verdict.correction!;
  return sharp(cutout.png)
    .modulate({
      hue: Math.round(c.hueShift),
      saturation: c.saturationScale,
      brightness: c.lightnessScale,
    })
    .png()
    .toBuffer();
}

async function assemble(
  scene: Scene,
  productPng: Buffer,
  cutout: Cutout,
  request: CompositionRequest,
): Promise<Buffer> {
  const { width, height } = request;

  // The part occupies a little over half the frame height. Smaller reads as a
  // catalogue thumbnail dropped into a room; larger stops looking like a
  // photograph anyone could have taken.
  //
  // Width has to bind as well as height. A wall-mounted mixer is far wider than
  // it is tall, and 56% of a 1920-high story frame made it 1200px across in a
  // 1080px frame — sharp refused the composite outright, so every finish of
  // every wide product failed. Taking the smaller of the two scales keeps the
  // part inside the frame whatever its proportions.
  const heightScale = (height * 0.56) / cutout.height;
  const widthScale = (width * MAX_PRODUCT_WIDTH) / cutout.width;
  const scale = Math.min(heightScale, widthScale);
  const targetHeight = Math.max(1, Math.round(cutout.height * scale));
  const targetWidth = Math.max(1, Math.round(cutout.width * scale));

  const product = await sharp(productPng)
    .resize(targetWidth, targetHeight, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  // Sitting on the lower third, slightly right of centre: the eye reads a
  // product photograph that way, and it leaves the upper left clear for a
  // caption or logo.
  const left = Math.max(
    0,
    Math.min(width - targetWidth, Math.round(width * 0.52 - targetWidth / 2)),
  );
  const top = Math.round(height * (request.wallMounted ? 0.62 : 0.72) - targetHeight);

  // A contact shadow is what stops a composite floating — for a part that
  // stands on something. A wall-mounted mixer touches no surface in frame, so
  // giving it a pool underneath would invent a counter that is not there.
  const shadow = request.wallMounted ? null : await buildShadow(product, targetWidth, targetHeight);

  const scenePrepared = await sharp(scene.png)
    .resize(width, height, { fit: "cover", position: "centre" })
    .toBuffer();

  // The key sits left of centre in every palette, so the rim goes on the left
  // edge of the part and the reflection falls away from the viewer.
  const rim = await buildRimLight(product, targetWidth, targetHeight, {
    fromLeft: true,
    strength: RIM_STRENGTH,
    tint: [255, 250, 242],
  });

  // A wall-mounted part is not standing on a polished surface, so it has
  // nothing to reflect in.
  const reflection = request.wallMounted
    ? null
    : await buildReflection(product, targetWidth, targetHeight, {
        extent: REFLECTION_EXTENT,
        strength: REFLECTION_STRENGTH,
        blur: 3.5,
      });

  const layers: OverlayOptions[] = [];

  if (reflection) {
    layers.push({
      input: reflection.png,
      left,
      top: Math.min(height - 1, top + targetHeight),
    });
  }
  if (shadow) {
    layers.push({
      // Sits at the foot of the part, not behind all of it.
      input: shadow,
      left: Math.max(0, left - SHADOW_SPREAD),
      top: Math.max(0, top + targetHeight - Math.round(targetHeight * 0.12) - SHADOW_SPREAD),
    });
  }
  layers.push({ input: product, left, top });
  if (rim) layers.push({ input: rim, left, top, blend: "screen" });

  const assembled = await sharp(scenePrepared).composite(layers).png().toBuffer();

  // Vignette then grain, both over the finished frame. A vignette applied under
  // the product darkens only the ground and leaves the part sitting on top of
  // it looking cut out.
  const vignetted = await applyVignette(assembled, width, height, VIGNETTE_STRENGTH);
  const grained = await applyGrain(vignetted, width, height, GRAIN_AMOUNT, request.seed || 1);

  // Type goes on last, over the grain. Grain applied over type softens the
  // letterforms, and soft type is the first thing that reads as amateur.
  return request.caption ? applyCaption(grained, width, height, request.caption) : grained;
}

/**
 * Builds the shadow the part casts where it meets the counter.
 *
 * Two earlier attempts went through a greyscale mask and a multiply blend, and
 * both left a visible rectangle: any value below white inside the mask darkens
 * the scene, so the mask's own bounds show up as an edge. Building explicit
 * RGBA instead — near-black pixels, alpha carrying the shape — removes the
 * possibility entirely, because everything outside the shape is transparent
 * rather than merely light.
 *
 * Only the bottom of the part casts it. A tap standing on a counter throws a
 * pool at its base, not a halo around its spout, and the halo is what made the
 * first two attempts read as a cut-out pasted on.
 */
async function buildShadow(product: Buffer, width: number, height: number): Promise<Buffer> {
  const footHeight = Math.max(8, Math.round(height * 0.14));

  // The base of the part, flattened into a pool lying on the surface.
  const poolHeight = Math.max(4, Math.round(footHeight * 0.5));
  const pool = await sharp(product)
    .extract({ left: 0, top: height - footHeight, width, height: footHeight })
    .extractChannel("alpha")
    .resize(width, poolHeight, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Padding is written by hand rather than with `extend`.
  //
  // On a single-channel image sharp fills the new border with white whatever
  // background is asked for — measured: a mask that should have been mostly 0
  // came back with a mean of 200. Every earlier version of this shadow was a
  // bright rectangle for that reason and no other. Zero-filling a buffer cannot
  // be misread.
  const padded = Math.max(1, Math.round(footHeight * 0.25)) + SHADOW_SPREAD;
  const maskWidth = width + SHADOW_SPREAD * 2;
  const maskHeight = poolHeight + padded * 2;
  const flat = Buffer.alloc(maskWidth * maskHeight); // zeroed: no shadow anywhere
  // Indexed by what sharp actually returned, not by what was requested. A
  // resize can land a pixel either side of the asked-for width, and walking the
  // buffer on the requested stride shears every row against the previous one —
  // which drew a fine scanline streak clean across the counter.
  const poolW = pool.info.width;
  const poolH = pool.info.height;
  const ch = pool.info.channels;
  for (let y = 0; y < poolH; y++) {
    for (let x = 0; x < poolW; x++) {
      const v = pool.data[(y * poolW + x) * ch]!;
      // Only what actually touches the counter casts anything: the cutout's
      // feathered rim carries a little alpha well past the part itself.
      if (v < POOL_FLOOR) continue;
      const ty = y + padded;
      const tx = x + SHADOW_SPREAD;
      if (ty < maskHeight && tx < maskWidth) flat[ty * maskWidth + tx] = v;
    }
  }

  // Resolved with its object because sharp does not promise to hand back the
  // channel count it was given — a one-channel buffer can come out of blur as
  // three. Reading it on the assumed stride walks a third of the image and
  // repeats, which is what drew the striped band under the part.
  const blurred = await sharp(flat, {
    raw: { width: maskWidth, height: maskHeight, channels: 1 },
  })
    .blur(SHADOW_SPREAD * 0.6)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurCh = blurred.info.channels;

  // Near-black pixels; the mask becomes the alpha channel, so everything the
  // part does not stand on stays fully transparent.
  const rgba = Buffer.alloc(maskWidth * maskHeight * 4);
  for (let i = 0; i < maskWidth * maskHeight; i++) {
    const d = i * 4;
    rgba[d] = 18;
    rgba[d + 1] = 16;
    rgba[d + 2] = 14;
    rgba[d + 3] = Math.round(blurred.data[i * blurCh]! * SHADOW_OPACITY);
  }

  return sharp(rgba, { raw: { width: maskWidth, height: maskHeight, channels: 4 } })
    .png()
    .toBuffer();
}

/** How far down the reflection reaches, as a fraction of the part's height. */
const REFLECTION_EXTENT = 0.42;

/** Opacity where the reflection meets the part. Above this it reads as a twin. */
const REFLECTION_STRENGTH = 0.3;

/** Brightness of the edge facing the key. */
const RIM_STRENGTH = 0.38;

/** How dark the corners go. */
const VIGNETTE_STRENGTH = 0.42;

/** Grain, as a fraction of full-strength noise. Enough to stop banding. */
const GRAIN_AMOUNT = 0.022;

/** The widest the part may sit in the frame, as a fraction of frame width. */
const MAX_PRODUCT_WIDTH = 0.82;

/** How far the contact shadow spreads past the part, in pixels. */
const SHADOW_SPREAD = 22;

/** Alpha below this in the foot strip is the cutout's feathered rim, not contact. */
const POOL_FLOOR = 110;

/** How dark the pool gets directly under the part. Below 1 keeps it a shadow. */
const SHADOW_OPACITY = 0.62;
