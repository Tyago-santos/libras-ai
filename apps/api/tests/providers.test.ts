import { describe, expect, it, vi } from "vitest";
import { normalizeGloss, translateToGloss } from "../src/providers/vlibras/translate";
import { analyzeGloss, dictionary, hasSign, type TrieNode } from "../src/providers/vlibras/dictionary";
import { parseGeminiOutput } from "../src/providers/speech/gemini";

describe("VLibras translate (PoC real — formato verificado em 2026-10-20)", () => {
  it("normaliza glosa em texto puro", () => {
    expect(normalizeGloss("BOM_DIA TUDO_BEM [INTERROGAÇÃO]")).toBe(
      "BOM_DIA TUDO_BEM [INTERROGAÇÃO]",
    );
  });

  it("normaliza resposta JSON {traducao} (formato alternado do player)", () => {
    expect(normalizeGloss('{"traducao":"BOM_DIA LIBRAS"}')).toBe("BOM_DIA LIBRAS");
  });

  it("chama POST JSON e devolve glosa + duração", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("BOM_DIA TUDO_BEM", { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await translateToGloss("Bom dia, tudo bem?", fetchMock);
    expect(result.gloss).toBe("BOM_DIA TUDO_BEM");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, RequestInit];
    expect(url).toContain("/translate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ text: "Bom dia, tudo bem?" });
  });

  it("erro upstream vira PROVIDER_ERROR", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(translateToGloss("oi", fetchMock)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});

describe("Dicionário de sinais (trie real do VLibras)", () => {
  const trie: TrieNode = {
    children: {
      // "OI": O -> I (fim de palavra)
      O: { children: { I: { end: true } } },
      // "ACENAR": A -> C -> E -> N -> A -> R (fim de palavra)
      A: {
        children: {
          C: {
            children: {
              E: { children: { N: { children: { A: { children: { R: { end: true } } } } } } },
            },
          },
        },
      },
    },
  };

  it("encontra palavra existente (case-insensitive, com _)", () => {
    expect(hasSign("oi", trie)).toBe(true);
    expect(hasSign("ACENAR", trie)).toBe(true);
  });

  it("sinal inexistente retorna false", () => {
    expect(hasSign("XYLOFONE", trie)).toBe(false);
  });

  it("tokens entre colchetes são marcadores gramaticais (suportados)", () => {
    dictionary.setRoot(trie);
    const { unsupported } = analyzeGloss("OI [INTERROGAÇÃO] XYLOFONE");
    expect(unsupported).toEqual(["XYLOFONE"]);
    dictionary.reset();
  });

  it("estado desconhecido (dicionário não carregado) não marca nada", () => {
    dictionary.setRoot(null);
    const { unsupported } = analyzeGloss("QUALQUER COISA");
    expect(unsupported).toEqual([]);
    dictionary.reset();
  });
});

describe("Parsing do provedor Gemini", () => {
  it("lê JSON puro", () => {
    expect(parseGeminiOutput('{"text":"Bom dia","final":true}')).toEqual({
      partialText: "Bom dia",
      final: true,
    });
  });

  it("lê JSON embrulhado em markdown", () => {
    const out = parseGeminiOutput('```json\n{"text":"Oi tudo bem","final":false}\n```');
    expect(out.partialText).toBe("Oi tudo bem");
    expect(out.final).toBe(false);
  });

  it("texto sem JSON não quebra o fluxo", () => {
    expect(parseGeminiOutput("transcrição solta")).toEqual({
      partialText: "transcrição solta",
      final: false,
    });
  });
});
