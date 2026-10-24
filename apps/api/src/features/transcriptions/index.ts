/** Superfície pública do feature de transcrições. */
export { transcriptionRoutes } from "./transcription.routes";
export { utteranceManager, UtteranceManager, computeDelta } from "./utterance-manager";
export type { IngestInput, IngestOutput } from "./utterance-manager";
export { speechProvider } from "./speech";
export type { SpeechProvider, SpeechInput, SpeechOutput } from "./speech";
