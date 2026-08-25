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
