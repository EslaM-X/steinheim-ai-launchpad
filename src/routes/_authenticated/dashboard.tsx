import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateToday } from "@/lib/agents.functions";
import { useI18n } from "@/lib/i18n";
import { analyticsQuery, ideasQuery, postsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center — Steinheim" },
      {
        name: "description",
        content: "What Steinheim's marketing system needs from you today.",
      },
      { property: "og:title", content: "Command Center — Steinheim" },
      {
        property: "og:description",
        content: "What Steinheim's marketing system needs from you today.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommandCenter,
});

function greeting(hour: number, ar: boolean) {
  if (hour < 12) return ar ? "صباح الخير" : "Good morning";
  if (hour < 18) return ar ? "مساء الخير" : "Good afternoon";
  return ar ? "مساء الخير" : "Good evening";
}

/** Section opener: a label, a rule, and room to breathe. */
function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2.5">
        <h2 className="label-section">{label}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Figure({
  value,
  label,
  tone = "default",
}: {
  value: string | number;
  label: string;
  tone?: "default" | "accent" | "warning";
}) {
  return (
    <div className="surface density-pad">
      <p
        className={cn(
          "numeral-display text-4xl leading-none",
          tone === "accent" && "text-primary",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      <p className="label-section mt-3">{label}</p>
    </div>
  );
}

function CommandCenter() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const posts = useQuery(postsQuery);
  const ideas = useQuery(ideasQuery);
  const analytics = useQuery(analyticsQuery);
  const run = useServerFn(generateToday);

  const generate = useMutation({
    mutationFn: () => run({}),
    onSuccess: (data) => {
      toast.success(ar ? `تم توليد: ${data.topic}` : `Generated: ${data.topic}`);
      qc.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loading = posts.isLoading || ideas.isLoading || analytics.isLoading;
  const all = (posts.data ?? []).filter((p) => !(p as { is_test?: boolean }).is_test);

  const awaitingHuman = all.filter(
    (p) => p.status === "ai_approved" || p.status === "reviewed",
  ).length;
  const approved = all.filter((p) => p.status === "approved").length;
  const published = all.filter((p) => p.status === "published").length;
  const needsRevision = all.filter((p) => p.status === "needs_revision").length;
  const unknown = all.filter((p) => p.status === "unknown").length;

  const scored = all.filter((p) => typeof p.review_score === "number");
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, p) => sum + (p.review_score ?? 0), 0) / scored.length)
    : null;

  const totals = (analytics.data ?? []).reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions ?? 0),
      engagements: acc.engagements + (row.engagements ?? 0),
    }),
    { impressions: 0, engagements: 0 },
  );
  const engagementRate = totals.impressions
    ? ((totals.engagements / totals.impressions) * 100).toFixed(1)
    : null;

  // Only what a person can act on right now, most consequential first.
  const attention: Array<{ text: string; to: string; severity: "high" | "medium" }> = [];
  if (awaitingHuman > 0)
    attention.push({
      text: ar
        ? `${awaitingHuman} منشور ينتظر اعتمادك`
        : `${awaitingHuman} post${awaitingHuman > 1 ? "s" : ""} awaiting your approval`,
      to: "/publish",
      severity: "high",
    });
  if (unknown > 0)
    attention.push({
      text: ar
        ? `${unknown} منشور بحالة غير مؤكدة — يحتاج مطابقة`
        : `${unknown} post${unknown > 1 ? "s" : ""} unconfirmed — needs reconciliation`,
      to: "/publish",
      severity: "high",
    });
  if (needsRevision > 0)
    attention.push({
      text: ar
        ? `${needsRevision} منشور لم يجتز بوابة الجودة`
        : `${needsRevision} post${needsRevision > 1 ? "s" : ""} did not pass the quality gate`,
      to: "/logs",
      severity: "medium",
    });

  const today = new Date().toISOString().slice(0, 10);
  // content_type and funnel_stage were added to the table after IdeaRow was
  // typed; read them defensively rather than widening a shared query type.
  const todaysIdeas = (ideas.data ?? []).filter((i) => i.planned_date === today) as Array<
    (typeof ideas.data extends undefined ? never : NonNullable<typeof ideas.data>)[number] & {
      content_type?: string | null;
      funnel_stage?: string | null;
    }
  >;

  return (
    <div className="mx-auto max-w-6xl space-y-12">
      {/* ── the greeting carries the brand voice; everything else is the interface */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-4xl leading-none md:text-5xl">
            {greeting(new Date().getHours(), ar)}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {attention.length
              ? ar
                ? `${attention.length} ${attention.length === 1 ? "شيء يحتاج" : "أشياء تحتاج"} انتباهك.`
                : `${attention.length} thing${attention.length > 1 ? "s" : ""} need${attention.length > 1 ? "" : "s"} your attention.`
              : ar
                ? "لا شيء ينتظر قرارك."
                : "Nothing is waiting on you."}
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="gap-2"
        >
          {generate.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {generate.isPending
            ? ar
              ? "جارٍ التوليد…"
              : "Generating…"
            : ar
              ? "توليد محتوى اليوم"
              : "Generate today"}
        </Button>
      </header>

      {/* ── what needs a decision ─────────────────────────────────────────── */}
      {attention.length > 0 && (
        <Section label={ar ? "يحتاج انتباهك" : "Needs attention"}>
          <ul className="divide-y divide-border">
            {attention.map((item) => (
              <li key={item.text}>
                <Link
                  to={item.to}
                  className="group flex items-center gap-3 py-3.5 transition-colors hover:text-primary"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      item.severity === "high" ? "bg-warning" : "bg-muted-foreground/50",
                    )}
                  />
                  <span className="text-sm">{item.text}</span>
                  <ArrowUpRight className="ms-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── the pipeline right now ────────────────────────────────────────── */}
      <Section label={ar ? "خط الإنتاج" : "Pipeline"}>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[7.5rem] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid density-gap sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              value={awaitingHuman}
              label={ar ? "ينتظر اعتمادك" : "Awaiting you"}
              tone={awaitingHuman ? "warning" : "default"}
            />
            <Figure value={approved} label={ar ? "في طابور النشر" : "In publish queue"} />
            <Figure value={published} label={ar ? "منشور" : "Published"} tone="accent" />
            <Figure
              value={averageScore ?? "—"}
              label={ar ? "متوسط درجة الجودة" : "Average quality score"}
            />
          </div>
        )}
      </Section>

      {/* ── today's editorial decision ────────────────────────────────────── */}
      <Section
        label={ar ? "موضوعات اليوم" : "Today's ideas"}
        action={
          <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
            {ar ? "التقويم" : "Calendar"}
          </Link>
        }
      >
        {loading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : todaysIdeas.length ? (
          <ul className="divide-y divide-border">
            {todaysIdeas.slice(0, 4).map((idea) => (
              <li key={idea.id} className="py-3.5">
                <p className="text-sm font-medium">
                  {ar ? (idea.topic_ar ?? idea.topic) : idea.topic}
                </p>
                <p className="label-section mt-1.5">
                  {[idea.content_type, idea.funnel_stage].filter(Boolean).join(" · ") || "—"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="surface density-pad text-center">
            <p className="font-serif text-xl">
              {ar ? "لم يُولَّد شيء اليوم بعد" : "Nothing generated today yet"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {ar
                ? "الاستراتيجي يختار الموضوع بناءً على التدوير والجمهور والأداء السابق."
                : "The strategist picks the topic from rotation, audience and past performance."}
            </p>
          </div>
        )}
      </Section>

      {/* ── performance, stated plainly ───────────────────────────────────── */}
      <Section
        label={ar ? "الأداء" : "Performance"}
        action={
          <Link to="/analytics" className="text-xs text-muted-foreground hover:text-foreground">
            {ar ? "التفاصيل" : "Details"}
          </Link>
        }
      >
        {loading ? (
          <Skeleton className="h-[7.5rem] rounded-xl" />
        ) : totals.impressions ? (
          <div className="grid density-gap sm:grid-cols-3">
            <Figure
              value={totals.impressions.toLocaleString(ar ? "ar-EG" : "en-US")}
              label={ar ? "ظهور" : "Impressions"}
            />
            <Figure
              value={totals.engagements.toLocaleString(ar ? "ar-EG" : "en-US")}
              label={ar ? "تفاعل" : "Engagements"}
            />
            <Figure
              value={engagementRate ? `${engagementRate}%` : "—"}
              label={ar ? "معدل التفاعل" : "Engagement rate"}
              tone="accent"
            />
          </div>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            {ar
              ? "لا توجد قياسات بعد. الأرقام تظهر هنا بعد أول جمع للأداء."
              : "No measurements yet. Figures appear here after the first collection run."}
          </p>
        )}
      </Section>
    </div>
  );
}
