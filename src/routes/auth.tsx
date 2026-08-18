import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { WaveField, Wordmark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Steinheim" },
      {
        name: "description",
        content:
          "Team access to the Steinheim AI marketing system: knowledge base, content calendar and publishing.",
      },
      { property: "og:title", content: "Sign in — Steinheim" },
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

  // Requires the Google provider to be enabled in the Supabase project, with
  // this origin listed under the project's redirect URLs.
  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    // On success the browser leaves for Google, so nothing below this runs.
    if (error) toast.error(error.message || "Google sign-in failed");
  }

  if (!mounted) return null;

  const ar = lang === "ar";

  return (
    <div dir={dir} className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/*
        The brand panel stays obsidian in both themes. It is the one surface
        that is the identity rather than the interface, and letting it turn
        white in light mode would trade the brand for a preference.
      */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-obsidian p-14 lg:flex">
        <WaveField />

        {/* A single soft light, off-centre, so the black has depth without a gradient wash. */}
        <div
          aria-hidden
          className="steinheim-breathe pointer-events-none absolute -left-1/4 top-1/3 size-[46rem] rounded-full opacity-60"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-champagne) 9%, transparent) 0%, transparent 62%)",
          }}
        />

        <div className="relative">
          <Wordmark subtitle={ar ? "ذكاء التسويق" : "Marketing Intelligence"} />
        </div>

        <div className="relative max-w-md">
          <h1 className="steinheim-rise font-serif text-5xl leading-[1.08] text-porcelain">
            {ar ? "الماء، بتصميم." : "Water, designed."}
          </h1>
          <p className="steinheim-rise-delayed mt-6 text-[15px] leading-relaxed text-porcelain/55">
            {ar
              ? "قاعدة معرفة موثّقة عن المنتجات والمشاريع، وفريق وكلاء ذكاء اصطناعي يكتب محتوى كل يوم — ولا ينشر حرفًا قبل أن يعتمده إنسان."
              : "A verified knowledge base of products and projects, and a team of AI agents that writes daily content — and publishes nothing until a person approves it."}
          </p>
        </div>

        <p className="label-section relative text-porcelain/25">
          {ar ? "نظام التسويق الذكي" : "AI Marketing System"}
        </p>
      </aside>

      {/* Form side: porcelain by day, near-obsidian by night. */}
      <main className="relative flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          {/* The mark travels with the form on narrow screens, where the panel is gone. */}
          <div className="mb-12 lg:hidden">
            <p className="font-serif text-4xl leading-none">Steinheim</p>
            <span className="mt-2.5 block h-px w-16 bg-accent" />
            <p className="label-section mt-2.5">{ar ? "ذكاء التسويق" : "Marketing Intelligence"}</p>
          </div>

          <div className="steinheim-stagger flex items-baseline justify-between">
            <h2 className="font-serif text-3xl leading-none">
              {mode === "in" ? t("signIn") : t("signUp")}
            </h2>
            <button
              type="button"
              onClick={() => setLang(ar ? "en" : "ar")}
              className="text-[11px] uppercase tracking-brand text-muted-foreground transition-colors hover:text-foreground"
            >
              {ar ? "EN" : "العربية"}
            </button>
          </div>

          <p className="steinheim-stagger mt-3 text-sm text-muted-foreground [animation-delay:80ms]">
            {mode === "in"
              ? ar
                ? "الوصول مخصّص لفريق Steinheim."
                : "Access is limited to the Steinheim team."
              : ar
                ? "أنشئ حسابك للانضمام إلى الفريق."
                : "Create your account to join the team."}
          </p>

          <form onSubmit={submit} className="mt-10 space-y-5">
            {mode === "up" && (
              <div className="steinheim-stagger space-y-2 [animation-delay:120ms]">
                <Label htmlFor="name" className="label-section">
                  {t("displayName")}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11"
                />
              </div>
            )}

            <div className="steinheim-stagger space-y-2 [animation-delay:160ms]">
              <Label htmlFor="email" className="label-section">
                {t("email")}
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="steinheim-stagger space-y-2 [animation-delay:220ms]">
              <Label htmlFor="password" className="label-section">
                {t("password")}
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="steinheim-stagger space-y-3 pt-2 [animation-delay:280ms]">
              <Button type="submit" className="h-11 w-full gap-2" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "in" ? t("signIn") : t("signUp")}
              </Button>

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-border" />
                <span className="label-section">{ar ? "أو" : "or"}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={google}
                disabled={busy}
              >
                {ar ? "المتابعة عبر Google" : "Continue with Google"}
              </Button>
            </div>
          </form>

          <button
            type="button"
            className="steinheim-stagger mt-8 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground [animation-delay:340ms]"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in"
              ? ar
                ? "ليس لديك حساب؟ أنشئ واحدًا"
                : "No account? Create one"
              : ar
                ? "لديك حساب بالفعل؟ سجّل الدخول"
                : "Already have an account? Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}
