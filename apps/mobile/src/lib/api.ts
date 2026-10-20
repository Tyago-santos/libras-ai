/**
 * Cliente HTTP mínimo do app (§8: validação no backend, sem chaves no app).
 */
import { api, REQUEST_TIMEOUT_MS } from "./config";

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(api.url(path), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : undefined;

    if (!res.ok) {
      const err = (body as ApiErrorBody | undefined)?.error;
      throw new ApiClientError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `HTTP ${res.status}`);
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiClientError(504, "TIMEOUT", "O serviço demorou para responder");
    }
    throw new ApiClientError(0, "NETWORK_ERROR", "Não foi possível conectar ao serviço");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Tipos espelhados de @libras-ai/contracts (o app não importa o pacote para
// manter o bundle Expo independente; os schemas Zod do backend validam tudo).
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  state: "active" | "ended";
  createdAt: string;
  config: { silenceMs: number; maxUtteranceChars: number; maxQueueSize: number; locale: string };
}

export type TranslationStatus = "pending" | "processing" | "ready" | "unsupported" | "failed";

export interface TranslationResult {
  id: string;
  sessionId: string;
  sequence: number;
  originalText: string;
  status: TranslationStatus;
  gloss?: string;
  animationUrl?: string;
  animationSource?: "vlibras-video" | "simulation" | "none";
  unsupportedTokens?: string[];
  errorCode?: string;
  latency?: { queueWaitMs?: number; processingMs?: number; totalMs?: number };
}

export interface TranscriptionResponse {
  partialText?: string;
  confirmedUtterance?: { id: string; sessionId: string; sequence: number; text: string; confirmedAt: string };
}

export interface SessionMetrics {
  sessionId: string;
  utterancesConfirmed: number;
  translationsTotal: number;
  translationsFailed: number;
  translationsUnsupported: number;
  pendingTranslations: number;
  latency: {
    samples: number;
    medianTotalMs?: number;
    p95TotalMs?: number;
    medianProcessingMs?: number;
    p95ProcessingMs?: number;
  };
}

// ---------------------------------------------------------------------------
// Endpoints (§8)
// ---------------------------------------------------------------------------

export const backend = {
  health: () =>
    request<{ ok: boolean; speechProvider: string; dictionaryLoaded: boolean; videoEnabled: boolean }>(
      "/api/health",
    ),

  createSession: (label?: string, config?: { silenceMs?: number; maxQueueSize?: number }) =>
    request<SessionInfo>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ label, config }),
    }),

  endSession: (sessionId: string) =>
    request<{ ok: boolean; cancelled: number }>(`/api/sessions/${sessionId}`, { method: "DELETE" }),

  sendChunk: (payload: {
    sessionId: string;
    sequence: number;
    audioBase64?: string;
    mimeType?: string;
    durationMs?: number;
    isSilence?: boolean;
  }) =>
    request<TranscriptionResponse>("/api/transcriptions/chunks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  sendText: (sessionId: string, text: string) =>
    request<TranscriptionResponse>("/api/utterances/text", {
      method: "POST",
      body: JSON.stringify({ sessionId, text }),
    }),

  createTranslation: (sessionId: string, sequence: number, text: string) =>
    request<TranslationResult>("/api/translations", {
      method: "POST",
      body: JSON.stringify({ sessionId, sequence, text }),
    }),

  getTranslation: (id: string) => request<TranslationResult>(`/api/translations/${id}`),

  listTranslations: (sessionId: string) =>
    request<{ items: TranslationResult[]; pending: number; overloaded: boolean }>(
      `/api/sessions/${sessionId}/translations`,
    ),

  metrics: (sessionId: string) => request<SessionMetrics>(`/api/sessions/${sessionId}/metrics`),
};
