/** Contrato dos provedores de reconhecimento de voz (§3 da spec). */

export interface SpeechInput {
  sessionId: string;
  /** Sequência do chunk na sessão. */
  sequence: number;
  /** Áudio em base64 (formato conforme mimeType). */
  audioBase64?: string;
  mimeType?: "audio/webm" | "audio/m4a" | "audio/wav" | "audio/mp4";
  durationMs?: number;
  /** O app detectou silêncio (VAD local com medidor do microfone). */
  isSilence?: boolean;
}

export interface SpeechOutput {
  /**
   * Texto PARCIAL acumulado da sessão até aqui (cumulativo).
   * Nunca deve ser enviado diretamente para tradução (§5).
   */
  partialText: string;
  /** True quando o provedor sinalizou fim de sentença com pontuação. */
  final: boolean;
}

export interface SpeechProvider {
  readonly name: string;
  /** Transcreve um chunk de áudio (ou marca silêncio). */
  transcribe(input: SpeechInput): Promise<SpeechOutput>;
}

/** Nome do provider ativo — exibido em /api/health. */
export const providerNotReady = (name: string): never => {
  throw new Error(`Provider de transcrição "${name}" não inicializado`);
};
