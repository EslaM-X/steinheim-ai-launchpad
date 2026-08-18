import { cn } from "@/lib/utils";

/**
 * The Steinheim wave, drawn as one continuous band and drifting slowly.
 *
 * The brand is called "Water, designed" and its wordmark is underlined by a
 * wave, so the only motion the identity earns is water: a slow horizontal
 * drift with no bounce, no glow and no loop the eye can catch. The path is
 * three wavelengths wide and translates by exactly one, which makes the loop
 * seamless.
 *
 * Every animation here is disabled by the reduced-motion rule in styles.css.
 */
export function WaveField({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* Three layers at different speeds read as depth rather than as a loop. */}
      <Wave className="steinheim-drift-slow text-porcelain/[0.07]" y={0} strokeWidth={1.5} />
      <Wave className="steinheim-drift-mid text-champagne/[0.13]" y={26} strokeWidth={1.25} />
      <Wave className="steinheim-drift-fast text-porcelain/[0.045]" y={54} strokeWidth={1} />
    </div>
  );
}

function Wave({
  className,
  y,
  strokeWidth,
}: {
  className: string;
  y: number;
  strokeWidth: number;
}) {
  // One wavelength is 120 units; the path spans three and shifts by one.
  const d = [0, 1, 2]
    .map((i) => {
      const x = i * 120;
      return `${i === 0 ? `M ${x} 40` : ""} C ${x + 30} 16, ${x + 60} 64, ${x + 90} 40 S ${x + 120} 16, ${x + 120} 40`;
    })
    .join(" ");

  return (
    <svg
      className={cn("absolute w-[300%] min-w-[1400px]", className)}
      style={{ top: `${38 + y}%` }}
      viewBox="0 0 360 80"
      preserveAspectRatio="none"
      fill="none"
    >
      <path d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/**
 * The wordmark with its champagne rule. The rule draws itself once on mount —
 * a single gesture, not a loop, so it reads as the mark settling into place.
 */
export function Wordmark({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <p className="steinheim-rise font-serif text-5xl leading-none tracking-tight text-porcelain md:text-6xl">
        Steinheim
      </p>
      <svg
        className="mt-3 h-3 w-52 text-champagne md:w-64"
        viewBox="0 0 240 12"
        fill="none"
        aria-hidden
      >
        <path
          className="steinheim-draw"
          d="M2 7 C 40 1, 78 1, 116 5 S 202 11, 238 4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      {subtitle && (
        <p className="steinheim-rise-delayed label-section mt-5 text-porcelain/40">{subtitle}</p>
      )}
    </div>
  );
}
