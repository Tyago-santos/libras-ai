import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./shared/config/env";
import { registerErrorHandler } from "./shared/middleware/error-handler";
import { dictionary } from "./shared/providers/vlibras/dictionary";
import { sessionRoutes, startSweeper } from "./features/sessions";
import { translationRoutes, startTranslationPipeline } from "./features/translations";
import { transcriptionRoutes, speechProvider } from "./features/transcriptions";
import { metricsRoutes } from "./features/metrics";
import { avatarRoutes } from "./features/avatar";

/**
 * Monta a aplicação Fastify (§9: middleware, módulos, providers, server.ts).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // §11: não registra conteúdo sensível (texto/áudio) nos logs.
      redact: ["req.headers.authorization", "req.body.audioBase64"],
    },
    bodyLimit: 6 * 1024 * 1024, // chunks de áudio em base64 (§8: limites de tamanho)
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
  });

  registerErrorHandler(app);

  // Rota de saúde exibe o estado dos providers (§10: estados de erro/aviso).
  app.get("/api/health", async () => ({
    ok: true,
    speechProvider: speechProvider.name,
    dictionaryLoaded: dictionary.loaded(),
    videoEnabled: Boolean(env.VLIBRAS_API_TOKEN),
  }));

  await app.register(sessionRoutes);
  await app.register(translationRoutes);
  await app.register(transcriptionRoutes);
  await app.register(metricsRoutes);
  await app.register(avatarRoutes);

  // Inicializa pipeline das filas e varredura de sessões expiradas.
  startTranslationPipeline();
  startSweeper();

  return app;
}
