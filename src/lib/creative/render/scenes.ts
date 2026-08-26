/**
 * Rooms the brand already owns, with the fitting position recorded.
 *
 * Placing a product into an arbitrary photograph means guessing where the basin
 * is, how big it is and which way the light falls. Guessing produced exactly
 * what it sounds like: a tap standing in front of a bathroom rather than
 * plumbed into one.
 *
 * These are Steinheim's own photographs, so there is no licence to satisfy and
 * no guessing to do. Each already contains a correctly fitted mixer, which
 * means the mounting point, the scale, the perspective and the lighting are all
 * settled by the photograph itself. The work is to take the fitting out and put
 * one of ours in its place — and the coordinates below were read off each image
 * against a printed grid rather than estimated.
 *
 * Every value is a fraction of the frame, so a scene can be rendered at any
 * size and the fitting still lands where the plumbing is.
 */

export type MountType = "deck" | "wall";

export interface SceneAnchor {
  /** Where the existing fitting sits, as fractions of the frame. */
  box: { left: number; top: number; width: number; height: number };
  /**
   * Where the replacement's own base sits.
   *
   * Deck-mounted: the centre of the tap's foot, on the basin rim.
   * Wall-mounted: the centre of the wall plate.
   */
  anchor: { x: number; y: number };
  mount: MountType;
  /**
   * Which side the key light comes from — the rim light follows it, and a rim
   * on the wrong side is the single most obvious sign of a composite.
   */
  keyFrom: "left" | "right";
  /**
   * The direction to clone wall from when erasing the old fitting.
   *
   * A panelled wall has grain; cloning across it smears, cloning along it
   * disappears.
   */
  cloneFrom: "left" | "right" | "above";
  /**
   * A rectangle of bare wall, verified by eye, to rebuild the erased area from.
   *
   * Without one the eraser takes the same-sized block immediately beside the
   * fitting, which is only clean if nothing else happens to be there — and in
   * both of these rooms something is. In the oak scene that block catches the
   * mirror's rim along its top and the basin's rim along its bottom, and pastes
   * both back over the wall: the "pane of glass" that appeared across the
   * finished frame was the mirror, copied.
   *
   * Read as fractions of the source photograph, like every other value here.
   */
  cloneBox?: { left: number; top: number; width: number; height: number };
}

export interface Scene {
  id: string;
  /** On steinheim-eg.com — the brand's own asset, no third-party licence. */
  path: string;
  label: string;
  /** Which products can plausibly be fitted here. */
  fits: MountType;
  anchor: SceneAnchor;
}

export const SCENES: Scene[] = [
  {
    id: "oak-round-basin",
    path: "/images/steinheim/karim-2026/home-joy.webp",
    label: "Oak panelling, round travertine basin",
    fits: "deck",
    anchor: {
      // Read at 1000x1200: body from x=210, spout tip to x=445, top y=460,
      // foot meeting the basin rim at y=795.
      box: { left: 0.21, top: 0.383, width: 0.235, height: 0.279 },
      anchor: { x: 0.25, y: 0.658 },
      mount: "deck",
      keyFrom: "left",
      // Cloned from the right. Above looked correct on paper — the oak grain
      // runs vertically — but the mirror's dark rim sits directly over the tap
      // and got stretched down across the patch as a smear. The panel to the
      // right is clean at the same height.
      cloneFrom: "right",
      // The block immediately to the right is not clean after all: it catches
      // the mirror's rim across its top and the basin's across its bottom, and
      // laid both back over the wall. In the finished frame that read as a pane
      // of glass leaning against the panelling.
      //
      // This rectangle is bare oak — below the mirror, above the basin, right
      // of the tap — read off the 1250x1500 original at x 625..926, y 588..912.
      cloneBox: { left: 0.5, top: 0.392, width: 0.241, height: 0.216 },
    },
  },
  {
    id: "warm-plaster-wall",
    path: "/images/generated/gessi/steinheim-warm-wall-mounted-basin.png",
    label: "Warm plaster wall, travertine bowl",
    fits: "wall",
    anchor: {
      // Read at 1400x788 and converted: spout tip x=728, plate right edge
      // x=1000, top y=232, bottom y=358.
      box: { left: 0.52, top: 0.294, width: 0.194, height: 0.16 },
      anchor: { x: 0.705, y: 0.374 },
      mount: "wall",
      keyFrom: "left",
      // Flat plaster, so any direction works; the right side is clear of the
      // basin and the branch.
      cloneFrom: "right",
      // It is not clear of the branch. Measured on the 1672x941 original, the
      // block to the right is x 1219..1595 — and the olive branch fills it,
      // so erasing the old spout planted a second branch on the wall.
      //
      // This rectangle is bare plaster directly above the fitting, where the
      // texture and the light are the same: x 960..1260, y 70..255.
      cloneBox: { left: 0.5742, top: 0.0744, width: 0.1794, height: 0.1966 },
    },
  },
];

export function sceneById(id: string): Scene | null {
  return SCENES.find((s) => s.id === id) ?? null;
}

/** Scenes a product of this mounting type can be fitted into. */
export function scenesFor(mount: MountType): Scene[] {
  return SCENES.filter((s) => s.fits === mount);
}

/**
 * The scene a product may honestly be shown in, or null for none.
 *
 * Both rooms photograph a basin, so only a basin mixer belongs in one. Anything
 * else put there is a picture of an installation that cannot exist: a concealed
 * shower valve has no basin, a free-standing bath mixer stands on the floor
 * beside a tub, and an angle valve fits under the counter. Standing any of them
 * on a basin rim is as much a false claim as writing one, and it is the kind a
 * reader believes instantly because photographs are not read sceptically.
 *
 * A product with no scene keeps the studio backdrop. That is not a downgrade —
 * a plain product shot claims nothing about where the thing goes.
 *
 * The catalogue carries no installation_type — every row's is null — so the
 * name is all there is to go on. That makes the rule deliberately narrow:
 * something has to look like a basin mixer to be treated as one.
 */
export function sceneForProduct(
  productName: string,
  installationType?: string | null,
): { sceneId: string | null; mount: MountType | null; reason: string } {
  const text = `${installationType ?? ""} ${productName}`.trim();

  // Checked before anything else: these read as basin fittings by name and are
  // not. "Shower Column with Bath Mixer" contains "Bath Mixer"; "Concealed
  // Shower" is plumbed inside the wall and has no visible body at all.
  const notABasinFitting =
    /concealed|free-?standing|floor-?(mounted|standing)|shower\s*column|body\s*jet|rain|accessor|angle\s*valve|waste|bidet|hose|holder|towel|robe|hook|soap/i;
  if (notABasinFitting.test(text)) {
    return {
      sceneId: null,
      mount: null,
      reason: `${productName} is not a basin fitting, so neither room can show it installed.`,
    };
  }

  if (!/basin\s*mixer|lavatory|washbasin/i.test(text)) {
    return {
      sceneId: null,
      mount: null,
      reason: `${productName} is not identifiable as a basin mixer from the catalogue, and guessing would put it somewhere it does not go.`,
    };
  }

  const mount: MountType = /wall/i.test(text) ? "wall" : "deck";
  const scene = scenesFor(mount)[0];
  return scene
    ? { sceneId: scene.id, mount, reason: `${mount}-mounted basin mixer` }
    : { sceneId: null, mount, reason: `No ${mount} room is available.` };
}
