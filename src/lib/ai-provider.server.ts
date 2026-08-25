import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * LLM provider for every agent in the system.
 *
 * Any OpenAI-compatible endpoint works — base URL, key and models all come from
 * the environment, so changing provider is a deployment change, never a code
 * change. Request shapes below are unchanged from what the agents already send.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getApiKey() {
  return required("AI_API_KEY");
}

/** e.g. https://openrouter.ai/api/v1 — no trailing slash. */
export function getBaseUrl() {
  return required("AI_BASE_URL").replace(/\/+$/, "");
}

export function createAiProvider(apiKey: string, options?: { structuredOutputs?: boolean }) {
  return createOpenAICompatible({
    name: "steinheim-ai",
    baseURL: getBaseUrl(),
    apiKey,
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
  });
}

/**
 * Generates an image and returns a data URL.
 *
 * Uses the multi-modal `chat/completions` form (`modalities: ["image", "text"]`)
 * rather than `images/generations`, because that is what the current image model
 * expects. A provider that only speaks `images/generations` needs this function
 * adapted — everything else in the pipeline is provider-agnostic.
 */
export async function generateImage(apiKey: string, prompt: string) {
  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env["AI_IMAGE_MODEL"] ?? "google/gemini-3.1-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("The model returned no image.");
  return url;
}

/**
 * Edits an image using a vision+image model (e.g. Gemini 3.1 Flash Image).
 * Sends a source image alongside a text instruction; returns the edited image
 * as a data URL.
 */
export async function editImage(
  apiKey: string,
  sourceImageUrl: string,
  instruction: string,
): Promise<string> {
  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env["AI_IMAGE_MODEL"] ?? "google/gemini-3.1-flash-image",
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: sourceImageUrl } },
            { type: "text", text: instruction },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image editing failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("The model returned no edited image.");
  return url;
}
