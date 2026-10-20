import type { TranslationResult } from "@libras-ai/contracts";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { newTaskId } from "../../lib/ids";
import { metrics } from "../../lib/metrics";

/**
 * Fila de tradução em memória (§6.1 da spec).
 *
 * Regras implementadas:
 * - preserva a ordem da conversa (FIFO estrito por sessão, sequência monotônica);
 * - evita duplicações (mesmo sessionId+sequence devolve a tarefa existente);
 * - limita solicitações simultâneas (sequencial por sessão; concorrência global
 *   entre sessões via QUEUE_CONCURRENCY);
 * - identificador por tarefa + retentativas controladas com backoff;
 * - registra espera na fila e duração do processamento;
 * - política explícita de atraso (§6.3): ao atingir maxPending, COMBINA trechos
 *   consecutivos (nunca descarta silenciosamente) e sinaliza `overloaded`.
 */

export type TaskStatus = "pending" | "processing" | "ready" | "unsupported" | "failed";

export interface QueueTask {
  id: string;
  sessionId: string;
  sequence: number;
  text: string;
  status: TaskStatus;
  attempts: number;
  createdAt: number;
  confirmedAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: TranslationResult;
  /** true quando este item nasceu da combinação de trechos (política de atraso). */
  merged?: boolean;
  errorCode?: string;
}

type Processor = (task: QueueTask) => Promise<{ status: TaskStatus; fields: Partial<TranslationResult> }>;

interface SessionQueue {
  tasks: QueueTask[];
  running: boolean;
  maxPending: number;
  overloaded: boolean;
}

const byKey = new Map<string, QueueTask>(); // `${sessionId}:${sequence}`
const queues = new Map<string, SessionQueue>();
let processor: Processor | null = null;
let globalActive = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ensureQueue(sessionId: string, maxPending: number): SessionQueue {
  let q = queues.get(sessionId);
  if (!q) {
    q = { tasks: [], running: false, maxPending, overloaded: false };
    queues.set(sessionId, q);
  }
  return q;
}

export const translationQueue = {
  setProcessor(proc: Processor): void {
    processor = proc;
  },

  /**
   * Enfileira uma tarefa. Retorna a existente em caso de duplicidade.
   * Lança QUEUE_FULL apenas se a combinação de trechos não for possível
   * (nunca descarta itens — §6.3).
   */
  enqueue(
    params: { sessionId: string; sequence: number; text: string; confirmedAt?: number },
    maxPending = env.QUEUE_MAX_PENDING_PER_SESSION,
  ): { task: QueueTask; merged: QueueTask[] } {
    const key = `${params.sessionId}:${params.sequence}`;
    const existing = byKey.get(key);
    if (existing) return { task: existing, merged: [] };

    const q = ensureQueue(params.sessionId, maxPending);
    const task: QueueTask = {
      id: newTaskId(),
      sessionId: params.sessionId,
      sequence: params.sequence,
      text: params.text,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
      confirmedAt: params.confirmedAt ?? Date.now(),
    };

    // --- Política de atraso (§6.3) ---------------------------------------
    // Backlog = pendentes + em processamento (fila total da sessão).
    const backlog = q.tasks.filter(
      (t) => t.status === "pending" || t.status === "processing",
    ).length;
    if (backlog >= maxPending) {
      const merged = combinePending(q, maxPending);
      q.overloaded = true;
      if (merged === null) {
        // Não foi possível combinar: sinaliza fila cheia sem descartar nada.
        throw new AppError(
          "QUEUE_FULL",
          "Fila de tradução cheia e sem trechos combináveis",
          { sessionId: params.sessionId, pending: q.tasks.length },
        );
      }
      q.tasks.push(task);
      byKey.set(key, task);
      void drain(params.sessionId);
      return { task, merged };
    }

    q.tasks.push(task);
    byKey.set(key, task);
    void drain(params.sessionId);
    return { task, merged: [] };
  },

  get(id: string): QueueTask | undefined {
    for (const q of queues.values()) {
      const found = q.tasks.find((t) => t.id === id);
      if (found) return found;
    }
    return undefined;
  },

  getBySessionAndSequence(sessionId: string, sequence: number): QueueTask | undefined {
    return byKey.get(`${sessionId}:${sequence}`);
  },

  listBySession(sessionId: string): QueueTask[] {
    return [...(queues.get(sessionId)?.tasks ?? [])].sort((a, b) => a.sequence - b.sequence);
  },

  pendingCount(sessionId: string): number {
    return (queues.get(sessionId)?.tasks ?? []).filter(
      (t) => t.status === "pending" || t.status === "processing",
    ).length;
  },

  isOverloaded(sessionId: string): boolean {
    return queues.get(sessionId)?.overloaded ?? false;
  },

  clearOverloaded(sessionId: string): void {
    const q = queues.get(sessionId);
    if (q && q.tasks.every((t) => t.status === "ready" || t.status === "failed" || t.status === "unsupported")) {
      q.overloaded = false;
    }
  },

  /** Cancela (marca) tarefas pendentes da sessão — usado no DELETE de sessão. */
  cancelSession(sessionId: string): number {
    const q = queues.get(sessionId);
    if (!q) return 0;
    let cancelled = 0;
    for (const t of q.tasks) {
      if (t.status === "pending") {
        t.status = "failed";
        t.errorCode = "SESSION_CANCELLED";
        t.finishedAt = Date.now();
        cancelled += 1;
      }
    }
    return cancelled;
  },

  async drainNow(sessionId: string): Promise<void> {
    await drain(sessionId);
  },

  reset(): void {
    queues.clear();
    byKey.clear();
    globalActive = 0;
  },
};

/**
 * Combina trechos pendentes consecutivos em um único item (política de
 * atraso da §6.3: "permitir combinar trechos quando linguisticamente
 * adequado"). O texto é concatenado na ordem original; as sequências
 * originais ficam registradas em `mergedSequences`.
 */
function combinePending(q: SessionQueue, maxPending: number): QueueTask[] | null {
  const pending = q.tasks.filter((t) => t.status === "pending");
  if (pending.length < 2) return null;

  const first = pending[0] as QueueTask;
  const others = pending.slice(1);
  const combinedText = [first.text, ...others.map((t) => t.text)].join(" ").trim();

  first.text = combinedText;
  first.merged = true;
  (first as QueueTask & { mergedSequences?: number[] }).mergedSequences = others.map(
    (t) => t.sequence,
  );

  for (const t of others) {
    t.status = "failed";
    t.errorCode = "MERGED_INTO_PREVIOUS";
    t.finishedAt = Date.now();
  }
  void maxPending;
  return others;
}

async function drain(sessionId: string): Promise<void> {
  const q = queues.get(sessionId);
  if (!q || q.running || !processor) return;
  if (globalActive >= env.QUEUE_CONCURRENCY) return;

  const next = q.tasks.find((t) => t.status === "pending");
  if (!next) return;

  q.running = true;
  globalActive += 1;
  next.status = "processing";
  next.attempts += 1;
  next.startedAt = Date.now();
  const queueWaitMs = next.startedAt - next.confirmedAt;

  try {
    const { status, fields } = await processor(next);
    next.status = status;
    next.finishedAt = Date.now();
    next.result = {
      id: next.id,
      sessionId: next.sessionId,
      sequence: next.sequence,
      originalText: next.text,
      status,
      createdAt: new Date(next.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      ...fields,
      latency: {
        queueWaitMs,
        processingMs: next.finishedAt - (next.startedAt ?? next.finishedAt),
        totalMs: next.finishedAt - next.confirmedAt,
      },
    };
    metrics.recordTranslationFinished(next.sessionId, {
      queueWaitMs,
      processingMs: next.finishedAt - (next.startedAt ?? next.finishedAt),
      totalMs: next.finishedAt - next.confirmedAt,
      status,
    });
  } catch (err) {
    // Retentativas controladas (backoff) para erros transitórios.
    if (next.attempts < env.QUEUE_MAX_ATTEMPTS) {
      const backoff = 300 * next.attempts;
      await sleep(backoff);
      next.status = "pending";
      next.startedAt = undefined;
      q.running = false;
      globalActive -= 1;
      void drain(sessionId);
      return;
    }
    next.status = "failed";
    next.finishedAt = Date.now();
    next.errorCode = err instanceof AppError ? err.code : "INTERNAL_ERROR";
    next.result = {
      id: next.id,
      sessionId: next.sessionId,
      sequence: next.sequence,
      originalText: next.text,
      status: "failed",
      errorCode: next.errorCode,
      createdAt: new Date(next.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      latency: {
        queueWaitMs,
        totalMs: next.finishedAt - next.confirmedAt,
      },
    };
    metrics.recordTranslationFinished(next.sessionId, {
      queueWaitMs,
      totalMs: next.finishedAt - next.confirmedAt,
      status: "failed",
    });
  } finally {
    q.running = false;
    globalActive = Math.max(0, globalActive - 1);
    translationQueue.clearOverloaded(sessionId);
  }

  // Próxima tarefa da mesma sessão (ordem garantida).
  void drain(sessionId);
}
