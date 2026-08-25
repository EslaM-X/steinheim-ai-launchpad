import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Turns finished stills into a short video.
 *
 * There is no AI video model in this path, and that is a decision rather than a
 * gap. The free hosted ones are watermarked or rate-limited into uselessness,
 * and every one of them would do the thing this system exists to prevent:
 * invent the product, frame by frame, where motion hides the distortion better
 * than a still ever could.
 *
 * A slow push and a cross-dissolve between real finishes carry a product
 * perfectly well, cost nothing, run unmetered, and are deterministic — the same
 * stills always yield the same file, so a re-render cannot quietly produce
 * something the approver did not see.
 */

export interface MotionRequest {
  /** Finished composites, in the order they should appear. */
  frames: Buffer[];
  width: number;
  height: number;
  /** Seconds each still holds, before the dissolve. */
  hold?: number;
  /** Seconds of cross-dissolve between stills. */
  dissolve?: number;
  fps?: number;
}

export interface Motion {
  mp4: Buffer;
  durationSeconds: number;
  width: number;
  height: number;
}

const FFMPEG = process.env["FFMPEG_PATH"] ?? "ffmpeg";

export async function renderMotion(request: MotionRequest): Promise<Motion> {
  const { frames, width, height } = request;
  if (frames.length === 0) throw new Error("renderMotion needs at least one frame.");

  // Slower than feels right when you are watching it on a laptop, and about
  // right on a phone. Luxury advertising holds a frame long enough for the eye
  // to finish reading the object before it moves.
  const hold = request.hold ?? 3.2;
  const dissolve = request.dissolve ?? 0.8;
  const fps = request.fps ?? 25;

  const dir = await mkdtemp(join(tmpdir(), "steinheim-motion-"));
  try {
    const paths: string[] = [];
    for (const [i, frame] of frames.entries()) {
      const path = join(dir, `frame-${i}.png`);
      await writeFile(path, frame);
      paths.push(path);
    }
    const out = join(dir, "out.mp4");

    const args: string[] = [];
    for (const path of paths) args.push("-loop", "1", "-t", String(hold), "-i", path);

    // zoompan with d=1 emits one frame per input frame. Any other value makes it
    // emit d frames for each, which turned a six-second cut into 160 seconds the
    // first time this was written.
    const push = (index: number) =>
      `[${index}:v]fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},zoompan=z='min(1+${PUSH_RATE}*on,${PUSH_LIMIT})':` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps},setsar=1[v${index}]`;

    const chains = paths.map((_, i) => push(i));
    let last = "v0";
    for (let i = 1; i < paths.length; i++) {
      const offset = (hold - dissolve) * i - dissolve * (i - 1);
      const label = i === paths.length - 1 ? "out" : `x${i}`;
      chains.push(
        `[${last}][v${i}]xfade=transition=fade:duration=${dissolve}:offset=${offset.toFixed(2)}[${label}]`,
      );
      last = label;
    }
    const map = paths.length === 1 ? "[v0]" : "[out]";

    args.push(
      "-filter_complex",
      chains.join(";"),
      "-map",
      map,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      // Puts the index at the front so a social platform can start playing
      // before the whole file has arrived.
      "-movflags",
      "+faststart",
      "-y",
      out,
    );

    await run(FFMPEG, args);
    const { readFile } = await import("node:fs/promises");
    const mp4 = await readFile(out);
    const duration = hold * paths.length - dissolve * (paths.length - 1);
    return { mp4, durationSeconds: duration, width, height };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    // ffmpeg reports everything on stderr, progress included, so it is only
    // read to explain a failure — never treated as one on its own.
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });
    child.on("error", (error) =>
      reject(
        new Error(
          `Could not run ${command}: ${error.message}. Set FFMPEG_PATH if it lives elsewhere.`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

/** Zoom added per frame. Slow enough to read as a camera move, not a zoom. */
const PUSH_RATE = 0.0016;

/** Where the push stops. Beyond this the source starts to soften visibly. */
const PUSH_LIMIT = 1.16;
