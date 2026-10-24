import { z } from "zod";

/**
 * Contratos internos compartilhados entre o app mobile e o backend.
 *
 * IMPORTANTE: estes tipos pertencem ao aplicativo. Eles NÃO representam o
 * formato oficial de resposta da API do VLibras. O backend converte as
 * respostas reais do serviço para este formato estável.
 *
 * Verificado na prova de conceito (20-10-2026):
 * - Tradução (glosa): POST https://traducao2.vlibras.gov.br/translate {"text"}
 *   -> 200 text/plain com a glosa (ex.: "BOM_DIA TUDO_BEM [INTERROGAÇÃO]").
 * - Geração de vídeo: POST /video -> 401 sem credencial Conecta (OAuth).
 */

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export const sessionStateSchema = z.enum([
  "active",
  "ended",
]);
export type SessionState = z.infer<typeof sessionStateSchema>;

/** Configuração ajustável por sessão (regras iniciais da spec, §5). */
export const sessionConfigSchema = z.object({
  /** Duração mínima de silêncio para considerar fim de trecho. Inicial: 500ms. */
  silenceMs: z.number().int().min(200).max(3000).default(500),
  /** Tamanho máximo de caracteres de um trecho confirmado. */
  maxUtteranceChars: z.number().int().min(40).max(600).default(220),
  /** Limite de tarefas pendentes na fila de tradução (controle de atraso, §6.3). */
  maxQueueSize: z.number().int().min(2).max(50).default(10),
  /** Idioma da transcrição. */
  locale: z.string().min(2).max(10).default("pt-BR"),
});
export type SessionConfig = z.infer<typeof sessionConfigSchema>;

export const createSessionRequestSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  /** Overrides parciais; campos ausentes recebem os defaults (§5). */
  config: sessionConfigSchema.default({}),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  state: sessionStateSchema,
  createdAt: z.string().datetime(),
  config: sessionConfigSchema,
  stats: z.object({
    utterances: z.number().int().nonnegative(),
    translations: z.number().int().nonnegative(),
    pendingTranslations: z.number().int().nonnegative(),
  }),
});
export type Session = z.infer<typeof sessionSchema>;

// ---------------------------------------------------------------------------
// Tradução
// ---------------------------------------------------------------------------

export const translationStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "unsupported",
  "failed",
]);
export type TranslationStatus = z.infer<typeof translationStatusSchema>;

export const translationRequestSchema = z.object({
  sessionId: z.string().min(1),
  sequence: z.number().int().positive(),
  text: z.string().min(1).max(600),
});
export type TranslationRequest = z.infer<typeof translationRequestSchema>;

export const latencySchema = z.object({
  /** Espera na fila de tradução. */
  queueWaitMs: z.number().nonnegative().optional(),
  /** Duração do processamento (chamada ao VLibras). */
  processingMs: z.number().nonnegative().optional(),
  /** Total desde a confirmação do trecho até o resultado pronto. */
  totalMs: z.number().nonnegative().optional(),
});
export type Latency = z.infer<typeof latencySchema>;

export const translationResultSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sequence: z.number().int().positive(),
  originalText: z.string(),
  status: translationStatusSchema,
  /** Glosa retornada pela API real do VLibras (quando a tradução funcionou). */
  gloss: z.string().optional(),
  /** URL para reproduzir a animação (vídeo real do VLibras, quando disponível). */
  animationUrl: z.string().optional(),
  animationData: z.unknown().optional(),
  /** Origem da animação: vídeo oficial do VLibras ou simulação local do app. */
  animationSource: z.enum(["vlibras-video", "simulation", "none"]).optional(),
  /** Origem da glosa: API oficial do VLibras ou IA (Gemini) quando a oficial cai. */
  translationSource: z.enum(["vlibras", "llm"]).optional(),
  /** Tokens da glosa sem sinal correspondente no dicionário oficial. */
  unsupportedTokens: z.array(z.string()).optional(),
  errorCode: z.string().optional(),
  latency: latencySchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TranslationResult = z.infer<typeof translationResultSchema>;

/** POST /api/translations/live — tradução síncrona para o fluxo em tempo real. */
export const translationLiveRequestSchema = z.object({
  text: z.string().min(1).max(500),
});
export type TranslationLiveRequest = z.infer<typeof translationLiveRequestSchema>;

export const translationLiveResultSchema = z.object({
  /** Glosa pronta para o player Unity (tokens + marcadores gramaticais). */
  gloss: z.string(),
  /** Quem gerou a glosa: oficial do VLibras ou IA (fallback quando ela cai). */
  source: z.enum(["vlibras", "llm"]),
  /** "unsupported" quando nenhum token não-marcador existe no dicionário. */
  status: z.enum(["ready", "unsupported"]),
  /** Tokens da glosa sem sinal no dicionário oficial (§16: nunca simular). */
  unsupportedTokens: z.array(z.string()).optional(),
  /** Latência total desta chamada (chamada de tradução incluída). */
  durationMs: z.number().int().nonnegative(),
});
export type TranslationLiveResult = z.infer<typeof translationLiveResultSchema>;

// ---------------------------------------------------------------------------
// Transcrição / utterances
// ---------------------------------------------------------------------------

export const transcriptionChunkRequestSchema = z.object({
  sessionId: z.string().min(1),
  /** Sequência do chunk dentro da sessão. */
  sequence: z.number().int().nonnegative(),
  /** Áudio em base64 (usado pelo provider de transcrição em nuvem). */
  audioBase64: z.string().max(4_000_000).optional(),
  mimeType: z.enum(["audio/webm", "audio/m4a", "audio/wav", "audio/mp4"]).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  /** Marcador de silêncio (VAD local no app). */
  isSilence: z.boolean().optional(),
});
export type TranscriptionChunkRequest = z.infer<typeof transcriptionChunkRequestSchema>;

export const utteranceSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sequence: z.number().int().positive(),
  text: z.string(),
  confirmedAt: z.string().datetime(),
});
export type Utterance = z.infer<typeof utteranceSchema>;

export const transcriptionResponseSchema = z.object({
  /** Texto parcial montado até agora (não enviar para tradução, §5). */
  partialText: z.string().optional(),
  /** Trecho confirmado (pausa natural ou frase concluída) — entra na fila de tradução. */
  confirmedUtterance: utteranceSchema.optional(),
});
export type TranscriptionResponse = z.infer<typeof transcriptionResponseSchema>;

/** Entrada de texto manual (modo alternativo do app, ex. testes sem microfone). */
export const textInputRequestSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1).max(600),
});
export type TextInputRequest = z.infer<typeof textInputRequestSchema>;

// ---------------------------------------------------------------------------
// Métricas (§12)
// ---------------------------------------------------------------------------

export const sessionMetricsSchema = z.object({
  sessionId: z.string(),
  utterancesConfirmed: z.number().int().nonnegative(),
  translationsTotal: z.number().int().nonnegative(),
  translationsFailed: z.number().int().nonnegative(),
  translationsUnsupported: z.number().int().nonnegative(),
  pendingTranslations: z.number().int().nonnegative(),
  latency: z.object({
    samples: z.number().int().nonnegative(),
    medianTotalMs: z.number().nonnegative().optional(),
    p95TotalMs: z.number().nonnegative().optional(),
    medianProcessingMs: z.number().nonnegative().optional(),
    p95ProcessingMs: z.number().nonnegative().optional(),
  }),
});
export type SessionMetrics = z.infer<typeof sessionMetricsSchema>;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
