import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { catalogSourceStatus, syncSteinheimCatalog } from "@/lib/catalog.functions";
import { categoriesQuery, productsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — Steinheim" },
      {
        name: "description",
        content: "The Steinheim product catalogue that feeds every AI-written post.",
      },
      { property: "og:title", content: "Products — Steinheim" },
      {
        property: "og:description",
        content: "The Steinheim product catalogue that feeds every AI-written post.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const products = useQuery(productsQuery);
  const categories = useQuery(categoriesQuery);

  const source = useQuery({
    queryKey: ["catalog-source"],
    queryFn: () => catalogSourceStatus(),
  });

  // The sync opens one page per product, so it is slow by nature. The button
  // stays disabled for the whole run rather than letting a second click start
  // a competing pass over the same catalogue.
  const sync = useMutation({
    mutationFn: () => syncSteinheimCatalog(),
    onSuccess: (r) => {
      const parts = [
        `${r.scanned} ${lang === "ar" ? "منتج" : "products"}`,
        `+${r.created}`,
        `~${r.updated}`,
        `=${r.unchanged}`,
      ];
      if (r.archived) parts.push(`${lang === "ar" ? "مؤرشف" : "archived"} ${r.archived}`);
      toast.success(lang === "ar" ? "تمت مزامنة الكتالوج" : "Catalogue synced", {
        description: `${parts.join(" · ")} — ${r.claimsWritten} claims`,
      });
      if (r.failed.length) {
        toast.warning(
          lang === "ar" ? `${r.failed.length} منتج لم يُقرأ` : `${r.failed.length} products failed`,
          { description: r.failed.slice(0, 3).join(" · ") },
        );
      }
      void qc.invalidateQueries({ queryKey: ["products"] });
      void source.refetch();
    },
    onError: (e) =>
      toast.error(lang === "ar" ? "فشلت المزامنة" : "Sync failed", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        name,
        name_ar: nameAr || null,
        category_id: categoryId || null,
        description: description || null,
        features: features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(lang === "ar" ? "تمت الإضافة" : "Product added");
      setName("");
      setNameAr("");
      setDescription("");
      setFeatures("");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{t("products")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("catalogueSub")}</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending
              ? lang === "ar"
                ? "جارٍ قراءة الموقع الرسمي…"
                : "Reading the official site…"
              : lang === "ar"
                ? "مزامنة كتالوج Steinheim"
                : "Sync Steinheim Catalog"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {source.data?.lastSyncAt
              ? `${lang === "ar" ? "آخر مزامنة" : "Last synced"} ${new Date(source.data.lastSyncAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB")}`
              : lang === "ar"
                ? "لم تتم أي مزامنة بعد"
                : "Never synced"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {products.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {products.data?.map((product) => (
            <Card key={product.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {lang === "ar" ? (product.name_ar ?? product.name) : product.name}
                  </p>
                  {product.categories && (
                    <Badge variant="outline">
                      {lang === "ar"
                        ? (product.categories.name_ar ?? product.categories.name)
                        : product.categories.name}
                    </Badge>
                  )}
                </div>
                {product.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
                )}
                {product.features?.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {product.features.map((f: string) => (
                      <li key={f} className="rounded-sm bg-secondary px-2 py-1 text-xs">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <p className="font-serif text-lg">{t("addProduct")}</p>
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("nameAr")}</Label>
              <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("category")}</Label>
              <select
                className="h-9 w-full rounded-sm border border-input bg-background px-3 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">—</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("keyFeatures")}</Label>
              <Textarea rows={4} value={features} onChange={(e) => setFeatures(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={!name || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("save")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
