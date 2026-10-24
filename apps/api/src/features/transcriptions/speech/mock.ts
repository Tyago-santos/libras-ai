import type { SpeechInput, SpeechOutput, SpeechProvider } from "./types";

/**
 * Provider simulado (padrão, sem chaves).
 *
 * Objetivo: permitir executar o fluxo completo (captura → utterances →
 * filas → avatar) sem custo nem configuração. Produz transcrições parciais
 * cumulativas a partir de uma lista de frases de demonstração, respeitando
 * o ritmo dos chunks enviados pelo app.
 *
 * Ative o provider real com SPEECH_PROVIDER=gemini.
 */

const DEMO_SCRIPTS: string[][] = [
  ["Bom dia,", "tudo bem?", "Vamos começar a aula de hoje."],
  ["Amanhã", "teremos uma reunião", "sobre o projeto de acessibilidade."],
  ["Por favor,", "envie o relatório", "até sexta-feira."],
  ["Obrigado pela", "ajuda de hoje,", "foi muito útil."],
];

export class MockSpeechProvider implements SpeechProvider {
  readonly name = "mock";
  private readonly sessions = new Map<string, { script: string[]; index: number; buffer: string }>();

  async transcribe(input: SpeechInput): Promise<SpeechOutput> {
    if (input.isSilence) {
      const state = this.sessions.get(input.sessionId);
      return { partialText: state?.buffer.trim() ?? "", final: false };
    }

    let state = this.sessions.get(input.sessionId);
    if (!state) {
      const script = DEMO_SCRIPTS[Math.floor(Math.random() * DEMO_SCRIPTS.length)] as string[];
      state = { script, index: 0, buffer: "" };
      this.sessions.set(input.sessionId, state);
    }

    // A cada chunk "com áudio" avança uma palavra/frase do roteiro.
    const phrase = state.script[state.index];
    if (phrase !== undefined) {
      state.buffer = state.buffer ? `${state.buffer} ${phrase}` : phrase;
      state.index = (state.index + 1) % state.script.length;
    }

    const final = /[.!?;]\s*$/.test(state.buffer);
    return { partialText: state.buffer.trim(), final };
  }

  reset(sessionId?: string): void {
    if (sessionId) this.sessions.delete(sessionId);
    else this.sessions.clear();
  }
}
