import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { MockSpeechProvider } from "./mock";
import type { SpeechInput, SpeechOutput, SpeechProvider } from "./types";

/**
 * Provider real de transcrição via API Gemini (googleapis).
 *
 * Recebe um chunk de áudio (base64), devolve transcrição parcial em pt-BR.
 * O streaming contínuo com Gemini Live é o próximo passo (§15.4 da spec);
 * este provider já entrega o contrato parcial/final exigido pelo
 * gerenciador de frases.
 */

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const PROMPT =
  "Transcreva o áudio para português do Brasil. Retorne SOMENTE JSON no formato " +
  '{"text": "<transcrição>", "final": <true|false>} — final=true apenas se a fala terminar com pontuação ou pausa longa natural. Não traduza, não resuma, não adicione comentários.';

export class GeminiSpeechProvider implements SpeechProvider {
  readonly name = "gemini";
  private readonly fallback = new MockSpeechProvider();

  async transcribe(input: SpeechInput): Promise<SpeechOutput> {
    if (input.isSilence || !input.audioBase64) {
      return { partialText: "", final: false };
    }
    if (!env.GEMINI_API_KEY) {
      if (env.SPEECH_FALLBACK_MOCK) return this.fallback.transcribe(input);
      throw new AppError("PROVIDER_ERROR", "GEMINI_API_KEY não configurada");
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(ENDPOINT(env.GEMINI_MODEL, env.GEMINI_API_KEY), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT },
                  {
                    inline_data: {
                      mime_type: input.mimeType ?? "audio/webm",
                      data: input.audioBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json", temperature: 0 },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (env.SPEECH_FALLBACK_MOCK) return this.fallback.transcribe(input);
          throw new AppError("PROVIDER_ERROR", `Gemini respondeu ${res.status}`);
        }

        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return parseGeminiOutput(text);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        if (env.SPEECH_FALLBACK_MOCK) return this.fallback.transcribe(input);
        throw new AppError("PROVIDER_TIMEOUT", "Timeout na transcrição Gemini");
      }
      if (env.SPEECH_FALLBACK_MOCK) return this.fallback.transcribe(input);
      throw new AppError(
        "PROVIDER_ERROR",
        `Falha na transcrição: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }
}

/** Aceita JSON puro ou JSON embutido em markdown. */
export function parseGeminiOutput(raw: string): SpeechOutput {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { partialText: raw.trim(), final: false };
  try {
    const parsed = JSON.parse(match[0]) as { text?: string; final?: boolean };
    return { partialText: (parsed.text ?? "").trim(), final: parsed.final === true };
  } catch {
    return { partialText: raw.trim(), final: false };
  }
}
