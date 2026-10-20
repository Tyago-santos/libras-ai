import type { TranslationResult } from "@libras-ai/contracts";
import { env } from "../../config/env";
import { dictionary } from "../../providers/vlibras/dictionary";
import { translateToGloss } from "../../providers/vlibras/translate";
import { requestVideo, waitForVideo, videoFileUrl } from "../../providers/vlibras/video";
import { metrics } from "../../lib/metrics";
import type { QueueTask, TaskStatus } from "./queue";
import { translationQueue } from "./queue";

/**
 * Pipeline de processamento de uma tarefa da fila (§6.1 + §7):
 *
 * 1. Tradução real PT → glosa (VLibras translate, sem auth — PoC validado);
 * 2. Validação dos tokens da glosa no dicionário oficial (sinais inexistentes
 *    ficam em `unsupportedTokens`);
 * 3. Geração de animação: vídeo real quando há credencial Conecta
 *    (VLIBRAS_API_TOKEN); caso contrário, `animationSource: "simulation"` —
 *    o app reproduz a simulação local e a UI informa ao usuário.
 *
 * A fila mantém tradução e animação desacopladas (§16), preserva a ordem
 * e registra latências (§12).
 */

export async function processTranslation(
  task: QueueTask,
): Promise<{ status: TaskStatus; fields: Partial<TranslationResult> }> {
  // 1. Tradução (real)
  const { gloss, durationMs } = await translateToGloss(task.text);

  // 2. Dicionário oficial de sinais
  const { unsupported } = dictionary.analyzeGloss(gloss);

  // 3. Animação (vídeo real só com credencial; senão, simulação no app)
  let animationUrl: string | undefined;
  let animationSource: TranslationResult["animationSource"] = "simulation";

  if (env.VLIBRAS_API_TOKEN) {
    const requested = await requestVideo(gloss);
    if (requested.kind === "ready") {
      const done = await waitForVideo(requested.videoId);
      if (done.kind === "ready") {
        animationUrl = `${env.PUBLIC_BASE_URL}/api/animations/${task.id}`;
        animationSource = "vlibras-video";
      }
    }
  }

  const allUnsupported =
    unsupported.length > 0 &&
    gloss
      .split(/\s+/)
      .filter((t) => !/^\[.+\]$/.test(t))
      .every((t) => unsupported.includes(t));

  const status: TaskStatus = allUnsupported ? "unsupported" : "ready";

  return {
    status,
    fields: {
      gloss,
      animationUrl,
      animationSource,
      unsupportedTokens: unsupported.length > 0 ? unsupported : undefined,
      errorCode: allUnsupported ? "NO_SIGNS_AVAILABLE" : undefined,
    },
  };
}

/** Inicializa o processador da fila e aquece o dicionário (melhor esforço). */
export function startTranslationPipeline(): void {
  translationQueue.setProcessor(async (task) => {
    const result = await processTranslation(task);
    return result;
  });
  void dictionary.warmup().catch(() => undefined);
  void metrics;
}
