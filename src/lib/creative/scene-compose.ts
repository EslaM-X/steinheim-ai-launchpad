import sharp, { type OverlayOptions } from "sharp";

import type { DetectedProduct, SurfaceInfo } from "./scene-analysis.server";
import { cutOutProduct } from "./render/cutout";
import { verifyFinish, type FinishVerdict } from "./render/finish";
import { applyGrain, applyVignette, buildReflection, buildRimLight } from "./render/light";

/**
 * Scene composition — places Steinheim products into a cleaned reference
 * scene. Unlike the studio compositor (compose.ts) which uses a fixed layout,
 * this system is scene-aware: it positions products according to where the
 * original products were detected, and adjusts lighting/shadows to match
 * the scene's conditions.
 */

export interface SceneProduct {
  /** The detected product this replaces. */
  detected: DetectedProduct;
  /** Official product image URL (from the Steinheim catalog). */
  imageUrl: string;
  /** The finish to apply. */
  finish: string;
  /** Product name for reference. */
  name: string;
}

export interface SceneCompositeRequest {
  /** Cleaned scene image (products removed). */
  sceneImageUrl: string;
  /** Products to insert. */
  products: SceneProduct[];
  /** Surface information from scene analysis. */
  surfaces: SurfaceInfo[];
  /** Lighting direction from scene analysis. */
  lightingDirection: "left" | "right" | "top" | "bottom" | "ambient" | "mixed";
  /** Output dimensions. */
  width: number;
  height: number;
  /** Random seed for deterministic grain. */
  seed?: number;
}

export interface SceneCompositeResult {
  png: Buffer;
  warnings: string[];
}

/**
 * Composites multiple Steinheim products into a cleaned scene.
 * Products are inserted back-to-front (by vertical position) so that
 * items further from the camera are layered behind closer ones.
 */
export async function compositeScene(
  request: SceneCompositeRequest,
): Promise<SceneCompositeResult> {
  const { sceneImageUrl, products, surfaces, lightingDirection, width, height, seed = 1 } = request;

  const warnings: string[] = [];

  // Fetch the scene image
  const sceneRes = await fetch(sceneImageUrl);
  if (!sceneRes.ok) throw new Error(`Failed to fetch scene image: ${sceneRes.status}`);
  const sceneBuffer = Buffer.from(await sceneRes.arrayBuffer());

  // Resize scene to output dimensions
  const scenePrepared = await sharp(sceneBuffer)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  // Determine the primary surface for reflection calculations
  const primarySurface = surfaces[0] ?? {
    type: "marble" as const,
    color: "#ffffff",
    reflectivity: "medium" as const,
  };

  // Sort products by vertical position (top = back, bottom = front)
  const sorted = [...products].sort((a, b) => a.detected.position.y - b.detected.position.y);

  // Build composite layers
  const layers: OverlayOptions[] = [];

  for (const product of sorted) {
    try {
      const result = await insertProduct(
        product,
        width,
        height,
        primarySurface,
        lightingDirection,
        seed,
      );
      if (result.shadow) {
        layers.push({
          input: result.shadow,
          left: result.shadowOffsetX,
          top: result.shadowOffsetY,
        });
      }
      if (result.reflection) {
        layers.push({
          input: result.reflection.png,
          left: result.reflectionOffsetX,
          top: result.reflectionOffsetY,
        });
      }
      layers.push({
        input: result.product,
        left: result.offsetX,
        top: result.offsetY,
      });
      if (result.rim) {
        layers.push({
          input: result.rim,
          left: result.offsetX,
          top: result.offsetY,
          blend: "screen",
        });
      }
    } catch (error) {
      warnings.push(
        `Failed to insert ${product.name} (${product.detected.category}): ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  // Assemble all layers onto the scene
  const assembled = (await sharp(scenePrepared).composite(layers).png().toBuffer()) as Buffer;
  let frame: Buffer = assembled;

  // Apply scene-wide finishing: vignette then grain
  const vignetteStrength = primarySurface.reflectivity === "high" ? 0.35 : 0.42;
  frame = await applyVignette(frame, width, height, vignetteStrength);
  frame = await applyGrain(frame, width, height, 0.022, seed);

  return { png: frame, warnings };
}

interface InsertResult {
  product: Buffer;
  offsetX: number;
  offsetY: number;
  shadow: Buffer | null;
  shadowOffsetX: number;
  shadowOffsetY: number;
  reflection: { png: Buffer; height: number } | null;
  reflectionOffsetX: number;
  reflectionOffsetY: number;
  rim: Buffer | null;
}

async function insertProduct(
  sceneProduct: SceneProduct,
  frameWidth: number,
  frameHeight: number,
  surface: SurfaceInfo,
  lightingDirection: string,
  seed: number,
): Promise<InsertResult> {
  const { detected, imageUrl, finish, name } = sceneProduct;

  // Fetch the official product image
  const productRes = await fetch(imageUrl);
  if (!productRes.ok)
    throw new Error(`Failed to fetch product image for ${name}: ${productRes.status}`);
  const productBuffer = Buffer.from(await productRes.arrayBuffer());

  // Cut out the product from its background
  const cutout = await cutOutProduct(productBuffer);

  // Scale the product to match the detected position in the scene
  const targetWidth = Math.round(detected.position.width * frameWidth);
  const targetHeight = Math.round(detected.position.height * frameHeight);
  const offsetX = Math.round(detected.position.x * frameWidth);
  const offsetY = Math.round(detected.position.y * frameHeight);

  // Resize the product to fit
  const resized = await sharp(cutout.png)
    .resize(targetWidth, targetHeight, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Build shadow — surface-dependent
  const shadowBlur = surface.reflectivity === "high" ? 4 : surface.reflectivity === "low" ? 8 : 6;
  const shadowOpacity = surface.reflectivity === "high" ? 0.25 : 0.35;
  const shadow = await buildSceneShadow(
    resized,
    targetWidth,
    targetHeight,
    shadowBlur,
    shadowOpacity,
  );

  const shadowOffsetX = Math.max(0, offsetX - 4);
  const shadowOffsetY = Math.max(0, offsetY + targetHeight - 2);

  // Build reflection — only on reflective surfaces
  let reflection: { png: Buffer; height: number } | null = null;
  const reflectionOffsetX = offsetX;
  const reflectionOffsetY = offsetY + targetHeight;

  if (surface.reflectivity !== "low") {
    const reflectExtent = surface.reflectivity === "high" ? 0.5 : 0.35;
    const reflectStrength = surface.reflectivity === "high" ? 0.4 : 0.2;
    const reflectBlur = surface.type === "glass" ? 1.5 : surface.type === "marble" ? 3 : 4;
    reflection = await buildReflection(resized, targetWidth, targetHeight, {
      extent: reflectExtent,
      strength: reflectStrength,
      blur: reflectBlur,
    });
  }

  // Build rim light — direction-aware
  const fromLeft =
    lightingDirection === "left" ||
    lightingDirection === "mixed" ||
    lightingDirection === "ambient";
  const rimStrength = lightingDirection === "ambient" ? 0.2 : 0.35;
  const rim = await buildRimLight(resized, targetWidth, targetHeight, {
    fromLeft,
    strength: rimStrength,
    tint: [255, 250, 242],
  });

  return {
    product: resized,
    offsetX,
    offsetY,
    shadow,
    shadowOffsetX,
    shadowOffsetY,
    reflection,
    reflectionOffsetX,
    reflectionOffsetY,
    rim,
  };
}

async function buildSceneShadow(
  productPng: Buffer,
  width: number,
  height: number,
  blur: number,
  opacity: number,
): Promise<Buffer> {
  // Extract the bottom strip of the product's alpha channel to create
  // a contact shadow that follows the product's actual footprint.
  const raw = await sharp(productPng)
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = raw.info.channels;
  const footHeight = Math.max(4, Math.round(height * 0.12));

  // Pool the bottom strip into a flat shadow shape
  const shadowData = Buffer.alloc(width * footHeight * 4);
  for (let y = 0; y < footHeight; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - footHeight + y) * width + x) * ch;
      const alpha = raw.data[srcIdx] ?? 0;
      if (alpha < 30) continue;
      const d = (y * width + x) * 4;
      shadowData[d] = 0;
      shadowData[d + 1] = 0;
      shadowData[d + 2] = 0;
      shadowData[d + 3] = Math.round(Math.min(255, alpha * opacity));
    }
  }

  return sharp(shadowData, { raw: { width, height: footHeight, channels: 4 } })
    .blur(blur)
    .png()
    .toBuffer();
}
