import { env } from "../../config/env";
import { GeminiSpeechProvider } from "./gemini";
import { MockSpeechProvider } from "./mock";
import type { SpeechProvider } from "./types";

/**
 * Factory do provedor de transcrição (§3: serviço existente de STT).
 *
 * SPEECH_PROVIDER=mock   → simulado, sem chaves (padrão do MVP).
 * SPEECH_PROVIDER=gemini → real, exige GEMINI_API_KEY.
 */
function createProvider(): SpeechProvider {
  if (env.SPEECH_PROVIDER === "gemini") {
    return new GeminiSpeechProvider();
  }
  return new MockSpeechProvider();
}

export const speechProvider: SpeechProvider = createProvider();
export type { SpeechProvider, SpeechInput, SpeechOutput } from "./types";
