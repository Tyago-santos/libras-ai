import { create } from "zustand";
import {
  ApiClientError,
  backend,
  type SessionInfo,
  type SessionMetrics,
  type TranscriptionResponse,
  type TranslationResult,
} from "../../lib/api";
import { speechController } from "../speech/controller";
import { getMicPermission, type MicPermission } from "../speech/permissions";
import type { SpeechChunkPayload } from "../speech/useSpeechStream";

/**
 * Store da sessão de tradução (§4 + §10 — estados visuais).
 *
 * Responsabilidades:
 * - máquina de estados: inactive → listening → transcribing →
 *   awaiting-translation → translating → signing (+ delayed/error/ended);
 * - orquestrar captura → confirmação de trecho → fila de tradução;
 * - fila de animação: ordem por sequência, sem sobreposição (§6.2);
 * - medir latência fala→animação (§12) e histórico em memória (§11).
 */

export type ViewPhase =
  | "inactive"
  | "listening"
  | "transcribing"
  | "awaiting-translation"
  | "translating"
  | "signing"
  | "delayed"
  | "error"
  | "ended";

export type UtteranceStatus = "translating" | "ready" | "signing" | "done" | "unsupported" | "failed";

export interface UtteranceItem {
  id: string;
  sequence: number;
  text: string;
  confirmedAt: number;
  status: UtteranceStatus;
  translationId?: string;
  gloss?: string;
  animationUrl?: string;
  animationSource?: "vlibras-video" | "simulation" | "none";
  unsupportedTokens?: string[];
  errorCode?: string;
  /** Latência medida no app: confirmação do trecho → início da animação (ms). */
  latencyMs?: number;
}

export interface HistoryEntry {
  id: string;
  label: string;
  startedAt: number;
  endedAt: number;
  utterances: number;
  medianMs?: number;
  p95Ms?: number;
}

export interface AppErrorInfo {
  code: string;
  message: string;
}

/** Quantidade de trechos aguardando/traduzindo que sinaliza atraso (§6.3). */
const DELAY_THRESHOLD = 3;

interface SessionStore {
  // --- Estado ------------------------------------------------------------
  phase: ViewPhase;
  micPermission: MicPermission;
  sessionId?: string;
  sessionLabel?: string;
  partialText: string;
  utterances: UtteranceItem[];
  currentSignId?: string;
  playbackSpeed: number;
  silenceMs: number;
  serverInfo?: { speechProvider: string; dictionaryLoaded: boolean; videoEnabled: boolean };
  metrics?: SessionMetrics;
  lastLatencyMs?: number;
  history: HistoryEntry[];
  error?: AppErrorInfo;
  busy: boolean;

  // --- Ações -------------------------------------------------------------
  initialize: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  processChunk: (payload: SpeechChunkPayload) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  onSignStart: (id: string) => void;
  onSignComplete: (id: string) => void;
  replayCurrent: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setSilenceMs: (ms: number) => Promise<void>;
  clearError: () => void;
  /** Item que o avatar deve exibir agora (assinando ou próximo pronto). */
  displayItem: () => UtteranceItem | undefined;
  pendingCount: () => number;
}

let chunkSequence = 0;
let finalizeTimer: ReturnType<typeof setInterval> | null = null;

const nowLabel = (): string => {
  const d = new Date();
  return `Sessão ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export const useSessionStore = create<SessionStore>((set, get) => {
  // -------------------------------------------------------------------------
  // Fila de tradução (lado do app): confirma → traduz → enfileira animação
  // -------------------------------------------------------------------------
  async function registerTranslation(u: NonNullable<TranscriptionResponse["confirmedUtterance"]>) {
    const item: UtteranceItem = {
      id: u.id,
      sequence: u.sequence,
      text: u.text,
      confirmedAt: Date.now(),
      status: "translating",
    };
    set((s) => ({ utterances: [...s.utterances, item] }));

    try {
      const result = await backend.createTranslation(u.sessionId, u.sequence, u.text);
      applyResult(u.id, result);
      if (result.status === "pending" || result.status === "processing") {
        void pollTranslation(u.id, result.id);
      }
    } catch (err) {
      // Falhas não interrompem a sessão (§14): marca e segue.
      updateItem(u.id, {
        status: "failed",
        errorCode: err instanceof ApiClientError ? err.code : "UNKNOWN",
      });
    }
    refreshPhase();
  }

  async function pollTranslation(utteranceId: string, translationId: string): Promise<void> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await new Promise((r) => setTimeout(r, 600));
      if (!get().utterances.some((u) => u.id === utteranceId)) return; // sessão reiniciada
      try {
        const result = await backend.getTranslation(translationId);
        if (result.status !== "pending" && result.status !== "processing") {
          applyResult(utteranceId, result);
          return;
        }
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      }
    }
  }

  function applyResult(utteranceId: string, result: TranslationResult): void {
    if (result.status === "ready") {
      updateItem(utteranceId, {
        status: "ready",
        translationId: result.id,
        gloss: result.gloss,
        animationUrl: result.animationUrl,
        animationSource: result.animationSource,
        unsupportedTokens: result.unsupportedTokens,
      });
    } else if (result.status === "unsupported") {
      updateItem(utteranceId, {
        status: "unsupported",
        translationId: result.id,
        gloss: result.gloss,
        unsupportedTokens: result.unsupportedTokens,
        errorCode: result.errorCode,
      });
    } else if (result.status === "failed") {
      updateItem(utteranceId, {
        status: "failed",
        translationId: result.id,
        errorCode: result.errorCode,
      });
    }
    refreshPhase();
  }

  function updateItem(id: string, patch: Partial<UtteranceItem>): void {
    set((s) => ({
      utterances: s.utterances.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }));
  }

  /** Recalcula a fase quando não há gravação ativa (mantém UI coerente). */
  function refreshPhase(): void {
    const s = get();
    if (s.phase === "listening" || s.phase === "transcribing" || s.phase === "error") return;
    const display = s.displayItem();
    if (display?.status === "signing" || display?.status === "ready") {
      set({ phase: display.status === "signing" ? "signing" : "awaiting-translation" });
      return;
    }
    const pending = s.pendingCount();
    if (pending > 0) set({ phase: pending >= DELAY_THRESHOLD ? "delayed" : "translating" });
    else if (s.phase !== "inactive" && s.phase !== "ended") set({ phase: "listening" });
  }

  async function ensureSession(): Promise<string | undefined> {
    const existing = get().sessionId;
    if (existing) return existing;
    try {
      const session: SessionInfo = await backend.createSession(nowLabel(), {
        silenceMs: get().silenceMs,
      });
      set({ sessionId: session.id, sessionLabel: nowLabel() });
      chunkSequence = 0;
      return session.id;
    } catch (err) {
      setFatal(err);
      return undefined;
    }
  }

  function setFatal(err: unknown): void {
    const code = err instanceof ApiClientError ? err.code : "UNKNOWN";
    const message =
      err instanceof ApiClientError ? err.message : "Falha inesperada de comunicação";
    set({ error: { code, message }, phase: "error" });
  }

  async function finalizeSession(): Promise<void> {
    const { sessionId, utterances, history } = get();
    if (finalizeTimer) {
      clearInterval(finalizeTimer);
      finalizeTimer = null;
    }
    if (sessionId) {
      const latencies = utterances
        .map((u) => u.latencyMs)
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);
      const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : undefined;
      const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : undefined;

      try {
        const m = await backend.metrics(sessionId);
        await backend.endSession(sessionId);
        set({
          metrics: m,
          history: [
            {
              id: sessionId,
              label: get().sessionLabel ?? "Sessão",
              startedAt: Date.now(),
              endedAt: Date.now(),
              utterances: m.utterancesConfirmed,
              medianMs: m.latency.medianTotalMs ?? median,
              p95Ms: m.latency.p95TotalMs ?? p95,
            },
            ...history,
          ],
        });
      } catch {
        // melhor esforço: histórico local continua correto
        set({
          history: [
            {
              id: sessionId,
              label: get().sessionLabel ?? "Sessão",
              startedAt: Date.now(),
              endedAt: Date.now(),
              utterances: utterances.length,
              medianMs: median,
              p95Ms: p95,
            },
            ...history,
          ],
        });
      }
    }
    set({ phase: "ended", sessionId: undefined, currentSignId: undefined });
  }

  return {
    phase: "inactive",
    micPermission: "unknown",
    partialText: "",
    utterances: [],
    playbackSpeed: 1,
    silenceMs: 500,
    history: [],
    busy: false,

    async initialize() {
      const [permission, health] = await Promise.allSettled([
        getMicPermission(),
        backend.health(),
      ]);
      set({
        micPermission: permission.status === "fulfilled" ? permission.value : "unknown",
        serverInfo: health.status === "fulfilled" ? health.value : undefined,
      });
      if (health.status === "rejected" && get().phase === "inactive") {
        // Aviso não fatal: o modo texto continua disponível (§14).
        set({
          error: {
            code: "BACKEND_OFFLINE",
            message: "Backend indisponível — inicie a API para transcrever áudio",
          },
        });
      }
    },

    async startListening() {
      const s = get();
      if (s.busy) return;
      set({ busy: true, error: undefined });

      try {
        const sessionId = await ensureSession();
        if (!sessionId) return;

        await speechController.start();
        set({ phase: "listening", partialText: "" });
      } catch (err) {
        if (err instanceof Error && err.message === "PERMISSION_DENIED") {
          set({
            micPermission: "denied",
            error: {
              code: "PERMISSION_DENIED",
              message: "Permissão de microfone negada. Permita o microfone nas configurações do Android.",
            },
            phase: "error",
          });
        } else {
          setFatal(err);
        }
      } finally {
        set({ busy: false });
      }
    },

    async stopListening() {
      await speechController.stop();

      const unfinished = get().utterances.some(
        (u) => u.status === "translating" || u.status === "ready",
      );
      if (!unfinished) {
        await finalizeSession();
        return;
      }

      // Drena a fila de animação antes de encerrar (§6.2 / §14).
      set({ phase: "signing" });
      finalizeTimer = setInterval(() => {
        const stillUnfinished = get().utterances.some(
          (u) => u.status === "translating" || u.status === "ready" || u.status === "signing",
        );
        if (!stillUnfinished) void finalizeSession();
      }, 1000);
    },

    async processChunk(payload) {
      const { sessionId, phase } = get();
      if (!sessionId) return;

      chunkSequence += 1;
      try {
        const resp = await backend.sendChunk({ sessionId, sequence: chunkSequence, ...payload });
        applyResponse(resp);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "SESSION_ENDED") {
          await get().stopListening();
          return;
        }
        if (err instanceof ApiClientError && err.code === "NETWORK_ERROR") {
          // Erro transiente: mostra aviso sem derrubar a sessão (§14).
          set({
            error: { code: "NETWORK", message: "Sem conexão com o backend — tentando de novo" },
          });
          return;
        }
        setFatal(err);
      }
    },

    async sendText(text) {
      if (get().busy) return;
      set({ busy: true, error: undefined });
      try {
        const sessionId = await ensureSession();
        if (!sessionId) return;
        const resp = await backend.sendText(sessionId, text);
        applyResponse(resp, text);
        if (get().phase !== "signing") set({ phase: "translating" });
      } catch (err) {
        setFatal(err);
      } finally {
        set({ busy: false });
      }
    },

    onSignStart(id) {
      const item = get().utterances.find((u) => u.id === id);
      if (!item) return;
      const latencyMs = Date.now() - item.confirmedAt;
      updateItem(id, { status: "signing", latencyMs });
      set({ currentSignId: id, phase: "signing", lastLatencyMs: latencyMs });
    },

    onSignComplete(id) {
      updateItem(id, { status: "done" });
      set({ currentSignId: undefined });
      const next = get().displayItem();
      if (!next) {
        const hasPending = get().utterances.some(
          (u) => u.status === "translating" || u.status === "ready",
        );
        set({ phase: hasPending ? "translating" : get().sessionId ? "listening" : "inactive" });
      }
      refreshPhase();
    },

    replayCurrent() {
      const s = get();
      const target = s.currentSignId
        ? s.utterances.find((u) => u.id === s.currentSignId)
        : [...s.utterances].reverse().find((u) => u.status === "done");
      if (!target) return;
      updateItem(target.id, { status: "signing" });
      set({ currentSignId: target.id, phase: "signing" });
    },

    setPlaybackSpeed(speed) {
      set({ playbackSpeed: speed });
    },

    async setSilenceMs(ms) {
      set({ silenceMs: ms });
    },

    clearError() {
      set({ error: undefined, phase: "listening" });
    },

    displayItem() {
      const s = get();
      const signing = s.utterances.find((u) => u.status === "signing");
      if (signing) return signing;
      const ready = s.utterances.find((u) => u.status === "ready");
      return ready ?? s.utterances.find((u) => u.status === "translating");
    },

    pendingCount() {
      return get().utterances.filter(
        (u) => u.status === "translating" || u.status === "ready" || u.status === "signing",
      ).length;
    },
  };

  function applyResponse(resp: TranscriptionResponse, fallbackText?: string): void {
    if (resp.confirmedUtterance) {
      void registerTranslation(resp.confirmedUtterance);
      set({ partialText: "" });
      const s = get();
      if (s.phase === "listening" || s.phase === "transcribing") set({ phase: "awaiting-translation" });
    } else {
      const partial = resp.partialText ?? fallbackText ?? "";
      set((s) => ({ partialText: partial }));
      if (partial && (get().phase === "listening" || get().phase === "transcribing")) {
        set({ phase: "transcribing" });
      }
    }
  }
});
