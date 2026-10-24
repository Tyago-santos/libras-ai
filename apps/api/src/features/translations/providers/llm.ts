import { env } from "../../../shared/config/env";
import { AppError } from "../../../shared/lib/errors";

/**
 * Provider de tradução PT → glosa por IA (Gemini).
 *
 * Usado como FALLBACK quando a API oficial do VLibras está indisponível
 * (ex.: "Translation Core Unavailable" — observado ao vivo em 2026-10-22).
 *
 * Economia de cota (uso responsável das chaves):
 *  - thinkingBudget:0 (sem tokens de raciocínio);
 *  - cache por texto (replay/novas sessões não gastam cota);
 *  - rotação de chaves em 429/RESOURCE_EXHAUSTED (GEMINI_API_KEY + FALLBACKS).
 *
 * A glosa gerada pela IA é SEMPRE validada no dicionário oficial antes de
 * chegar ao app: tokens sem sinal vão para `unsupportedTokens` (§16 —
 * nunca simular sinalização). A IA propõe; o dicionário decide.
 */

export interface LlmTranslateResult {
  gloss: string;
  durationMs: number;
}

export type LlmTranslateFn = (text: string) => Promise<LlmTranslateResult>;

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const SYSTEM_PROMPT = [
  "Você traduz português do Brasil para GLOSA de Libras no formato do dicionário VLibras.",
  "Regras de saída:",
  "- Retorne SOMENTE a glosa final: sem aspas, sem comentários, sem explicação, sem markdown, sem pensamentos ou raciocínio.",
  "- Tokens em MAIÚSCULAS separados por espaço; palavras compostas com underscore (ex.: BOM_DIA, TUDO_BEM).",
  "- Mantenha os acentos do português (ex.: ESTAÇÃO, VOCÊ, NÃO).",
  "- Perguntas terminam com o marcador [INTERROGAÇÃO]; negações com [NEGACÃO].",
  "- Marcador [INTERROGAÇÃO] SOMENTE em perguntas verdadeiras; declarações e pedidos NÃO levam marcador.",
  "- Use apenas letras A-Z (com acentos), underscore e colchetes.",
  "Exemplos:",
  '"Bom dia, tudo bem?" -> BOM_DIA TUDO_BEM [INTERROGAÇÃO]',
  '"Bom dia." -> BOM_DIA',
  '"Não, obrigado." -> OBRIGADO [NEGACÃO]',
  '"Tchau." -> TCHAU',
].join("\n");

// --- Cache de glosas (evita chamadas repetidas à API) -----------------------
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 100;
const glossCache = new Map<string, { gloss: string; at: number }>();

/** Para os testes. */
export function clearLlmCache(): void {
  glossCache.clear();
}

function cacheKey(text: string): string {
  return text.trim().toLowerCase();
}

function cacheGet(text: string): string | null {
  const hit = glossCache.get(cacheKey(text));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    glossCache.delete(cacheKey(text));
    return null;
  }
  return hit.gloss;
}

function cacheSet(text: string, gloss: string): void {
  if (glossCache.size >= CACHE_MAX) {
    const oldest = glossCache.keys().next().value;
    if (oldest !== undefined) glossCache.delete(oldest);
  }
  glossCache.set(cacheKey(text), { gloss, at: Date.now() });
}

// --- Chaves (rotação quando alguma esgota cota) -----------------------------
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

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  error?: { message?: string };
}

/**
 * Traduz texto para glosa com o Gemini (REST generateContent).
 * Sem chave configurada → PROVIDER_ERROR (a rota decide se propaga).
 */
export async function llmTranslateToGloss(
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmTranslateResult> {
  const keys = geminiKeys();
  if (keys.length === 0) {
    throw new AppError("PROVIDER_ERROR", "GEMINI_API_KEY não configurada para tradução por IA");
  }

  const cached = cacheGet(text);
  if (cached) return { gloss: cached, durationMs: 0 };

  const started = Date.now();
  let lastError: AppError | null = null;

  // Rotação: chave principal → fallbacks (só em erro de cota).
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!key) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.TRANSLATE_TIMEOUT_MS);

    try {
      const res = await fetchImpl(ENDPOINT(env.GEMINI_MODEL, key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `Texto em português: ${text}` }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: 0.1,
            // Gemini 2.5: desliga o thinking — glosa é tarefa curta
            // (latência ~6s → ~1,5s e menos tokens de raciocínio gastos).
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
        const gloss = normalizeLlmGloss(raw);

        if (!gloss) {
          throw new AppError("PROVIDER_ERROR", "Gemini retornou glosa vazia");
        }

        cacheSet(text, gloss);
        return { gloss, durationMs: Date.now() - started };
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
          "Cota esgotada em todas as chaves Gemini (tradução por IA indisponível)",
          { triedKeys: keys.length },
        );
      }
    } catch (err) {
      if (err instanceof AppError) {
        if (!err.details || !(err.details as { quota?: boolean }).quota) throw err;
        lastError = err; // cota → próxima iteração da rotação
      } else if (err instanceof Error && err.name === "AbortError") {
        throw new AppError("PROVIDER_TIMEOUT", "Timeout na tradução com Gemini");
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

  throw lastError ?? new AppError("PROVIDER_ERROR", "Tradução por IA indisponível");
}

/** Limpa a resposta do modelo (aspas, markdown, prefixos tipo "Glosa:"). */
export function normalizeLlmGloss(raw: string): string {
  let text = raw.trim();
  // Remove cercas de código e aspas externas.
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  text = text.replace(/^["'`]+|["'`]+$/g, "");
  // Descarta rótulos tipo "Glosa:" antes da resposta.
  text = text.replace(/^(glosa|tradução|translation)\s*:\s*/i, "");
  // Mantém apenas a primeira linha (uma glosa).
  text = text.split("\n")[0] ?? "";
  return text.replace(/\s+/g, " ").trim();
}
