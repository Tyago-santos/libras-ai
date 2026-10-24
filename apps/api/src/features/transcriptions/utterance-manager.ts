import type { Utterance } from "@libras-ai/contracts";
import { newUtteranceId } from "../../shared/lib/ids";

/**
 * Gerenciador de frases (§5 da spec).
 *
 * Combina, por sessão:
 * - detecção de atividade vocal (silêncio reportado pelo app / VAD);
 * - duração do silêncio configurável (inicial: 500ms, ajustável);
 * - estado da transcrição: parcial nunca sai na hora, só finais;
 * - pontuação final (. ! ? ; , :);
 * - comprimento máximo do trecho (acumula e corta em limite configurável);
 * - contexto recente: o buffer atravessa pausas curtas no meio da frase.
 *
 * Decisão de enviar um trecho privilegia coerência linguística (§5).
 */

export interface IngestInput {
  /** Texto parcial acumulado retornado pelo provedor de fala (cumulativo). */
  partialText?: string;
  /** Pausa detectada pelo app. */
  isSilence?: boolean;
  /** Duração atual do silêncio (ms). */
  silenceMs?: number;
  /** O provedor marcou fim de sentença. */
  final?: boolean;
}

export interface IngestOutput {
  /** Texto parcial visível na UI (não traduzir). */
  partialText: string;
  /** Trechos confirmados nesta iteração (entram na fila de tradução). */
  confirmed: Utterance[];
}

interface SessionUtteranceState {
  /** Trecho em construção (atravessa pausas curtas). */
  buffer: string;
  /** Último texto parcial do provedor (para calcular o delta). */
  lastPartial: string;
  nextSequence: number;
}

const SENTENCE_END = /[.!?;:]\s*$/;
const MIN_CONFIRM_CHARS = 3;

export class UtteranceManager {
  private readonly states = new Map<string, SessionUtteranceState>();

  private ensure(sessionId: string): SessionUtteranceState {
    let state = this.states.get(sessionId);
    if (!state) {
      state = { buffer: "", lastPartial: "", nextSequence: 1 };
      this.states.set(sessionId, state);
    }
    return state;
  }

  ingest(sessionId: string, input: IngestInput): IngestOutput {
    const state = this.ensure(sessionId);

    // 1. Atualiza o buffer com o delta do provedor (transcrições parciais
    //    são cumulativas; nunca confirmamos o parcial diretamente).
    if (input.partialText) {
      const delta = computeDelta(state.lastPartial, input.partialText);
      state.lastPartial = input.partialText;
      if (delta) {
        state.buffer = state.buffer ? `${state.buffer} ${delta}`.replace(/\s+/g, " ").trim() : delta;
      }
    }

    const confirmed: Utterance[] = [];

    // 2. Regra de pontuação: frase concluída independe da pausa.
    if (input.final || SENTENCE_END.test(state.buffer)) {
      if (this.confirmIfReady(sessionId, state, confirmed, "pontuacao")) {
        return { partialText: state.lastPartial, confirmed };
      }
    }

    // 3. Regra de silêncio: pausa natural ≥ configurável confirma o trecho.
    if (input.isSilence && (input.silenceMs ?? 0) >= this.silenceThreshold(sessionId)) {
      this.confirmIfReady(sessionId, state, confirmed, "silencio");
    }

    // 4. Regra de tamanho: trecho muito longo é confirmado mesmo sem pausa
    //    (mantendo coerência: corta no último espaço antes do limite).
    const maxChars = this.maxChars(sessionId);
    if (state.buffer.length > maxChars) {
      this.confirmIfReady(sessionId, state, confirmed, "tamanho", maxChars);
    }

    return {
      partialText: state.buffer || input.partialText || "",
      confirmed,
    };
  }

  /** Confirma o buffer atual e zera o contexto. */
  private confirmIfReady(
    sessionId: string,
    state: SessionUtteranceState,
    out: Utterance[],
    _reason: string,
    maxChars?: number,
  ): boolean {
    let text = state.buffer.trim();
    if (text.length < MIN_CONFIRM_CHARS) {
      // Nada aproveitável: limpa apenas silêncios longos (não descarta fala).
      if (_reason === "silencio") {
        state.buffer = "";
        state.lastPartial = "";
      }
      return false;
    }

    if (maxChars !== undefined && text.length > maxChars) {
      const cut = text.lastIndexOf(" ", maxChars);
      const head = text.slice(0, cut > 0 ? cut : maxChars).trim();
      const tail = text.slice(cut > 0 ? cut + 1 : maxChars).trim();
      state.buffer = tail;
      text = head;
      // O restante permanece como contexto para o próximo trecho.
      out.push(this.makeUtterance(sessionId, state, text));
      return true;
    }

    // Limpa só o buffer: `lastPartial` permanece alinhado ao provedor para
    // que parciais cumulativos não repitam o texto já confirmado (§5).
    state.buffer = "";
    out.push(this.makeUtterance(sessionId, state, text));
    return true;
  }

  private makeUtterance(sessionId: string, state: SessionUtteranceState, text: string): Utterance {
    const utterance: Utterance = {
      id: newUtteranceId(),
      sessionId,
      sequence: state.nextSequence,
      text,
      confirmedAt: new Date().toISOString(),
    };
    state.nextSequence += 1;
    return utterance;
  }

  reset(sessionId: string): void {
    this.states.delete(sessionId);
  }

  resetAll(): void {
    this.states.clear();
  }

  // --- Configuração por sessão (injetada pelo roteador) --------------------
  silenceThreshold: (sessionId: string) => number = () => 500;
  maxChars: (sessionId: string) => number = () => 220;
}

/**
 * Calcula o texto novo em relação ao parcial anterior.
 * Se o provedor reiniciou o parcial (correção), devolve o texto completo
 * apenas quando não houver sobreposição (evita duplicação de trechos, §5).
 */
export function computeDelta(previous: string, current: string): string {
  if (!previous) return current.trim();
  if (current.startsWith(previous)) return current.slice(previous.length).trim();
  if (current.includes(previous.slice(0, Math.min(20, previous.length)))) {
    // Correção parcial: pega o sufixo após o trecho reconhecido.
    return current.slice(current.indexOf(previous.slice(0, 20)) + previous.length).trim();
  }
  // Reinício total: considera apenas o novo texto (não duplica o anterior).
  return current.trim();
}

export const utteranceManager = new UtteranceManager();
