import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env";
import { registerErrorHandler } from "./middleware/error-handler";
import { sessionRoutes } from "./modules/sessions/routes";
import { translationRoutes } from "./modules/translations/routes";
import { transcriptionRoutes } from "./modules/transcriptions/routes";
import { metricsRoutes } from "./modules/metrics/routes";
import { avatarRoutes } from "./modules/avatar/routes";
import { startTranslationPipeline } from "./modules/translations/service";
import { startSweeper } from "./modules/sessions/store";
import { dictionary } from "./providers/vlibras/dictionary";
import { speechProvider } from "./providers/speech";

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
