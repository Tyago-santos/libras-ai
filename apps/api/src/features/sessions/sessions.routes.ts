import type { FastifyInstance } from "fastify";
import { createSessionRequestSchema } from "@libras-ai/contracts";
import { AppError } from "../../shared/lib/errors";
import { validate } from "../../shared/lib/validate";
import { metrics } from "../../shared/lib/metrics";
import { sessionStore } from "./session.store";
import { translationQueue } from "../translations";

/**
 * POST /api/sessions       — inicia sessão (§8)
 * GET  /api/sessions/:id   — estado da sessão (extra, útil para o app)
 * DELETE /api/sessions/:id — encerra e cancela tarefas pendentes (§8)
 */
export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/sessions", async (req, reply) => {
    const body = validate(createSessionRequestSchema, req.body ?? {}, "POST /api/sessions");
    const record = sessionStore.create(body.label, body.config);
    req.log.info({ sessionId: record.id }, "sessao criada");
    return reply.code(201).send(sessionStore.toDomain(record, 0));
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const record = sessionStore.get(req.params.id);
    if (!record) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");
    const pending = translationQueue.pendingCount(record.id);
    return reply.send(sessionStore.toDomain(record, pending));
  });

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const record = sessionStore.get(req.params.id);
    if (!record) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");

    const cancelled = translationQueue.cancelSession(record.id);
    sessionStore.end(record.id);
    metrics.reset(record.id);
    req.log.info({ sessionId: record.id, cancelled }, "sessao encerrada");
    return reply.send({ ok: true, cancelled });
  });
}
