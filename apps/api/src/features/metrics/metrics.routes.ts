import type { FastifyInstance } from "fastify";
import { AppError } from "../../shared/lib/errors";
import { metrics } from "../../shared/lib/metrics";
import { sessionStore } from "../sessions";
import { translationQueue } from "../translations";

/**
 * GET /api/sessions/:id/metrics — métricas de latência da sessão (§12).
 * Registra apenas tempos e contagens, nunca conteúdo de fala (§11).
 */
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/sessions/:id/metrics", async (req, reply) => {
    const session = sessionStore.get(req.params.id);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Sessão não encontrada");

    const snapshot = metrics.snapshot(
      session.id,
      translationQueue.pendingCount(session.id),
    );
    return reply.send(snapshot);
  });
}
