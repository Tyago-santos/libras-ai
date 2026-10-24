import { env } from "../../config/env";

/**
 * Dicionário oficial de Libras (trie) — prova de conceito 2026-10-20:
 *   GET https://dicionario2-dth.vlibras.gov.br/signs?version=2018.3.1
 *   -> 200 application/json, ~3,6 MB (trie letra a letra com "end": true).
 *
 * Usado para dizer ao app quais tokens da glosa NÃO possuem sinal no
 * dicionário (status "unsupported" no contrato interno, §7).
 */

interface TrieNode {
  children?: Record<string, TrieNode>;
  end?: boolean;
}

let trieRoot: TrieNode | null = null;
let lastAttempt = 0;
const RETRY_MS = 10 * 60_000;

async function loadTrie(fetchImpl: typeof fetch = fetch): Promise<TrieNode | null> {
  if (trieRoot) return trieRoot;
  if (Date.now() - lastAttempt < RETRY_MS) return null;
  lastAttempt = Date.now();

  try {
    const res = await fetchImpl(env.VLIBRAS_DICTIONARY_URL, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { root?: TrieNode };
    trieRoot = data.root ?? null;
    return trieRoot;
  } catch {
    return null;
  }
}

function nodeHasWord(node: TrieNode, word: string): boolean {
  let current: TrieNode | undefined = node;
  for (const char of Array.from(word.toUpperCase())) {
    const next: TrieNode | undefined = current?.children?.[char];
    if (!next) return false;
    current = next;
  }
  return current?.end === true;
}

/**
 * Verifica se a palavra existe como sinal no dicionário.
 * Retorna `null` quando o dicionário não pôde ser carregado (estado desconhecido).
 */
export function hasSign(word: string, root: TrieNode | null = trieRoot): boolean | null {
  if (!root) return null;
  const clean = word.trim();
  if (!clean) return false;
  // Sinais compostos ("SOBRE&ASSUNTO"): valida cada parte.
  const parts = clean.split("&").filter(Boolean);
  if (parts.length > 1) {
    return parts.some((p) => nodeHasWord(root, p)) ? true : nodeHasWord(root, clean);
  }
  return nodeHasWord(root, clean);
}

/**
 * Separa a glosa em tokens verificáveis.
 * Tokens entre colchetes são marcadores gramaticais (sinais faciais/glosa
 * estrutural) e são tratados como suportados por padrão.
 */
export function analyzeGloss(gloss: string): { tokens: string[]; unsupported: string[] } {
  const tokens = gloss.split(/\s+/).filter(Boolean);
  const root = trieRoot;
  const unsupported: string[] = [];

  for (const token of tokens) {
    if (/^\[.+\]$/.test(token)) continue; // marcador gramatical
    const known = hasSign(token, root);
    if (known === false) unsupported.push(token);
  }
  return { tokens, unsupported };
}

export const dictionary = {
  /** Pré-carrega o dicionário (melhor esforço; não bloqueia o startup). */
  warmup: loadTrie,
  loaded: () => trieRoot !== null,
  analyzeGloss,
  hasSign,
  reset(): void {
    trieRoot = null;
    lastAttempt = 0;
  },
  /** Para testes. */
  setRoot(root: TrieNode | null): void {
    trieRoot = root;
  },
};

export type { TrieNode };
