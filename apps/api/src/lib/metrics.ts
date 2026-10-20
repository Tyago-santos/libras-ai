import type { SessionMetrics } from "@libras-ai/contracts";

/**
 * Coleta de métricas de latência (§12 da spec).
 * Armazena apenas tempos e contagens — nunca conteúdo de fala ou texto.
 */

export interface LatencySample {
  /** Instante em que o trecho foi confirmado. */
  confirmedAt: number;
  /** Espera na fila de tradução. */
  queueWaitMs?: number;
  /** Duração da chamada ao provedor de tradução. */
  processingMs?: number;
  /** Total confirmação -> resultado pronto. */
  totalMs?: number;
}

interface SessionRecord {
  utterancesConfirmed: number;
  samples: LatencySample[];
  translationsTotal: number;
  translationsFailed: number;
  translationsUnsupported: number;
}

const records = new Map<string, SessionRecord>();

const ensure = (sessionId: string): SessionRecord => {
  let rec = records.get(sessionId);
  if (!rec) {
    rec = {
      utterancesConfirmed: 0,
      samples: [],
      translationsTotal: 0,
      translationsFailed: 0,
      translationsUnsupported: 0,
    };
    records.set(sessionId, rec);
  }
  return rec;
};

export const metrics = {
  recordUtteranceConfirmed(sessionId: string): void {
    ensure(sessionId).utterancesConfirmed += 1;
  },

  recordTranslationStarted(sessionId: string, confirmedAt: number): void {
    ensure(sessionId).samples.push({ confirmedAt });
  },

  recordTranslationFinished(
    sessionId: string,
    finished: Omit<LatencySample, "confirmedAt"> & { status: string },
  ): void {
    const rec = ensure(sessionId);
    rec.translationsTotal += 1;
    if (finished.status === "failed") rec.translationsFailed += 1;
    if (finished.status === "unsupported") rec.translationsUnsupported += 1;

    const sample = rec.samples[rec.samples.length - 1];
    if (sample) {
      if (finished.queueWaitMs !== undefined) sample.queueWaitMs = finished.queueWaitMs;
      if (finished.processingMs !== undefined) sample.processingMs = finished.processingMs;
      if (finished.totalMs !== undefined) sample.totalMs = finished.totalMs;
    }
  },

  snapshot(sessionId: string, pendingTranslations: number): SessionMetrics {
    const rec = ensure(sessionId);
    const totals = rec.samples
      .filter((s) => s.totalMs !== undefined)
      .map((s) => s.totalMs as number)
      .sort((a, b) => a - b);
    const processings = rec.samples
      .filter((s) => s.processingMs !== undefined)
      .map((s) => s.processingMs as number)
      .sort((a, b) => a - b);

    return {
      sessionId,
      utterancesConfirmed: rec.utterancesConfirmed,
      translationsTotal: rec.translationsTotal,
      translationsFailed: rec.translationsFailed,
      translationsUnsupported: rec.translationsUnsupported,
      pendingTranslations,
      latency: {
        samples: totals.length,
        medianTotalMs: percentile(totals, 50),
        p95TotalMs: percentile(totals, 95),
        medianProcessingMs: percentile(processings, 50),
        p95ProcessingMs: percentile(processings, 95),
      },
    };
  },

  reset(sessionId?: string): void {
    if (sessionId) records.delete(sessionId);
    else records.clear();
  },
};

/** Percentil por interpolação linear sobre lista ordenada. */
export function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return Math.round((sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight);
}
