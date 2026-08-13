import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Steinheim AI Marketing System" },
      {
        name: "description",
        content: "Team access to the Steinheim AI marketing system: knowledge base, content calendar and publishing.",
      },
      { property: "og:title", content: "Sign in — Steinheim AI Marketing System" },
      {
        property: "og:description",
        content: "Team access to the Steinheim AI marketing system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang, dir } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name },
          },
        });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  if (!mounted) return <div className="min-h-screen bg-background" />;

  return (
    <div dir={dir} className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <p className="font-serif text-3xl">Steinheim</p>
        <div>
          <h1 className="font-serif text-4xl leading-tight text-sidebar-foreground">
            {lang === "ar" ? "الماء، بتصميم." : "Water, designed."}
          </h1>
          <p className="mt-4 max-w-sm text-sm text-sidebar-foreground/70">{t("heroSub")}</p>
        </div>
        <p className="text-[10px] uppercase tracking-brand text-sidebar-primary">{t("system")}</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl">{mode === "in" ? t("signIn") : t("signUp")}</h2>
            <button
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="text-xs uppercase tracking-brand text-muted-foreground hover:text-foreground"
            >
              {lang === "ar" ? "EN" : "العربية"}
            </button>
          </div>

          {mode === "up" && (
            <div className="space-y-2">
              <Label htmlFor="name">{t("displayName")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? t("signIn") : t("signUp")}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            Google
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? t("signUp") : t("signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
