/** Superfície pública do feature de traduções. */
export { translationRoutes } from "./translation.routes";
export { startTranslationPipeline, processTranslation } from "./translation.service";
export { translationQueue } from "./translation.queue";
export type { QueueTask, TaskStatus } from "./translation.queue";
