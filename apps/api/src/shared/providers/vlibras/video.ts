import { env } from "../../config/env";

/**
 * Prova de conceito VLibras — geração de VÍDEO do avatar.
 *
 * Verificado ao vivo em 2026-10-20 (docs oficiais + testes reais):
 *
 * 1. POST https://traducao2.vlibras.gov.br/video  (form: gloss=...)
 *    -> 401 {"error":"Unauthorized"}   ← exige credencial Conecta (OAuth)
 * 2. GET  https://traducao2.vlibras.gov.br/video/status/{id} -> 401 idem
 * 3. POST/GET https://www.gov.br/video (gateway do catálogo Conecta)
 *    -> 200, porém HTML de portal — não é utilizável como API sem credencial.
 *
 * Especificação oficial (swagger do catálogo):
 *   POST /video            (application/x-www-form-urlencoded, campo "gloss") -> { id }
 *   GET  /video/status/{id} -> { status, filename?, size? }
 *   GET  /video/{id}        -> arquivo de vídeo
 *
 * Portanto: com VLIBRAS_API_TOKEN configurado, usamos o serviço real;
 * sem token, retornamos "unavailable" e o APP reproduz a simulação local
 * (o contrato interno nunca mente: animationSource diz a origem real).
 */

export type VideoOutcome =
  | { kind: "ready"; videoId: string }
  | { kind: "unavailable"; reason: "no_token" | "unauthorized" | "upstream_error" | "timeout" };

const tokenHeaders = (): Record<string, string> =>
  env.VLIBRAS_API_TOKEN
    ? { Authorization: `Bearer ${env.VLIBRAS_API_TOKEN}`, "Content-Type": "application/json" }
    : {};

export async function requestVideo(
  gloss: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VideoOutcome> {
  if (!env.VLIBRAS_API_TOKEN) return { kind: "unavailable", reason: "no_token" };

  try {
    const res = await fetchImpl(`${env.VLIBRAS_VIDEO_BASE_URL}/video`, {
      method: "POST",
      headers: { ...tokenHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ gloss }),
      signal: AbortSignal.timeout(env.TRANSLATE_TIMEOUT_MS),
    });

    if (res.status === 401 || res.status === 403) {
      return { kind: "unavailable", reason: "unauthorized" };
    }
    if (!res.ok) return { kind: "unavailable", reason: "upstream_error" };

    const data = (await res.json()) as { id?: string };
    if (!data.id) return { kind: "unavailable", reason: "upstream_error" };
    return { kind: "ready", videoId: data.id };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { kind: "unavailable", reason: "timeout" };
    }
    return { kind: "unavailable", reason: "upstream_error" };
  }
}

/** Aguarda o status ficar pronto (polling controlado). */
export async function waitForVideo(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VideoOutcome> {
  if (!env.VLIBRAS_API_TOKEN) return { kind: "unavailable", reason: "no_token" };

  const deadline = Date.now() + env.VIDEO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(`${env.VLIBRAS_VIDEO_BASE_URL}/video/status/${videoId}`, {
        headers: tokenHeaders(),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 401 || res.status === 403) {
        return { kind: "unavailable", reason: "unauthorized" };
      }
      if (!res.ok) return { kind: "unavailable", reason: "upstream_error" };

      const data = (await res.json()) as { status?: string };
      if (data.status === "ready" || data.status === "processed") {
        return { kind: "ready", videoId };
      }
      if (data.status === "error" || data.status === "failed") {
        return { kind: "unavailable", reason: "upstream_error" };
      }
    } catch {
      return { kind: "unavailable", reason: "upstream_error" };
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return { kind: "unavailable", reason: "timeout" };
}

/** URL do arquivo de vídeo pronto (proxy local via GET /api/animations/:id). */
export const videoFileUrl = (videoId: string): string =>
  `${env.VLIBRAS_VIDEO_BASE_URL}/video/${videoId}`;

export const videoAuthHeaders = tokenHeaders;
