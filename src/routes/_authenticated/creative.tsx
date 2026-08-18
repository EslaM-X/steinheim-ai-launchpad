import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adVariantsQuery,
  campaignsQuery,
  conceptsQuery,
  creativeReviewQuery,
  referencesQuery,
  storyboardQuery,
} from "@/lib/creative-queries";
import {
  analyzeReferenceFn,
  approveCampaignFn,
  createCampaign,
  creativeActionFn,
  generateConceptsFn,
  regenerateShotFn,
  reviewCampaignFn,
  selectConceptFn,
} from "@/lib/creative.functions";
import { AUDIENCE_SEGMENTS, CREATIVE_DIRECTIONS } from "@/lib/creative/schemas";
import { productsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "linkedin"];

export const Route = createFileRoute("/_authenticated/creative")({
  head: () => ({
    meta: [
      { title: "Creative Studio — Steinheim" },
      {
        name: "description",
        content:
          "Plan, direct and review Steinheim ad campaigns: briefs, concepts, storyboards, shots and creative quality gates.",
      },
      { property: "og:title", content: "Creative Studio — Steinheim" },
      {
        property: "og:description",
        content: "From product truth to concept, storyboard, shots and platform ad variants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreativeStudio,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-brand text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function CreativeStudio() {
  const qc = useQueryClient();
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const campaigns = useQuery(campaignsQuery);
  const products = useQuery(productsQuery);
  const concepts = useQuery(conceptsQuery(campaignId));
  const storyboard = useQuery(storyboardQuery(campaignId));
  const review = useQuery(creativeReviewQuery(campaignId));
  const variants = useQuery(adVariantsQuery(campaignId));
  const references = useQuery(referencesQuery(campaignId));

  const [form, setForm] = useState({
    name: "",
    objective: "sales_awareness",
    market: "Egypt",
    language: "ar-EG",
    duration_seconds: 30,
    budget_egp: "",
    product_id: "",
    audience_segment: "interior_designers",
    platforms: ["instagram", "facebook"] as string[],
    directions: ["luxury", "cinematic"] as string[],
  });
  const [ref, setRef] = useState({ source_url: "", notes: "" });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    qc.invalidateQueries({ queryKey: ["creative-concepts"] });
    qc.invalidateQueries({ queryKey: ["creative-storyboard"] });
    qc.invalidateQueries({ queryKey: ["creative-review"] });
    qc.invalidateQueries({ queryKey: ["ad-variants"] });
    qc.invalidateQueries({ queryKey: ["creative-references"] });
  };

  const create = useServerFn(createCampaign);
  const analyze = useServerFn(analyzeReferenceFn);
  const genConcepts = useServerFn(generateConceptsFn);
  const pickConcept = useServerFn(selectConceptFn);
  const regenShot = useServerFn(regenerateShotFn);
  const action = useServerFn(creativeActionFn);
  const runReview = useServerFn(reviewCampaignFn);
  const approve = useServerFn(approveCampaignFn);

  const run = <T,>(fn: () => Promise<T>, okMessage: string) =>
    fn()
      .then((r) => {
        refresh();
        toast.success(okMessage);
        return r;
      })
      .catch((e: Error) => toast.error(e.message));

  const createMutation = useMutation({
    mutationFn: async () =>
      create({
        data: {
          name: form.name || "Steinheim campaign",
          objective: form.objective,
          market: form.market,
          language: form.language,
          duration_seconds: Number(form.duration_seconds) || 30,
          platforms: form.platforms,
          directions: form.directions,
          product_id: form.product_id || null,
          audience_segment: form.audience_segment,
          budget_egp: form.budget_egp ? Number(form.budget_egp) : null,
        },
      }),
    onSuccess: (c: any) => {
      setCampaignId(c.id);
      refresh();
      toast.success("Campaign brief created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (key: "platforms" | "directions", value: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const campaign = (campaigns.data ?? []).find((c: any) => c.id === campaignId) ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl">Creative Studio</h1>
        <p className="text-sm text-muted-foreground">
          من المنتج إلى الفكرة إلى الـStoryboard إلى نسخ المنصات — تحت الـTruth Layer
          والـGatekeeper.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Section title="Campaign">
            <Card>
              <CardContent className="space-y-3 pt-5">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Duration (s)</Label>
                    <Input
                      type="number"
                      value={form.duration_seconds}
                      onChange={(e) =>
                        setForm({ ...form, duration_seconds: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Budget (EGP)</Label>
                    <Input
                      value={form.budget_egp}
                      onChange={(e) => setForm({ ...form, budget_egp: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Product (Truth Layer)</Label>
                  <select
                    className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
                    value={form.product_id}
                    onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {(products.data ?? []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.official_name || p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Audience</Label>
                  <select
                    className="h-9 w-full rounded-sm border border-border bg-background px-2 text-sm"
                    value={form.audience_segment}
                    onChange={(e) => setForm({ ...form, audience_segment: e.target.value })}
                  >
                    {AUDIENCE_SEGMENTS.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label_en}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Platforms</Label>
                  <div className="flex flex-wrap gap-1">
                    {PLATFORMS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggle("platforms", p)}
                        className={cn(
                          "rounded-sm border border-border px-2 py-1 text-xs capitalize",
                          form.platforms.includes(p) && "bg-primary text-primary-foreground",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Creative direction</Label>
                  <div className="flex flex-wrap gap-1">
                    {CREATIVE_DIRECTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggle("directions", d)}
                        className={cn(
                          "rounded-sm border border-border px-2 py-1 text-xs capitalize",
                          form.directions.includes(d) && "bg-accent text-accent-foreground",
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? "Creating…" : "Create campaign"}
                </Button>
              </CardContent>
            </Card>
          </Section>

          <Section title="Campaigns">
            <div className="space-y-1">
              {(campaigns.data ?? []).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setCampaignId(c.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm border border-border px-3 py-2 text-left text-sm",
                    campaignId === c.id && "bg-secondary",
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  <Badge variant="outline">{c.status}</Badge>
                </button>
              ))}
              {!campaigns.data?.length && (
                <p className="text-xs text-muted-foreground">No campaigns yet.</p>
              )}
            </div>
          </Section>
        </div>

        <div className="space-y-8">
          {!campaign && (
            <p className="text-sm text-muted-foreground">اختر أو أنشئ campaign للبدء.</p>
          )}

          {campaign && (
            <>
              <Section title="Reference (inspiration only — never copied)">
                <Card>
                  <CardContent className="space-y-3 pt-5">
                    <Input
                      placeholder="Reference URL"
                      value={ref.source_url}
                      onChange={(e) => setRef({ ...ref, source_url: e.target.value })}
                    />
                    <Textarea
                      placeholder="أو صف الإعلان المرجعي…"
                      value={ref.notes}
                      onChange={(e) => setRef({ ...ref, notes: e.target.value })}
                    />
                    <Button
                      variant="secondary"
                      onClick={() =>
                        run(
                          () =>
                            analyze({
                              data: {
                                campaignId: campaign.id,
                                kind: ref.source_url ? "url" : "description",
                                source_url: ref.source_url || null,
                                notes: ref.notes || null,
                              },
                            }),
                          "Creative DNA extracted",
                        )
                      }
                    >
                      Analyze reference
                    </Button>
                    {(references.data ?? []).slice(0, 1).map((r: any) => (
                      <div key={r.id} className="grid gap-1 rounded-sm bg-muted/40 p-3 text-xs">
                        {Object.entries(r.creative_dna ?? {}).map(([k, v]) => (
                          <p key={k}>
                            <span className="text-muted-foreground">{k}: </span>
                            {String(v)}
                          </p>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </Section>

              <Section title="Concepts">
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      run(
                        () => genConcepts({ data: { campaignId: campaign.id } }),
                        "Concepts ready",
                      )
                    }
                  >
                    Generate concepts
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(concepts.data ?? []).map((c: any) => (
                    <Card key={c.id} className={cn(c.selected && "border-accent")}>
                      <CardContent className="space-y-2 pt-5">
                        <div className="flex items-center justify-between">
                          <p className="font-serif text-lg">
                            {String(c.slot).padStart(2, "0")} · {c.title}
                          </p>
                          {c.selected && <Badge>selected</Badge>}
                        </div>
                        <p className="text-sm">{c.big_idea}</p>
                        <p className="whitespace-pre-line text-xs text-muted-foreground">
                          {c.script_ar}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.why_it_works}</p>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            run(
                              () => pickConcept({ data: { conceptId: c.id } }),
                              "Storyboard built",
                            )
                          }
                        >
                          Select & build storyboard
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </Section>

              <Section title="Storyboard">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["cinematic", "Make It More Cinematic"],
                      ["egyptian", "Make It More Egyptian"],
                      ["global", "Create Global Version"],
                      ["variants", "Create Ad Variations"],
                    ] as const
                  ).map(([a, label]) => (
                    <Button
                      key={a}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(() => action({ data: { campaignId: campaign.id, action: a } }), label)
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(storyboard.data?.shots ?? []).map((s: any) => (
                    <Card key={s.id}>
                      <CardContent className="space-y-2 pt-5 text-xs">
                        <div className="flex items-center justify-between">
                          <p className="font-serif text-base">
                            SHOT {String(s.shot_number).padStart(2, "0")}
                          </p>
                          <Badge variant="outline">
                            {s.start_second}s · {s.duration_seconds}s
                          </Badge>
                        </div>
                        {s.image?.external_url && (
                          <img
                            src={s.image.external_url}
                            alt={`Shot ${s.shot_number} reference frame`}
                            loading="lazy"
                            className="h-32 w-full rounded-sm object-cover"
                          />
                        )}
                        <p className="text-sm">{s.visual}</p>
                        <p className="text-muted-foreground">{s.prompt}</p>
                        <p className="text-muted-foreground">
                          {s.camera} · {s.lens} · {s.lighting} · {s.movement}
                        </p>
                        <p className="text-muted-foreground">
                          {s.audio_note} · {s.transition} · {s.workflow}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{s.status}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              run(() => regenShot({ data: { shotId: s.id } }), "Shot regenerated")
                            }
                          >
                            Regenerate shot
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {!storyboard.data?.shots?.length && (
                    <p className="text-xs text-muted-foreground">
                      اختر concept لبناء الـstoryboard.
                    </p>
                  )}
                </div>
              </Section>

              <Section title="Creative Gatekeeper">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      run(() => runReview({ data: { campaignId: campaign.id } }), "Review complete")
                    }
                  >
                    Run creative review
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(
                        () => approve({ data: { campaignId: campaign.id, approve: true } }),
                        "Approved",
                      )
                    }
                  >
                    Human approve
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      run(
                        () => approve({ data: { campaignId: campaign.id, approve: false } }),
                        "Sent back",
                      )
                    }
                  >
                    Request revision
                  </Button>
                </div>
                {review.data && (
                  <Card>
                    <CardContent className="space-y-2 pt-5 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge>{review.data.band}</Badge>
                        <span>Final {review.data.final_score}/100</span>
                        <span>AI artifact {review.data.ai_artifact_score}/100</span>
                        {review.data.human_approved_at && (
                          <Badge variant="outline">human approved</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
                        {Object.entries(review.data.breakdown ?? {})
                          .filter(([, v]) => typeof v === "number")
                          .map(([k, v]) => (
                            <p key={k} className="flex justify-between">
                              <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                              <span>{String(v)}</span>
                            </p>
                          ))}
                      </div>
                      {((review.data.hard_fail_reasons ?? []) as string[]).map((r: string) => (
                        <p key={r} className="text-destructive">
                          {r}
                        </p>
                      ))}
                      <p className="text-muted-foreground">{review.data.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </Section>

              {!!variants.data?.length && (
                <Section title="Ad variants">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {variants.data.map((v: any) => (
                      <Card key={v.id}>
                        <CardContent className="space-y-1 pt-5 text-xs">
                          <p className="font-serif text-base">{v.variant_key}</p>
                          <p className="text-muted-foreground">
                            {v.platform} · {v.aspect_ratio} · {v.duration_seconds}s
                          </p>
                          <p>{v.headline}</p>
                          <p className="text-muted-foreground">{v.primary_text}</p>
                          <p>{v.cta}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
