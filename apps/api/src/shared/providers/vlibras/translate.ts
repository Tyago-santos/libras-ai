import { env } from "../../config/env";
import { AppError } from "../../lib/errors";

/**
 * Prova de conceito VLibras — tradução real de português para glosa.
 *
 * Verificado ao vivo em 2026-10-20:
 *   POST https://traducao2.vlibras.gov.br/translate
 *   Content-Type: application/json
 *   body: {"text": "Bom dia, tudo bem?"}
 *   -> 200, content-type text/plain
 *   -> "BOM_DIA TUDO_BEM [INTERROGAÇÃO]"
 *
 * Observação: o mesmo host com GET/params retorna 400 — somente POST JSON funciona.
 * A alternativa do catálogo Conecta (https://www.gov.br/translate?text=...) retorna
 * 400 BadRequest no gateway; a URL acima é a usada pelo player oficial (código-fonte
 * spbgovbr-vlibras/vlibras-web-browsers, src/core/config/index.ts).
 */

export interface TranslateResult {
  gloss: string;
  durationMs: number;
}

export type TranslateFn = (text: string) => Promise<TranslateResult>;

export async function translateToGloss(
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TranslateResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.TRANSLATE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(env.VLIBRAS_TRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AppError("PROVIDER_ERROR", `VLibras translate respondeu ${response.status}`, {
        upstreamStatus: response.status,
      });
    }

    const raw = (await response.text()).trim();
    const gloss = normalizeGloss(raw);

    if (!gloss) {
      throw new AppError("PROVIDER_ERROR", "VLibras retornou glosa vazia");
    }

    return { gloss, durationMs: Date.now() - started };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError("PROVIDER_TIMEOUT", "Timeout na tradução VLibras");
    }
    throw new AppError(
      "PROVIDER_ERROR",
      `Falha ao chamar VLibras: ${err instanceof Error ? err.message : "erro desconhecido"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A API pode devolver texto puro ou JSON {"traducao": "..."} (o player oficial
 * aceita os dois formatos). Normalizamos para a glosa em texto.
 */
export function normalizeGloss(raw: string): string {
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { traducao?: string; translation?: string };
      const gloss = parsed.traducao ?? parsed.translation ?? "";
      return gloss.trim();
    } catch {
      return raw.trim();
    }
  }
  return raw.replace(/\s+/g, " ").trim();
}
