import type { FastifyInstance } from "fastify";
import { translationRequestSchema, translationResultSchema } from "@libras-ai/contracts";
import { AppError } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { metrics } from "../../lib/metrics";
import { sessionStore } from "../sessions/store";
import { translationQueue } from "./queue";

/** Serializa uma tarefa da fila para o contrato interno. */
function toResult(task: import("./queue").QueueTask) {
  if (task.result) return task.result;
  return translationResultSchema.parse({
    id: task.id,
    sessionId: task.sessionId,
    sequence: task.sequence,
    originalText: task.text,
    status: task.status,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.finishedAt ?? task.createdAt).toISOString(),
    errorCode: task.errorCode,
  });
}

/**
 * POST /api/translations            — recebe trecho confirmado (§8)
 * GET  /api/translations/:id        — consulta estado assíncrono (§8)
 * GET  /api/sessions/:id/translations — lista em ordem (extra, alimenta a
 *                                       fila de animação do app §6.2)
 */
export async function translationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/translations", async (req, reply) => {
    const body = validate(translationRequestSchema, req.body, "POST /api/translations");

    const session = sessionStore.get(body.sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");
    if (session.state === "ended") {
      throw new AppError("SESSION_ENDED", "Sessão já encerrada");
    }

    metrics.recordTranslationStarted(session.id, Date.now());
    const { task, merged } = translationQueue.enqueue(
      {
        sessionId: body.sessionId,
        sequence: body.sequence,
        text: body.text,
      },
      session.config.maxQueueSize,
    );

    // Aguarda um pouco para reduzir o número de polls do app (não bloqueia a fila).
    if (task.status === "pending" || task.status === "processing") {
      await Promise.race([
        waitForTask(task.id, 1_500),
        new Promise((r) => setTimeout(r, 1_500)),
      ]);
    }

    return reply.code(merged.length > 0 ? 200 : 202).send({
      ...toResult(task),
      mergedSequenceCount: merged.length,
    });
  });

  app.get<{ Params: { id: string } }>("/api/translations/:id", async (req, reply) => {
    const task = translationQueue.get(req.params.id);
    if (!task) throw new AppError("TRANSLATION_NOT_FOUND", "Tradução não encontrada");
    return reply.send(toResult(task));
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/translations", async (req, reply) => {
    const session = sessionStore.get(req.params.id);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");
    const list = translationQueue.listBySession(session.id).map(toResult);
    return reply.send({
      items: list,
      pending: translationQueue.pendingCount(session.id),
      overloaded: translationQueue.isOverloaded(session.id),
    });
  });
}

/** Resolve quando a tarefa sair de pending/processing (ou após timeout). */
function waitForTask(id: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const task = translationQueue.get(id);
      if (!task || task.status !== "pending" && task.status !== "processing") return resolve();
      if (Date.now() - started > timeoutMs) return resolve();
      setTimeout(tick, 80);
    };
    tick();
  });
}
