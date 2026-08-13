import { Link, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Send,
  Sparkles,
  BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const nav: Array<{ to: string; key: TKey; icon: typeof LayoutDashboard }> = [
  { to: "/dashboard", key: "overview", icon: LayoutDashboard },
  { to: "/calendar", key: "calendar", icon: CalendarDays },
  { to: "/products", key: "products", icon: Package },
  { to: "/knowledge", key: "knowledge", icon: BookOpen },
  { to: "/publish", key: "publish", icon: Send },
  { to: "/analytics", key: "analytics", icon: BarChart3 },
  { to: "/logs", key: "logs", icon: ClipboardList },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang, dir } = useI18n();
  const navigate = useNavigate();

  return (
    <div dir={dir} className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-6 py-6">
          <p className="font-serif text-2xl">Steinheim</p>
          <p className="mt-1 text-[10px] uppercase tracking-brand text-sidebar-primary">
            {t("system")}
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <item.icon className="size-4" />
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
            {t("signOut")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 md:px-8">
          <div className="flex items-center gap-2 overflow-x-auto md:hidden">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-sm px-2 py-1 text-xs text-muted-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {t(item.key)}
              </Link>
            ))}
          </div>
          <div className="hidden items-center gap-2 text-xs uppercase tracking-brand text-muted-foreground md:flex">
            <Sparkles className="size-3.5 text-accent" />
            {t("system")}
          </div>
          <div className="flex items-center gap-1 rounded-sm border border-border p-0.5">
            {(["ar", "en"] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant="ghost"
                onClick={() => setLang(l)}
                className={cn(
                  "h-7 px-3 text-xs",
                  lang === l && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {l === "ar" ? "العربية" : "EN"}
              </Button>
            ))}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
