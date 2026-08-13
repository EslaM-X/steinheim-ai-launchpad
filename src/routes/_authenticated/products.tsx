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
import { categoriesQuery, productsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — Steinheim AI Marketing" },
      { name: "description", content: "The Steinheim product catalogue that feeds every AI-written post." },
      { property: "og:title", content: "Products — Steinheim AI Marketing" },
      { property: "og:description", content: "The Steinheim product catalogue that feeds every AI-written post." },
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
        key_features: features.split("\n").map((f) => f.trim()).filter(Boolean),
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
      <div>
        <h1 className="font-serif text-3xl">{t("products")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("catalogueSub")}</p>
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
                {product.key_features?.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {product.key_features.map((f: string) => (
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
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("keyFeatures")}</Label>
              <Textarea rows={4} value={features} onChange={(e) => setFeatures(e.target.value)} />
            </div>
            <Button className="w-full" disabled={!name || create.isPending} onClick={() => create.mutate()}>
              {t("save")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
