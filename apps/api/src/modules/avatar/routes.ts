import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors";
import { translationQueue } from "../translations/queue";
import { videoAuthHeaders, videoFileUrl } from "../../providers/vlibras/video";

/**
 * GET /api/animations/:translationId — proxy do vídeo real do VLibras.
 *
 * O app nunca fala diretamente com serviços externos (§8: chaves só no
 * backend). Quando a geração de vídeo está ativa (VLIBRAS_API_TOKEN), o
 * resultado traz animationUrl apontando para esta rota, que repassa o
 * stream do VLibras com o token de autenticação.
 */
export async function avatarRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { translationId: string } }>(
    "/api/animations/:translationId",
    async (req, reply) => {
      const task = translationQueue.get(req.params.translationId);
      if (!task) throw new AppError("TRANSLATION_NOT_FOUND", "Tradução não encontrada");
      if (task.result?.animationSource !== "vlibras-video") {
        throw new AppError("ANIMATION_NOT_AVAILABLE", "Vídeo oficial não disponível para esta tradução");
      }

      const videoId = task.result.animationData as string | undefined;
      if (!videoId) {
        throw new AppError("ANIMATION_NOT_AVAILABLE", "Identificador do vídeo ausente");
      }

      const upstream = await fetch(videoFileUrl(videoId), {
        headers: videoAuthHeaders(),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);

      if (!upstream || !upstream.ok) {
        throw new AppError("PROVIDER_ERROR", "Falha ao obter o vídeo do VLibras");
      }

      reply
        .header("Content-Type", upstream.headers.get("content-type") ?? "video/mp4")
        .header("Cache-Control", "private, max-age=3600");

      const buffer = Buffer.from(await upstream.arrayBuffer());
      return reply.send(buffer);
    },
  );
}
