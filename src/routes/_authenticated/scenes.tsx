import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { productsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/scenes")({
  head: () => ({
    meta: [
      { title: "Scene Replacement — Steinheim" },
      {
        name: "description",
        content: "Replace products in luxury reference scenes with real Steinheim products.",
      },
    ],
  }),
  component: ScenesPage,
});

type Step = "upload" | "analyse" | "match" | "render" | "done";

interface DetectedProduct {
  category: string;
  description: string;
  position: { x: number; y: number; width: number; height: number };
  finish: string;
  confidence: number;
}

interface ProductMatch {
  detectedIndex: number;
  productId: string;
  productName: string;
  productImage: string;
  finish: string;
}

function ScenesPage() {
  const qc = useQueryClient();
  const products = useQuery(productsQuery);
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [sceneImage, setSceneImage] = useState<string | null>(null);
  const [sceneFile, setSceneFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<{
    scene_type: string;
    mood: string;
    detected_products: DetectedProduct[];
    surfaces: Array<{ type: string; color: string; reflectivity: string }>;
    lighting: { direction: string; temperature: string; intensity: string };
  } | null>(null);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [format, setFormat] = useState<"square" | "story" | "landscape">("square");

  const analyseMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const { data: funcData, error: funcError } = await supabase.functions.invoke("render-scene", {
        body: {
          scene_image_url: imageUrl,
          products: [],
          format,
        },
      });
      if (funcError) throw funcError;
      return funcData;
    },
    onSuccess: (data) => {
      if (data?.analysis) {
        setAnalysis(data.analysis);
        setStep("analyse");
      }
    },
    onError: (err) => {
      toast.error(`Analysis failed: ${err.message}`);
    },
  });

  const renderMutation = useMutation({
    mutationFn: async () => {
      if (!sceneImage || !analysis) throw new Error("No scene or analysis");

      const productList = matches.map((m) => {
        const product = products.data?.find((p: any) => p.id === m.productId);
        const images: string[] = Array.isArray(product?.images) ? product.images : [];
        return {
          detected_index: m.detectedIndex,
          product_image_url: images[0] || "",
          finish: m.finish,
          name: m.productName,
        };
      });

      const { data, error } = await supabase.functions.invoke("render-scene", {
        body: {
          scene_image_url: sceneImage,
          products: productList,
          format,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.image) {
        setResultImage(data.image);
        setStep("done");
        toast.success("Scene rendered successfully!");
      }
    },
    onError: (err) => {
      toast.error(`Render failed: ${err.message}`);
    },
  });

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSceneFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setSceneImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAnalyse = useCallback(() => {
    if (!sceneImage) return;
    analyseMutation.mutate(sceneImage);
  }, [sceneImage, analyseMutation]);

  const addMatch = useCallback(
    (detectedIndex: number) => {
      const detected = analysis?.detected_products[detectedIndex];
      if (!detected) return;
      setMatches((prev) => [
        ...prev,
        {
          detectedIndex,
          productId: "",
          productName: "",
          productImage: "",
          finish: detected.finish,
        },
      ]);
    },
    [analysis],
  );

  const updateMatch = useCallback(
    (index: number, field: keyof ProductMatch, value: string) => {
      setMatches((prev) => {
        const updated = [...prev];
        const existing = updated[index];
        if (!existing) return prev;
        updated[index] = { ...existing, [field]: value } as ProductMatch;

        // Auto-fill product details when productId changes
        if (field === "productId" && products.data) {
          const product = products.data.find((p: any) => p.id === value);
          if (product) {
            const images: string[] = Array.isArray(product.images) ? product.images : [];
            updated[index] = {
              ...updated[index],
              productName: product.name || "",
              productImage: images[0] || "",
            };
          }
        }

        return updated;
      });
    },
    [products.data],
  );

  const removeMatch = useCallback((index: number) => {
    setMatches((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Scene Replacement</h1>
        <p className="text-muted-foreground mt-1">
          Replace products in luxury reference scenes with real Steinheim products.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(["upload", "analyse", "match", "render", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <Badge variant={step === s ? "default" : "outline"}>
              {i + 1}. {s}
            </Badge>
            {i < 4 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Upload Reference Scene</h2>
            <p className="text-muted-foreground text-sm">
              Upload a luxury bathroom, villa, or showroom image. The AI will detect products that
              can be replaced with Steinheim products.
            </p>

            <div className="flex items-center gap-4">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />
              <Button onClick={() => fileInput.current?.click()} variant="outline">
                Choose Image
              </Button>

              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
                className="rounded border px-3 py-2"
              >
                <option value="square">Square (1080×1080)</option>
                <option value="story">Story (1080×1920)</option>
                <option value="landscape">Landscape (1350×1080)</option>
              </select>
            </div>

            {sceneImage && (
              <div className="space-y-4">
                <img
                  src={sceneImage}
                  alt="Reference scene"
                  className="max-h-96 rounded object-contain"
                />
                <Button onClick={handleAnalyse} disabled={analyseMutation.isPending}>
                  {analyseMutation.isPending ? "Analysing..." : "Analyse Scene"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Analysis results */}
      {step === "analyse" && analysis && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Scene Analysis</h2>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Type:</span> {analysis.scene_type}
              </div>
              <div>
                <span className="font-medium">Mood:</span> {analysis.mood}
              </div>
              <div>
                <span className="font-medium">Lighting:</span> {analysis.lighting.direction},{" "}
                {analysis.lighting.temperature}, {analysis.lighting.intensity}
              </div>
              <div>
                <span className="font-medium">Surfaces:</span>{" "}
                {analysis.surfaces.map((s) => s.type).join(", ")}
              </div>
            </div>

            <h3 className="font-medium">Detected Products</h3>
            {analysis.detected_products.length === 0 ? (
              <p className="text-muted-foreground text-sm">No products detected in this scene.</p>
            ) : (
              <div className="space-y-2">
                {analysis.detected_products.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded border p-3">
                    <div>
                      <span className="font-medium">{p.category}</span>{" "}
                      <span className="text-muted-foreground text-sm">
                        — {p.description} ({p.finish})
                      </span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {(p.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <Button size="sm" onClick={() => addMatch(i)}>
                      + Match Product
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {analysis.detected_products.length > 0 && (
              <Button onClick={() => setStep("match")} className="mt-4">
                Continue to Matching →
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Product matching */}
      {step === "match" && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Match Products</h2>
            <p className="text-muted-foreground text-sm">
              Select which Steinheim product replaces each detected product.
            </p>

            {matches.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                No products to match. Go back and add matches from the analysis.
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((match, i) => {
                  const detected = analysis?.detected_products[match.detectedIndex];
                  return (
                    <div key={i} className="space-y-2 rounded border p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {detected?.category}: {detected?.description}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => removeMatch(i)}>
                          Remove
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={match.productId}
                          onChange={(e) => updateMatch(i, "productId", e.target.value)}
                          className="rounded border px-3 py-2"
                        >
                          <option value="">Select product...</option>
                          {products.data?.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          value={match.finish}
                          onChange={(e) => updateMatch(i, "finish", e.target.value)}
                          placeholder="Finish"
                          className="rounded border px-3 py-2"
                        />

                        {match.productImage && (
                          <img
                            src={match.productImage}
                            alt={match.productName}
                            className="h-16 rounded object-contain"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("analyse")}>
                ← Back
              </Button>
              <Button
                onClick={() => {
                  setStep("render");
                  renderMutation.mutate();
                }}
                disabled={matches.length === 0 || renderMutation.isPending}
              >
                {renderMutation.isPending ? "Rendering..." : "Render Scene →"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Rendering */}
      {step === "render" && renderMutation.isPending && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-lg font-medium">Rendering scene...</div>
            <p className="text-muted-foreground mt-2 text-sm">
              Removing original products and inserting Steinheim products. This may take 30-60
              seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Done */}
      {step === "done" && resultImage && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Result</h2>
            <img src={resultImage} alt="Rendered scene" className="w-full rounded object-contain" />
            <div className="flex gap-2">
              <a href={resultImage} download className="rounded bg-blue-600 px-4 py-2 text-white">
                Download PNG
              </a>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setSceneImage(null);
                  setAnalysis(null);
                  setMatches([]);
                  setResultImage(null);
                }}
              >
                New Scene
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
