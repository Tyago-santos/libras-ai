import { env } from "../../../shared/config/env";
import { AppError } from "../../../shared/lib/errors";

/**
 * Transcrição de frase completa (áudio gravado no app → prosa pt-BR).
 *
 * O app grava com MediaRecorder, corta na pausa natural e envia a frase
 * inteira aqui — em vez da Web Speech API do navegador, que é imprevisível
 * (conflito de microfone no Android/Chromium #41083534, bug de `network`
 * no Chrome desktop e sem suporte no Firefox).
 *
 * Economia de cota (mesma política do llm.ts):
 *  - thinkingBudget:0 (sem tokens de raciocínio);
 *  - rotação de chaves em 429/RESOURCE_EXHAUSTED (GEMINI_API_KEY + FALLBACKS).
 *
 * O texto sai como prosa corrida: pontuação e caixa — a IA transcreve e
 * normaliza a fala falada em texto escrito, sem simulação.
 */

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const PROMPT = [
  "Você é o transcritor de voz de um aplicativo de tradução para Libras.",
  "Transcreva APENAS fala humana em português do Brasil, em prosa corrida:",
  "- pontuação correta e primeira letra maiúscula em cada frase;",
  "- sem preenchimentos (é, ah, tipo), sem repetições, sem emojis;",
  "- não traduza, não resuma, não comente, não explique.",
  "Se o áudio for silêncio, ruído, tom puro, música ou fala ininteligível,",
  "responda exatamente: VAZIO — nunca invente palavras que não foram faladas.",
  "Responda SOMENTE com o texto transcrito (ou VAZIO).",
].join("\n");

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  error?: { message?: string };
}

/** Chaves em rotação — principal primeiro, fallbacks em erro de cota. */
function geminiKeys(): string[] {
  const all = `${env.GEMINI_API_KEY},${env.GEMINI_API_KEY_FALLBACKS}`
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(all)];
}

function isQuotaError(status: number, bodyText: string): boolean {
  return status === 429 || bodyText.includes("RESOURCE_EXHAUSTED");
}

export interface PhraseInput {
  audioBase64: string;
  mimeType?: string;
  durationMs?: number;
}

/** Transcreve uma frase de áudio. Sem chave → PROVIDER_ERROR honesto. */
export async function transcribePhrase(input: PhraseInput): Promise<string> {
  const keys = geminiKeys();
  if (keys.length === 0) {
    throw new AppError("PROVIDER_ERROR", "GEMINI_API_KEY não configurada para transcrição");
  }

  let lastError: AppError | null = null;

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!key) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(ENDPOINT(env.GEMINI_MODEL, key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: input.mimeType ?? "audio/wav",
                    data: input.audioBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            // Gemini 2.5: sem thinking — transcrição é tarefa curta (menos cota).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        // Ignora partes de raciocínio (thought) — só a resposta final vale.
        const raw = parts
          .filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("");
        return normalizeTranscript(raw);
      }

      const bodyText = await res.text();
      lastError = new AppError("PROVIDER_ERROR", `Gemini respondeu ${res.status}`, {
        upstreamStatus: res.status,
        quota: isQuotaError(res.status, bodyText),
      });

      // Cota esgotada → tenta a próxima chave; outros erros valem pra todas.
      if (!isQuotaError(res.status, bodyText)) throw lastError;
      if (i === keys.length - 1) {
        throw new AppError(
          "PROVIDER_ERROR",
          "Cota esgotada em todas as chaves Gemini (transcrição indisponível)",
          { triedKeys: keys.length },
        );
      }
    } catch (err) {
      if (err instanceof AppError) {
        if (!err.details || !(err.details as { quota?: boolean }).quota) throw err;
        lastError = err; // cota → próxima iteração da rotação
      } else if (err instanceof Error && err.name === "AbortError") {
        throw new AppError("PROVIDER_TIMEOUT", "Timeout na transcrição com Gemini");
      } else {
        throw new AppError(
          "PROVIDER_ERROR",
          `Falha ao chamar Gemini: ${err instanceof Error ? err.message : "erro desconhecido"}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new AppError("PROVIDER_ERROR", "Transcrição indisponível");
}

/** Limpa a resposta do modelo (markdown/aspas) e trata o marcador VAZIO. */
export function normalizeTranscript(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!text || /^vazio\.?$/i.test(text)) return "";
  return text;
}
