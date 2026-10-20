import type { FastifyInstance } from "fastify";
import {
  textInputRequestSchema,
  transcriptionChunkRequestSchema,
  type TranscriptionResponse,
} from "@libras-ai/contracts";
import { AppError } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { metrics } from "../../lib/metrics";
import { sessionStore } from "../sessions/store";
import { translationQueue } from "../translations/queue";
import { speechProvider } from "../../providers/speech";
import { utteranceManager } from "./utterance-manager";

/**
 * POST /api/transcriptions/chunks — recebe chunk de áudio (ou marcação de
 *   silêncio) e devolve o parcial atual + trecho confirmado (se houver).
 * POST /api/utterances/text       — modo texto (entrada manual, §10).
 *
 * Trechos confirmados entram imediatamente na fila de tradução (§6.1).
 */
export async function transcriptionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/transcriptions/chunks", async (req, reply) => {
    const body = validate(
      transcriptionChunkRequestSchema,
      req.body,
      "POST /api/transcriptions/chunks",
    );
    const session = sessionStore.get(body.sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");
    if (session.state === "ended") {
      throw new AppError("SESSION_ENDED", "Sessão já encerrada");
    }

    // Conecta o gerenciador à configuração da sessão (§5: configurável).
    utteranceManager.silenceThreshold = (id) =>
      sessionStore.get(id)?.config.silenceMs ?? 500;
    utteranceManager.maxChars = (id) =>
      sessionStore.get(id)?.config.maxUtteranceChars ?? 220;

    // 1. Provedor de fala → texto parcial (ou silêncio).
    const speech = await speechProvider.transcribe({
      sessionId: body.sessionId,
      sequence: body.sequence,
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      durationMs: body.durationMs,
      isSilence: body.isSilence,
    });

    // 2. Gerenciador de frases → decide se confirma um trecho.
    const result = utteranceManager.ingest(body.sessionId, {
      partialText: speech.partialText || undefined,
      isSilence: body.isSilence,
      silenceMs: body.durationMs,
      final: speech.final,
    });

    // 3. Trecho confirmado → fila de tradução (preserva ordem, §6.1).
    const response: TranscriptionResponse = { partialText: result.partialText };
    const first = result.confirmed[0];
    if (first) {
      session.utterances += 1;
      metrics.recordUtteranceConfirmed(session.id);
      translationQueue.enqueue(
        { sessionId: session.id, sequence: first.sequence, text: first.text },
        session.config.maxQueueSize,
      );
      response.confirmedUtterance = first;
    }

    return reply.send(response);
  });

  app.post("/api/utterances/text", async (req, reply) => {
    const body = validate(textInputRequestSchema, req.body, "POST /api/utterances/text");
    const session = sessionStore.get(body.sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");
    if (session.state === "ended") {
      throw new AppError("SESSION_ENDED", "Sessão já encerrada");
    }

    // Modo texto: entrada manual é sempre um trecho final (§5).
    const result = utteranceManager.ingest(body.sessionId, {
      partialText: body.text,
      final: true,
    });
    const utterance = result.confirmed[result.confirmed.length - 1];

    if (utterance) {
      session.utterances += 1;
      metrics.recordUtteranceConfirmed(session.id);
      translationQueue.enqueue(
        { sessionId: session.id, sequence: utterance.sequence, text: utterance.text },
        session.config.maxQueueSize,
      );
    }

    return reply.send({ partialText: body.text, confirmedUtterance: utterance });
  });
}
