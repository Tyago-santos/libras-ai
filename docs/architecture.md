# Arquitetura — Libras AI (MVP)

Visão geral dos módulos, fluxo de dados e decisões de design. Referências de seção (§) apontam
para a spec do MVP.

## Visão geral

```
┌────────────── App mobile (Expo) ───────────────┐   ┌─────────── Backend (Fastify) ───────────┐
│                                                 │   │                                          │
│  useSpeechStream ──chunks WAV/VAD──┐            │   │  /api/transcriptions/chunks              │
│  (PCM 16kHz, RMS)                  │            │   │        │                                 │
│                                     ▼            │   │        ▼                                 │
│  session store (zustand) ──► POST /transcriptions │──►│  SpeechProvider (mock|gemini)            │
│        ▲                         chunks         │   │        │ partialText                     │
│        │                                        │   │        ▼                                 │
│        │  poll GET /api/translations/:id        │   │  UtteranceManager (§5)                   │
│        │◄───────────────────────────────────────│───│        │ trecho confirmado               │
│        │                                        │   │        ▼                                 │
│  AvatarViewport ◄── resultado { gloss, video } ─│───│  TranslationQueue (§6, sequencial)       │
│   (vídeo real ou simulação)                     │   │        │ VLibras /translate (real)        │
│                                                 │   │        ▼                                 │
│                                                 │   │  Dictionary trie (valida tokens, §7)    │
└─────────────────────────────────────────────────┘   └──────────────────────────────────────────┘
```

O app **nunca** fala com serviços externos: todas as chaves e chamadas ficam no backend (§8).

## Backend (`apps/api`)

| Módulo | Responsabilidade |
| --- | --- |
| `shared/config/env` | Variáveis de ambiente validadas com Zod (com defaults seguros). |
| `features/sessions` | CRUD de sessões em memória + varredura de expiração (`SESSION_TTL_MS`). |
| `features/transcriptions` | Recebe chunks/silêncio/texto; `UtteranceManager` decide quando um trecho está pronto (§5). |
| `features/translations` | Fila por sessão (sequencial), retry, política de atraso (§6.3) e métricas de latência. |
| `features/metrics` | `GET /api/sessions/:id/metrics` — mediana/p95 de espera, processamento e total (§12). |
| `features/avatar` | `GET /api/animations/:id` — proxy do vídeo oficial do VLibras com token (§8). |
| `features/transcriptions/speech` | `mock` (padrão, sem chaves) e `gemini` (real, `GEMINI_API_KEY`), com fallback. |
| `shared/providers/vlibras` | `translate` (POST real), `dictionary` (trie oficial), `video` (fluxo Conecta). |
| `shared/middleware/error-handler` | Erros centralizados `{ error: { code, message } }` + logs redigidos (§11). |

### Confirmação de trechos (§5)

`UtteranceManager.ingest()` combina, por sessão:

- **delta de parciais cumulativos** — `computeDelta` evita duplicar texto já confirmado;
- **pontuação final** (`. ! ? ; :`) — confirma mesmo sem pausa;
- **silêncio ≥ `silenceMs`** (default 500 ms, configurável por sessão);
- **tamanho máximo** (`maxUtteranceChars`, default 220) — corta no último espaço, preservando
  coerência e mantendo o restante como contexto.

Parciais nunca são traduzidas: traduzimos somente trechos **confirmados**.

### Fila de tradução (§6)

- **Sequencial por sessão** (`concurrency` vale entre sessões) → ordem da conversa preservada.
- **Deduplicação** por `sessionId+sequence`.
- **Retry** com backoff (`QUEUE_MAX_ATTEMPTS`).
- **Política de atraso (§6.3)**: quando `backlog ≥ maxQueueSize`, os pendentes são **combinados
  linguisticamente** em ordem (um trecho mais longo) e os originais marcados
  `MERGED_INTO_PREVIOUS` — nada é descartado silenciosamente.
- **Cancelamento** pendente ao encerrar sessão (`DELETE /api/sessions/:id`).

### Estados de tradução

`pending → processing → ready | unsupported | failed`

`animationSource`:
- `vlibras-video` — vídeo oficial (requer `VLIBRAS_API_TOKEN`); o app recebe `animationUrl`
  apontando para o proxy do backend;
- `simulation` — o app reproduz a glosa localmente (avatar simulado, sinalizado na UI — §7);
- `none` — sem animação possível.

## App mobile (`apps/mobile`)

| Camada | Arquivos | Papel |
| --- | --- | --- |
| Tema | `theme/tokens`, `theme/ThemeProvider` | Tokens do Stitch (paleta, tipografia, espaçamento) no styled-components. |
| Áudio | `features/speech/useSpeechStream` | Stream PCM contínua, VAD por RMS, chunks WAV base64, evento de silêncio. |
| Ponte | `features/speech/controller` | Store (imperativo) ↔ hook (React). |
| Estado | `features/session/store` | Máquina de estados, fila de tradução local, latência, histórico em memória. |
| UI | `components/*` | Header, chips, banners, mic 72dp, cartão "Você disse", composer, viewport do avatar. |
| Telas | `screens/*` | Traduzir (workspace), Histórico, Configurações. |
| Raiz | `app/AppRoot` | Fontes, tema, abas e o hook de áudio (montado sempre — gravação sobrevive à troca de aba). |

### Máquina de estados (§10)

```
inactive ──start──► listening ──fala──► transcribing ──trecho──► awaiting-translation
    ▲                  │                                              │
    │                  └──stop (sem pendências)──► ended               ▼
    │                                                          translating ──ready──► signing
    │                                                                ▲                    │
    └──────────────── fila vazia ◄───────────────────────────────────┘◄──onDone───────────┘
                                  (delayed quando pendentes ≥ 3 — §6.3)
```

- **listening/transcribing**: microfone ativo; parcial aparece no cartão "Você disse".
- **signing**: avatar reproduz a animação atual; `latencyMs = início da animação − confirmação`.
- **delayed**: ≥ 3 trechos aguardando (fila acumulando).
- **error**: aviso/banner com código estável; falhas **não interrompem** a sessão (§14).
- **ended**: métricas buscadas e histórico local gravado.

### Latência (§12)

O app mede `speechEnd → animationStart` por trecho e mostra a última; o backend expõe mediana e
p95 de espera/processamento/total por sessão.

## Contratos (`packages/contracts`)

Schemas Zod únicos para as duas pontas (requests, responses, códigos de erro). Qualquer mudança de
formato começa aqui; os testes do pacote garantem defaults e validação.

## Privacidade (§11)

- Sem armazenamento persistente de áudio/texto; sessões expiram (`SESSION_TTL_MS`).
- Logs redigem `authorization` e `audioBase64`.
- UI exibe aviso de que áudio é enviado a serviços de nuvem.
