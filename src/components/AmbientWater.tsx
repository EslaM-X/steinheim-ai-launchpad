import { useEffect, useState } from "react";

/**
 * The application's ambient layer: water, barely there.
 *
 * The discipline is 90% stillness. Two currents drift so slowly they read as
 * atmosphere rather than animation, and a single droplet falls roughly once
 * every half minute — never a shower. Thirty droplets on a screen is a
 * screensaver; one droplet you almost miss is a brand.
 *
 * It sits behind everything with pointer-events disabled, so it can never
 * intercept a click, and it inherits the reduced-motion rule from styles.css,
 * which stops every animation here without removing anything from the page.
 */

const DROP_MIN_MS = 22_000;
const DROP_MAX_MS = 46_000;

interface Droplet {
  id: number;
  /** Percentage across the viewport. */
  x: number;
  y: number;
}

export function AmbientWater() {
  const [droplets, setDroplets] = useState<Droplet[]>([]);

  useEffect(() => {
    // Someone who asked their system to reduce motion gets the still version.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: ReturnType<typeof setTimeout>;
    let id = 0;

    const schedule = () => {
      const delay = DROP_MIN_MS + Math.random() * (DROP_MAX_MS - DROP_MIN_MS);
      timer = setTimeout(() => {
        const drop: Droplet = {
          id: (id += 1),
          // Kept away from the edges, where a ripple would clip.
          x: 12 + Math.random() * 76,
          y: 18 + Math.random() * 60,
        };
        setDroplets((current) => [...current, drop]);
        // The element removes itself once its animation is spent.
        setTimeout(() => setDroplets((c) => c.filter((d) => d.id !== drop.id)), 4200);
        schedule();
      }, delay);
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Two currents. The second is offset and slower, so they never align. */}
      <Current className="steinheim-current-a" top="28%" opacity={0.5} />
      <Current className="steinheim-current-b" top="61%" opacity={0.35} />

      {droplets.map((drop) => (
        <span
          key={drop.id}
          className="steinheim-ripple absolute block rounded-full border border-accent/25"
          style={{ left: `${drop.x}%`, top: `${drop.y}%` }}
        />
      ))}
    </div>
  );
}

function Current({ className, top, opacity }: { className: string; top: string; opacity: number }) {
  // Three wavelengths wide, translated by exactly one — a seamless loop.
  const d = [0, 1, 2]
    .map((i) => {
      const x = i * 200;
      return `${i === 0 ? `M ${x} 50` : ""} C ${x + 50} 20, ${x + 100} 80, ${x + 150} 50 S ${x + 200} 20, ${x + 200} 50`;
    })
    .join(" ");

  return (
    <svg
      className={`absolute w-[300%] min-w-[1800px] text-accent ${className}`}
      style={{ top, opacity: `calc(var(--ambient-strength) * ${opacity} * 12)` }}
      viewBox="0 0 600 100"
      preserveAspectRatio="none"
      fill="none"
    >
      <path d={d} stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
