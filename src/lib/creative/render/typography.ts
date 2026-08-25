import { existsSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

/**
 * Lays the brand's words over a finished frame.
 *
 * Everything printed here is read from the catalogue row — the product's name,
 * its SKU, the finish that was actually verified. Nothing is composed for
 * effect: a strapline invented to fill the space would be an unverified claim
 * in a typeface, and this system spends its whole existence refusing those.
 *
 * Rendered through SVG. The faces are named twice on purpose: an embedded
 * base64 @font-face, which is what works on a developer machine, and the
 * installed family name, which is what works in the container. The Alpine
 * librsvg build resolves families through fontconfig and ignores embedded font
 * data — the first version of this shipped rows of empty boxes because of it.
 */

export interface Caption {
  /** The product's official name. */
  title: string;
  /** SKU and finish, set small. Null omits the line. */
  subtitle: string | null;
  /** Where the block sits. */
  placement: "top-left" | "bottom-left" | "bottom-centre";
  /**
   * Light text for dark grounds, dark text for light ones.
   *
   * Ignored when the ground is a photograph: the value is measured from the
   * pixels the caption will actually sit on, because a photograph is not one
   * tone and a caller cannot know in advance what its lower third looks like.
   */
  onDark: boolean;
}

let cachedFonts: { display: string; body: string } | null = null;

/**
 * Loads and caches the two faces as base64.
 *
 * Cached because a 1MB variable font read per image, five images per product,
 * is a megabyte of pointless I/O per finish.
 */
async function fonts(): Promise<{ display: string; body: string } | null> {
  if (cachedFonts) return cachedFonts;

  const dir = process.env["BRAND_FONT_DIR"] ?? join(process.cwd(), "assets", "fonts");
  const display = join(dir, "CormorantGaramond.ttf");
  const body = join(dir, "Inter.ttf");
  if (!existsSync(display) || !existsSync(body)) return null;

  const { readFile } = await import("node:fs/promises");
  const [d, b] = await Promise.all([readFile(display), readFile(body)]);
  cachedFonts = { display: d.toString("base64"), body: b.toString("base64") };
  return cachedFonts;
}

export async function applyCaption(
  frame: Buffer,
  width: number,
  height: number,
  caption: Caption,
): Promise<Buffer> {
  const loaded = await fonts();
  if (!loaded) {
    // No faces, no caption. Setting the words in a substitute face would put
    // the wrong brand on the image, which is worse than no words at all.
    return frame;
  }

  // Measured, not assumed. Set over a photograph, light type on a light
  // marble wall is unreadable — which is exactly what the first version
  // produced, because the caller had passed onDark for a dark palette and the
  // background then came from a photo bank instead.
  const band = await measureCaptionBand(frame, width, height, caption.placement);
  const onDark = band === null ? caption.onDark : band < 0.55;

  const ink = onDark ? "#F4F1EA" : "#141414";
  const rule = onDark ? "rgba(244,241,234,0.42)" : "rgba(20,20,20,0.32)";

  const titleSize = Math.round(width * 0.062);
  const subSize = Math.round(width * 0.021);
  const margin = Math.round(width * 0.085);

  const anchor =
    caption.placement === "bottom-centre"
      ? { x: width / 2, align: "middle" as const }
      : { x: margin, align: "start" as const };
  const baseY =
    caption.placement === "top-left"
      ? margin + titleSize
      : height - margin - (caption.subtitle ? subSize * 2.6 : 0);

  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // A scrim under the type. Every piece of advertising that sets words over
  // photography has one, because no photograph is evenly toned enough to carry
  // text on its own — and a caption that competes with a busy wall is the
  // fastest way to look amateur.
  const scrimTop = caption.placement === "top-left" ? 0 : Math.round(height * 0.62);
  const scrimHeight = Math.round(height * 0.38);
  const scrim = onDark ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.68)";
  const scrimFade = onDark ? "rgba(0,0,0,0)" : "rgba(255,255,255,0)";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="${caption.placement === "top-left" ? 1 : 0}" x2="0" y2="${caption.placement === "top-left" ? 0 : 1}">
      <stop offset="0%" stop-color="${scrimFade}"/>
      <stop offset="100%" stop-color="${scrim}"/>
    </linearGradient>
    <style>
      @font-face { font-family: "SteinheimDisplay"; src: url(data:font/ttf;base64,${loaded.display}) format("truetype"); }
      @font-face { font-family: "SteinheimBody"; src: url(data:font/ttf;base64,${loaded.body}) format("truetype"); }
      .t { font-family: "SteinheimDisplay", "Cormorant Garamond", serif; font-size: ${titleSize}px; fill: ${ink}; letter-spacing: ${(titleSize * 0.01).toFixed(2)}px; }
      .s { font-family: "SteinheimBody", "Inter", sans-serif; font-size: ${subSize}px; fill: ${ink}; letter-spacing: ${(subSize * 0.16).toFixed(2)}px; opacity: 0.78; }
    </style>
  </defs>
  <rect x="0" y="${scrimTop}" width="${width}" height="${scrimHeight}" fill="url(#scrim)"/>
  <!-- The rule clears the display face's descenders: at 1.0x the subtitle size
       it cut straight through the tail of a lowercase y. -->
  <text x="${anchor.x}" y="${baseY}" class="t" text-anchor="${anchor.align}">${escape(caption.title)}</text>
  ${
    caption.subtitle
      ? `<line x1="${anchor.align === "middle" ? width / 2 - 26 : margin}" y1="${baseY + subSize * 1.5}" x2="${anchor.align === "middle" ? width / 2 + 26 : margin + 52}" y2="${baseY + subSize * 1.5}" stroke="${rule}" stroke-width="1"/>
  <text x="${anchor.x}" y="${baseY + subSize * 2.5}" class="s" text-anchor="${anchor.align}">${escape(caption.subtitle.toUpperCase())}</text>`
      : ""
  }
</svg>`;

  return sharp(frame)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Measures how bright the strip the caption will occupy actually is.
 *
 * Only that strip: a frame can be dark overall and still have a bright floor
 * exactly where the words go.
 */
async function measureCaptionBand(
  frame: Buffer,
  width: number,
  height: number,
  placement: Caption["placement"],
): Promise<number | null> {
  try {
    const top = placement === "top-left" ? 0 : Math.round(height * 0.7);
    const bandHeight = Math.max(1, Math.round(height * 0.28));
    const { data, info } = await sharp(frame)
      .extract({ left: 0, top, width, height: Math.min(bandHeight, height - top) })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    let n = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const s = i * info.channels;
      sum += 0.2126 * data[s]! + 0.7152 * data[s + 1]! + 0.0722 * data[s + 2]!;
      n += 1;
    }
    return n === 0 ? null : sum / n / 255;
  } catch {
    return null;
  }
}
