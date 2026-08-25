import sharp from "sharp";

/**
 * Builds a studio backdrop in code, with nothing generated.
 *
 * This exists because the generated-scene route kept failing in the one way
 * that matters here. Asked for a bare surface with "no tap, no faucet, no
 * mixer" repeated in the prompt, the image model returned a fully furnished
 * bathroom with its own chrome mixer in shot — twice, at different seeds. Two
 * taps in one frame is not a rendering blemish; for a brand whose whole system
 * refuses to state an unverified fact, it publishes a fixture that does not
 * exist.
 *
 * A gradient sweep, a floor plane and a soft key light cannot do that. It is
 * also what luxury sanitaryware advertising actually looks like — the product
 * against a graded seamless, not a stock bathroom — so the safe choice and the
 * good-looking one turn out to be the same choice.
 */

export interface Backdrop {
  png: Buffer;
  palette: string;
}

export interface BackdropRequest {
  palette: string;
  width: number;
  height: number;
  /**
   * Wall-mounted parts get a wall, with no floor plane behind them.
   *
   * A horizon line running behind a mixer that is bolted to a wall reads as a
   * mistake, because it is one: the part is not standing on anything.
   */
  wallOnly?: boolean;
}

interface Palette {
  /** Wall colour at the top of the sweep and at the horizon. */
  wallTop: [number, number, number];
  wallBottom: [number, number, number];
  /** Floor plane, nearest the camera. */
  floor: [number, number, number];
  /** Where the key light lands, as a fraction of width. */
  keyX: number;
  keyStrength: number;
}

/**
 * Brand-side palettes rather than photographic ones.
 *
 * Named for the Steinheim colours so a marketer picks a mood, not an RGB
 * triple, and so a campaign can ask for "obsidian" and get the same backdrop
 * every time.
 */
export const PALETTES: Record<string, Palette> = {
  porcelain: {
    wallTop: [238, 235, 229],
    wallBottom: [223, 219, 211],
    floor: [206, 201, 192],
    keyX: 0.34,
    keyStrength: 0.5,
  },
  obsidian: {
    wallTop: [30, 30, 32],
    wallBottom: [19, 19, 21],
    floor: [26, 26, 28],
    keyX: 0.36,
    keyStrength: 0.72,
  },
  forest: {
    wallTop: [38, 56, 48],
    wallBottom: [26, 40, 34],
    floor: [31, 46, 39],
    keyX: 0.33,
    keyStrength: 0.6,
  },
  champagne: {
    wallTop: [226, 208, 178],
    wallBottom: [206, 185, 152],
    floor: [190, 169, 138],
    keyX: 0.35,
    keyStrength: 0.55,
  },
  slate: {
    wallTop: [126, 130, 134],
    wallBottom: [98, 102, 107],
    floor: [86, 90, 95],
    keyX: 0.34,
    keyStrength: 0.58,
  },
};

export function paletteNames(): string[] {
  return Object.keys(PALETTES);
}

export async function buildBackdrop(request: BackdropRequest): Promise<Backdrop> {
  const palette = PALETTES[request.palette] ?? PALETTES["porcelain"]!;
  const { width, height } = request;

  // The horizon sits under where the product will stand, so the part reads as
  // resting on a surface rather than floating against a flat colour. A
  // wall-mounted part is not standing on anything, so it gets none.
  const horizon = request.wallOnly ? height + 1 : Math.round(height * 0.72);
  const rgb = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y++) {
    const onFloor = y >= horizon;
    for (let x = 0; x < width; x++) {
      let base: [number, number, number];
      if (onFloor) {
        // The floor darkens towards the camera, which is what gives the plane
        // its depth; a flat floor colour reads as a second wall.
        const depth = (y - horizon) / Math.max(1, height - horizon);
        base = mix(palette.wallBottom, palette.floor, 0.35 + depth * 0.65);
      } else {
        base = mix(palette.wallTop, palette.wallBottom, y / Math.max(1, horizon));
      }

      // A soft elliptical key, brighter behind the product and falling off to
      // the corners — the single most recognisable feature of a studio sweep.
      const dx = (x / width - palette.keyX) / 0.55;
      const dy = (y / height - 0.42) / 0.75;
      const falloff = Math.max(0, 1 - (dx * dx + dy * dy));
      const lift = falloff * falloff * palette.keyStrength * 34;

      const i = (y * width + x) * 3;
      rgb[i] = clamp(base[0] + lift);
      rgb[i + 1] = clamp(base[1] + lift);
      rgb[i + 2] = clamp(base[2] + lift);
    }
  }

  // A little grain stops the gradient banding on a phone screen, which is the
  // only place most of this will ever be seen.
  const png = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .blur(1.2)
    .png()
    .toBuffer();

  return { png, palette: request.palette };
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function clamp(v: number) {
  return Math.round(Math.min(255, Math.max(0, v)));
}
