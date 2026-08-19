import { Link, useNavigate } from "@tanstack/react-router";
import { Languages, LogOut, Menu, Moon, PanelLeft, Search, Sun, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AmbientWater } from "@/components/AmbientWater";
import { CommandPalette } from "@/components/CommandPalette";
import { InstallPrompt } from "@/components/InstallPrompt";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { MOBILE_NAV, NAV_GROUPS } from "@/lib/navigation";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "steinheim-sidebar-collapsed";

/**
 * The application shell: obsidian navigation against a porcelain workspace.
 *
 * Structure comes from typography and whitespace rather than from stacking
 * cards, and the only saturated colour in the chrome is the champagne rule
 * under the wordmark.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang, dir } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "true");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      window.localStorage.setItem(COLLAPSE_KEY, String(!current));
      return !current;
    });
  }, []);

  // ⌘K opens the palette, ⌘B folds the rail. Both are what a desktop user tries.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (meta && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const ar = lang === "ar";

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  const rail = (
    <>
      <div className={cn("px-5 pb-6 pt-7", collapsed && "px-3 text-center")}>
        <Link to="/dashboard" className="block" onClick={() => setMobileOpen(false)}>
          <p
            className={cn(
              "font-serif leading-none text-sidebar-foreground",
              collapsed ? "text-2xl" : "text-[1.75rem]",
            )}
          >
            {collapsed ? "S" : "Steinheim"}
          </p>
          {!collapsed && (
            <>
              {/* The champagne rule echoes the wave beneath the wordmark. */}
              <span className="mt-2 block h-px w-16 bg-sidebar-primary/70" />
              <p className="label-section mt-2 text-sidebar-foreground/45">
                {ar ? "ذكاء التسويق" : "Marketing Intelligence"}
              </p>
            </>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            {!collapsed && (
              <p className="label-section px-3 pb-2 text-sidebar-foreground/35">
                {ar ? group.labelAr : group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? (ar ? item.labelAr : item.label) : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/70",
                    "transition-colors duration-[var(--motion-micro)]",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed ? "justify-center py-2.5" : "py-2",
                  )}
                  activeProps={{
                    className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  }}
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{ar ? item.labelAr : item.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={signOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60",
            "transition-colors duration-[var(--motion-micro)]",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && t("signOut")}
        </button>
      </div>
    </>
  );

  return (
    <div dir={dir} className="relative flex min-h-screen bg-background text-foreground">
      <AmbientWater />
      {/* Desktop rail */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex",
          "transition-[width] duration-[var(--motion-panel)] ease-[var(--ease-standard)]",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {rail}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label={ar ? "إغلاق" : "Close navigation"}
            className="absolute inset-0 bg-obsidian/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-[var(--elevation-overlay)]">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute end-3 top-5 rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent"
              aria-label={ar ? "إغلاق" : "Close"}
            >
              <X className="size-4" />
            </button>
            {rail}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl md:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary md:hidden"
            aria-label={ar ? "فتح القائمة" : "Open navigation"}
          >
            <Menu className="size-4" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:block"
            aria-label={ar ? "طي القائمة" : "Toggle sidebar"}
          >
            <PanelLeft className="size-4" />
          </button>

          {/* The search field is the palette's affordance — it opens, never types. */}
          <button
            onClick={() => setPaletteOpen(true)}
            className={cn(
              "group flex h-9 flex-1 items-center gap-2.5 rounded-lg border border-border bg-card px-3",
              "text-sm text-muted-foreground transition-colors hover:border-accent/50 md:max-w-md",
            )}
          >
            <Search className="size-3.5" />
            <span className="truncate">{ar ? "ابحث في Steinheim…" : "Search Steinheim…"}</span>
            <kbd className="ms-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] tracking-wider text-muted-foreground/70 md:inline-block">
              ⌘K
            </kbd>
          </button>

          <div className="ms-auto flex items-center gap-1">
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={ar ? "تبديل المظهر" : "Toggle theme"}
            >
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button
              onClick={() => setLang(ar ? "en" : "ar")}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={ar ? "Switch to English" : "التبديل إلى العربية"}
            >
              <Languages className="size-4" />
              {ar ? "EN" : "ع"}
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">{children}</main>

        {/* Phones navigate from the bottom, where the thumb already is. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <item.icon className="size-[18px]" />
              <span className="max-w-full truncate px-1">
                {(ar ? item.labelAr : item.label).split(" ")[0]}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <InstallPrompt />
    </div>
  );
}
