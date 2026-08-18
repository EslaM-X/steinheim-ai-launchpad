import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Appearance state: theme and density.
 *
 * `system` follows the operating system, which is what a Windows user expects
 * from an installed application. Density scales spacing only — an operator
 * fitting more rows on screen still reads the same words at the same size.
 */

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const DENSITIES = ["comfortable", "compact", "dense"] as const;
export type Density = (typeof DENSITIES)[number];

const THEME_KEY = "steinheim-theme";
const DENSITY_KEY = "steinheim-density";

type Ctx = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** What is actually painted right now, after resolving `system`. */
  resolvedTheme: "light" | "dark";
  density: Density;
  setDensity: (density: Density) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server-render the default and correct on mount: reading localStorage during
  // render would produce markup the server could never have produced.
  const [theme, setThemeState] = useState<Theme>("system");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setThemeState(readStored(THEME_KEY, THEMES, "system"));
    setDensityState(readStored(DENSITY_KEY, DENSITIES, "comfortable"));
    setSystemDark(prefersDark());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset["density"] = density;
  }, [density]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_KEY, next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    window.localStorage.setItem(DENSITY_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme, density, setDensity }),
    [theme, setTheme, resolvedTheme, density, setDensity],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
