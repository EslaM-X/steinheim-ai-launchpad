import sharp from "sharp";
import type { OverlayOptions } from "sharp";

import { buildRimLight } from "./light";
import { sceneById, type Scene } from "./scenes";

/**
 * Fits a product into a room that already has one.
 *
 * The previous approach composited a product over a background and left it
 * standing in front of the basin rather than plumbed into it — the flaw was not
 * scale or shadow but that nothing in the picture knew where a tap belongs.
 *
 * Here the photograph knows. It was shot with a correctly fitted mixer, so the
 * mounting point, the size, the camera angle and the light are already right;
 * the fitting is removed and ours is put back in the same place. Nothing is
 * guessed, and nothing about the product's own geometry is altered.
 */

export interface InstallRequest {
  sceneId: string;
  /** A plate: cut out, plated to its finish, transparent background. */
  plate: Buffer;
  width: number;
  height: number;
  /** Where the scene image lives. */
  siteBase?: string;
}

export interface Installation {
  png: Buffer;
  scene: Scene;
  width: number;
  height: number;
}

export async function installIntoScene(request: InstallRequest): Promise<Installation> {
  const scene = sceneById(request.sceneId);
  if (!scene) throw new Error(`No scene "${request.sceneId}".`);

  const base = (request.siteBase ?? "https://steinheim-eg.com").replace(/\/+$/, "");
  const res = await fetch(`${base}${scene.path}`, {
    headers: { "user-agent": "SteinheimCreative/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Scene ${scene.path} returned HTTP ${res.status}.`);

  const { width, height } = request;
  const source = sharp(Buffer.from(await res.arrayBuffer()));
  const sourceMeta = await source.metadata();
  const sourceWidth = sourceMeta.width ?? 1;
  const sourceHeight = sourceMeta.height ?? 1;

  // The anchors were read off the source image, so they have to be carried
  // through the same crop the render performs.
  //
  // `cover` at a different aspect ratio does not simply scale — it trims one
  // pair of edges. A fraction that pointed at the tap in a 5:6 frame pointed
  // into empty wall once the same photograph was rendered 9:16, which put the
  // replacement beside the basin and left the original still standing in shot.
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (scaledWidth - width) / 2;
  const offsetY = (scaledHeight - height) / 2;

  /** Source fraction to output pixel. */
  const toX = (fx: number) => fx * scaledWidth - offsetX;
  const toY = (fy: number) => fy * scaledHeight - offsetY;

  const room = await source
    .clone()
    .resize(width, height, { fit: "cover", position: "centre" })
    .toBuffer();

  const box = {
    left: Math.round(toX(scene.anchor.box.left)),
    top: Math.round(toY(scene.anchor.box.top)),
    width: Math.round(scene.anchor.box.width * scaledWidth),
    height: Math.round(scene.anchor.box.height * scaledHeight),
  };

  const cleared = await eraseFitting(room, width, height, scene, box);

  // Scaled to the height the original fitting occupied, in output pixels. That
  // keeps it in proportion to the basin at any output size.
  const boxHeight = Math.max(8, box.height);
  const plateMeta = await sharp(request.plate).metadata();
  const plateScale = boxHeight / Math.max(1, plateMeta.height ?? 1);
  const productHeight = boxHeight;
  const productWidth = Math.max(1, Math.round((plateMeta.width ?? 1) * plateScale));

  const product = await sharp(request.plate)
    .resize(productWidth, productHeight, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  // The anchor is the product's own foot or wall plate, not its bounding box,
  // so a tall mixer and a short one both sit on the same rim.
  const anchorX = Math.round(toX(scene.anchor.anchor.x));
  const anchorY = Math.round(toY(scene.anchor.anchor.y));
  const left = clamp(
    anchorX - Math.round(productWidth * FOOT_X),
    0,
    Math.max(0, width - productWidth),
  );
  const top = clamp(anchorY - productHeight, 0, Math.max(0, height - productHeight));

  const rim = await buildRimLight(product, productWidth, productHeight, {
    fromLeft: scene.anchor.keyFrom === "left",
    strength: 0.3,
    tint: [255, 250, 240],
  });

  const contact =
    scene.anchor.mount === "deck"
      ? await contactShadow(product, productWidth, productHeight)
      : null;

  const layers: OverlayOptions[] = [];
  if (contact) {
    layers.push({
      input: contact,
      left: clamp(left - CONTACT_SPREAD, 0, width - 1),
      top: clamp(top + productHeight - Math.round(productHeight * 0.06), 0, height - 1),
    });
  }
  layers.push({ input: product, left, top });
  if (rim) layers.push({ input: rim, left, top, blend: "screen" });

  return {
    png: await sharp(cleared).composite(layers).png().toBuffer(),
    scene,
    width,
    height,
  };
}

/**
 * Takes the existing fitting out of the photograph.
 *
 * A strip of neighbouring wall is stretched across the box and blended at the
 * edges. It is not inpainting and does not pretend to be: on the flat plaster
 * and vertical panelling these rooms are shot against it is indistinguishable,
 * and the replacement covers most of the area anyway. What it must not do is
 * leave a hard rectangle, which is why the patch is feathered rather than
 * pasted.
 */
async function eraseFitting(
  room: Buffer,
  width: number,
  height: number,
  scene: Scene,
  box: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  // Generous margins: the fitting's own soft shadow extends past its outline,
  // and leaving that behind is as obvious as leaving the tap.
  const pad = Math.round(Math.max(box.width, box.height) * 0.08);
  const left = clamp(box.left - pad, 0, width - 2);
  const top = clamp(box.top - pad, 0, height - 2);
  const boxWidth = clamp(box.width + pad * 2, 2, width - left);
  const boxHeight = clamp(box.height + pad * 2, 2, height - top);

  const direction = scene.anchor.cloneFrom;
  let src: { left: number; top: number; width: number; height: number };

  if (direction === "above") {
    const sourceHeight = Math.min(boxHeight, top);
    if (sourceHeight < 4) return room;
    src = { left, top: top - sourceHeight, width: boxWidth, height: sourceHeight };
  } else if (direction === "left") {
    const sourceWidth = Math.min(boxWidth, left);
    if (sourceWidth < 4) return room;
    src = { left: left - sourceWidth, top, width: sourceWidth, height: boxHeight };
  } else {
    const start = left + boxWidth;
    const sourceWidth = Math.min(boxWidth, Math.max(0, width - start));
    if (sourceWidth < 4) return room;
    src = { left: start, top, width: sourceWidth, height: boxHeight };
  }

  const patch = await sharp(room)
    .extract(src)
    .resize(boxWidth, boxHeight, { fit: "fill" })
    // Light: enough to hide the seam where a stretched clone meets real
    // texture, not so much that the patch reads as a soft rectangle against
    // panelling that has visible grain.
    .blur(1.1)
    .png()
    .toBuffer();

  const feathered = await feather(patch, boxWidth, boxHeight);
  return sharp(room)
    .composite([{ input: feathered, left, top }])
    .png()
    .toBuffer();
}

/** Fades a patch out at its edges so it has no border. */
async function feather(patch: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(patch)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height * 4);
  const band = Math.max(3, Math.round(Math.min(width, height) * 0.28));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * info.width + x) * info.channels;
      const d = (y * width + x) * 4;
      out[d] = data[s]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s + 2]!;
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      out[d + 3] = edge >= band ? 255 : Math.round((edge / band) * 255);
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** A soft pool where a deck-mounted fitting meets the basin. */
async function contactShadow(
  product: Buffer,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const footHeight = Math.max(4, Math.round(height * 0.1));
  const pool = await sharp(product)
    .extract({ left: 0, top: height - footHeight, width, height: footHeight })
    .extractChannel("alpha")
    .resize(width, Math.max(3, Math.round(footHeight * 0.45)), { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const maskWidth = width + CONTACT_SPREAD * 2;
  const maskHeight = pool.info.height + CONTACT_SPREAD * 2;
  const flat = Buffer.alloc(maskWidth * maskHeight);
  for (let y = 0; y < pool.info.height; y++) {
    for (let x = 0; x < pool.info.width; x++) {
      const v = pool.data[(y * pool.info.width + x) * pool.info.channels]!;
      if (v < 110) continue;
      flat[(y + CONTACT_SPREAD) * maskWidth + (x + CONTACT_SPREAD)] = v;
    }
  }

  const blurred = await sharp(flat, {
    raw: { width: maskWidth, height: maskHeight, channels: 1 },
  })
    .blur(CONTACT_SPREAD * 0.55)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(maskWidth * maskHeight * 4);
  let any = false;
  for (let i = 0; i < maskWidth * maskHeight; i++) {
    const a = Math.round(blurred.data[i * blurred.info.channels]! * 0.5);
    if (a > 0) any = true;
    const d = i * 4;
    rgba[d] = 20;
    rgba[d + 1] = 17;
    rgba[d + 2] = 14;
    rgba[d + 3] = a;
  }
  if (!any) return null;

  return sharp(rgba, { raw: { width: maskWidth, height: maskHeight, channels: 4 } })
    .png()
    .toBuffer();
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where the foot sits across the product's own width. */
const FOOT_X = 0.3;

/** How far the contact pool spreads, in pixels. */
const CONTACT_SPREAD = 14;
