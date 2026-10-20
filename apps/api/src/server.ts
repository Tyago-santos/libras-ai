import { buildApp } from "./app";
import { env } from "./config/env";

/** Ponto de entrada do backend (§9: server.ts). */
async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "encerrando servidor");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(
    { port: env.PORT, speech: env.SPEECH_PROVIDER, video: Boolean(env.VLIBRAS_API_TOKEN) },
    "Libras AI API no ar",
  );
}

main().catch((err) => {
  console.error("Falha ao iniciar a API:", err);
  process.exit(1);
});
