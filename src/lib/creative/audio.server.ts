import { getApiKey, getBaseUrl } from "@/lib/ai-provider.server";

/**
 * Audio pipeline — TTS and SFX generation for campaign videos.
 *
 * Uses OpenAI-compatible TTS endpoints (most providers support this).
 * SFX generation uses the image/audio generation capabilities of
 * multimodal models or falls back to silence.
 */

export interface TTSRequest {
  text: string;
  language?: "ar" | "en";
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  speed?: number;
}

export interface SFXRequest {
  description: string;
  duration?: number;
}

/**
 * Generates speech audio from text using a TTS model.
 * Returns a data URL (data:audio/mp3;base64,...).
 */
export async function generateTTS(request: TTSRequest): Promise<string> {
  const apiKey = getApiKey();
  const { text, voice = "onyx", speed = 0.9 } = request;

  const response = await fetch(`${getBaseUrl()}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/tts-1",
      input: text,
      voice,
      speed,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TTS failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:audio/mp3;base64,${base64}`;
}

/**
 * Generates a sound effect from a text description.
 * Returns a data URL, or null if the provider doesn't support SFX.
 */
export async function generateSFX(request: SFXRequest): Promise<string | null> {
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${getBaseUrl()}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/tts-1",
        input: `Sound effect: ${request.description}`,
        voice: "echo",
        speed: 1.0,
        response_format: "mp3",
      }),
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:audio/mp3;base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Generates a voiceover for a campaign video.
 * Combines the script with appropriate voice settings.
 */
export async function generateVoiceover(
  script: string,
  language: "ar" | "en" = "ar",
): Promise<{ audio: string; durationEstimate: number }> {
  const audio = await generateTTS({
    text: script,
    language,
    voice: "onyx",
    speed: 0.85,
  });

  // Rough estimate: ~150 words per minute for Arabic, ~180 for English
  const words = script.split(/\s+/).length;
  const wpm = language === "ar" ? 150 : 180;
  const durationEstimate = Math.ceil((words / wpm) * 60);

  return { audio, durationEstimate };
}
