import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/automation/render-scene
 *
 * Takes a reference image URL and a list of product replacements,
 * then produces a composite image where the original products are
 * replaced with Steinheim products.
 *
 * Auth: x-automation-secret (same as other automation endpoints).
 */
const bodySchema = z.object({
  scene_image_url: z.string().url(),
  products: z.array(
    z.object({
      detected_index: z.number().min(0),
      product_image_url: z.string().url(),
      finish: z.string(),
      name: z.string(),
    }),
  ),
  format: z.enum(["square", "story", "landscape"]).default("square"),
});

const FORMATS = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1350, height: 1080 },
} as const;

export const Route = createFileRoute("/api/public/automation/render-scene")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "render-scene", async ({ body: parsedBody }) => {
          if (!parsedBody || typeof parsedBody !== "object")
            return json({ error: "Invalid JSON body" }, 400);

          const parsed = bodySchema.safeParse(parsedBody);
          if (!parsed.success) {
            return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
          }

          const { scene_image_url, products, format } = parsed.data;
          const { width, height } = FORMATS[format];

          const { analyzeScene } = await import("@/lib/creative/scene-analysis.server");
          const { removeProductsFromScene } = await import("@/lib/creative/scene-inpaint.server");
          const { compositeScene } = await import("@/lib/creative/scene-compose");

          try {
            const analysis = await analyzeScene(scene_image_url);

            const cleaned = await removeProductsFromScene(
              scene_image_url,
              analysis.detected_products,
            );

            const { SceneProduct } = {} as { SceneProduct: never };
            const sceneProducts: Array<{
              detected: (typeof analysis.detected_products)[number];
              imageUrl: string;
              finish: string;
              name: string;
            }> = [];
            for (const p of products) {
              const detected = analysis.detected_products[p.detected_index];
              if (!detected) continue;
              sceneProducts.push({
                detected,
                imageUrl: p.product_image_url,
                finish: p.finish,
                name: p.name,
              });
            }

            const result = await compositeScene({
              sceneImageUrl: cleaned.imageUrl,
              products: sceneProducts,
              surfaces: analysis.surfaces,
              lightingDirection: analysis.lighting.direction as never,
              width,
              height,
            });

            const base64 = result.png.toString("base64");
            const dataUrl = `data:image/png;base64,${base64}`;

            return json({
              ok: true,
              image: dataUrl,
              analysis: {
                scene_type: analysis.scene_type,
                mood: analysis.mood,
                detected_count: analysis.detected_products.length,
              },
              products_inserted: sceneProducts.length,
              warnings: [...cleaned.warnings, ...result.warnings],
            });
          } catch (error) {
            console.error("[render-scene] failed", error);
            return json(
              { error: error instanceof Error ? error.message : "Scene rendering failed" },
              500,
            );
          }
        });
      },
    },
  },
});
