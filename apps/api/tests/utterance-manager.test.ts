import { beforeEach, describe, expect, it } from "vitest";
import { UtteranceManager, computeDelta } from "../src/features/transcriptions";

describe("UtteranceManager (§5 — pausas e frases)", () => {
  let manager: UtteranceManager;

  beforeEach(() => {
    manager = new UtteranceManager();
    manager.silenceThreshold = () => 500;
    manager.maxChars = () => 60;
  });

  it("NÃO confirma transcrições parciais", () => {
    const r = manager.ingest("s1", { partialText: "Bom dia tudo" });
    expect(r.confirmed).toHaveLength(0);
    expect(r.partialText).toContain("Bom dia");
  });

  it("acumula parciais cumulativos sem duplicar", () => {
    manager.ingest("s1", { partialText: "Bom dia" });
    manager.ingest("s1", { partialText: "Bom dia tudo bem" });
    const r = manager.ingest("s1", { partialText: "Bom dia tudo bem hoje" });
    expect(r.partialText).toBe("Bom dia tudo bem hoje");
    expect(r.confirmed).toHaveLength(0);
  });

  it("confirma por pontuação mesmo sem silêncio (frase concluída)", () => {
    const r = manager.ingest("s1", { partialText: "Bom dia, tudo bem?" });
    expect(r.confirmed).toHaveLength(1);
    expect(r.confirmed[0]?.text).toBe("Bom dia, tudo bem?");
    expect(r.confirmed[0]?.sequence).toBe(1);

    // Parcial cumulativo já confirmado NÃO gera novo trecho (sem duplicação).
    const again = manager.ingest("s1", { partialText: "Bom dia, tudo bem?" });
    expect(again.confirmed).toHaveLength(0);
  });

  it("NÃO confirma com silêncio curto no meio da frase (pausa < threshold)", () => {
    manager.ingest("s1", { partialText: "Vamos começar a aula" });
    const r = manager.ingest("s1", { isSilence: true, silenceMs: 300 });
    expect(r.confirmed).toHaveLength(0);
    // contexto preservado após a pausa curta
    const next = manager.ingest("s1", { partialText: "Vamos começar a aula de hoje" });
    expect(next.partialText).toContain("de hoje");
  });

  it("confirma por silêncio ≥ threshold", () => {
    manager.ingest("s1", { partialText: "Amanhã teremos uma reunião" });
    const r = manager.ingest("s1", { isSilence: true, silenceMs: 600 });
    expect(r.confirmed).toHaveLength(1);
    expect(r.confirmed[0]?.text).toBe("Amanhã teremos uma reunião");
    // buffer zerado após confirmação
    expect(manager.ingest("s1", { isSilence: true, silenceMs: 600 }).confirmed).toHaveLength(0);
  });

  it("sequência incremental por sessão", () => {
    manager.ingest("s1", { partialText: "Primeira frase." }); // confirma seq 1
    manager.ingest("s1", { partialText: "Primeira frase." }); // cumulativo: nada
    const r = manager.ingest("s1", { partialText: "Segunda frase." }); // confirma seq 2
    expect(r.confirmed).toHaveLength(1);
    expect(r.confirmed[0]?.sequence).toBe(2);
  });

  it("sessões são independentes", () => {
    const a1 = manager.ingest("a", { partialText: "Frase de A." });
    expect(a1.confirmed).toHaveLength(1);
    const rb = manager.ingest("b", { partialText: "Oi" });
    expect(rb.confirmed).toHaveLength(0);
    expect(manager.ingest("b", { partialText: "Oi tudo bem?" }).confirmed).toHaveLength(1);
    expect(manager.ingest("a", { partialText: "Outra de A." }).confirmed).toHaveLength(1);
  });

  it("corta trecho no limite de tamanho preservando coerência", () => {
    const long = "palavra ".repeat(20).trim(); // > 60 chars
    manager.ingest("s1", { partialText: long });
    const r = manager.ingest("s1", { partialText: long });
    expect(r.confirmed.length).toBeGreaterThanOrEqual(1);
    const first = r.confirmed[0];
    expect(first?.text.length).toBeLessThanOrEqual(60);
    expect(first?.text).not.toContain("  ");
  });

  it("silêncio vazio não gera trecho", () => {
    const r = manager.ingest("s1", { isSilence: true, silenceMs: 900 });
    expect(r.confirmed).toHaveLength(0);
  });
});

describe("computeDelta — evita duplicação (§5)", () => {
  it("extrai apenas o texto novo do parcial cumulativo", () => {
    expect(computeDelta("Bom dia", "Bom dia tudo bem")).toBe("tudo bem");
  });

  it("primeiro parcial retorna o texto inteiro", () => {
    expect(computeDelta("", "Bom dia")).toBe("Bom dia");
  });

  it("reinício do provedor não duplica o texto anterior", () => {
    const delta = computeDelta("trecho já confirmado e limpo", "nova fala começou");
    expect(delta).toBe("nova fala começou");
  });
});
