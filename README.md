# Libras AI 🤟

Aplicativo Android (Expo + React Native + TypeScript) que ouve fala em português, agrupa a fala em
trechos naturais, traduz para Libras via **VLibras (gov.br)** e reproduz a sinalização em um avatar —
com backend próprio (Fastify) orquestrando transcrição, tradução e animação.

> MVP alinhado à spec: sem histórico persistente, sem backend próprio de contas, foco no fluxo
> fala → texto → glosa → animação com estados de UI claros (§10) e respeito a privacidade (§11).

## Estrutura (monorepo npm workspaces)

```
libras-ai/
├── apps/
│   ├── api/          # Backend Fastify (sessões, filas, VLibras, proxy de vídeo)
│   └── mobile/       # App Expo (UI com styled-components + tokens do Stitch)
└── packages/
    └── contracts/    # Schemas Zod compartilhados (API contrato)
```

## Rodando

### 1. Backend

```bash
cp .env.example apps/api/.env   # ajuste se quiser; os defaults funcionam (provedores mock/simulados)
npm install
npm run dev:api                 # http://localhost:3000
```

Health check: `GET http://localhost:3000/api/health`

### 2. App mobile

```bash
npm run dev:mobile              # inicia o Metro; leia o QR com Expo Go
```

- **Emulador Android**: funciona direto (o app usa `10.0.2.2` por padrão).
- **Aparelho físico**: rode `EXPO_PUBLIC_API_URL=http://SEU_IP:3000 npm run dev:mobile`.

### 3. Testes e tipos

```bash
npm run typecheck   # todos os workspaces (api, contracts, mobile)
npm test            # testes do backend + contratos
```

## Como funciona o fluxo

1. **Captura** — o app grava PCM contínuo (16 kHz mono), calcula a amplitude (VAD) e envia chunks
   WAV de ~2 s ao backend; pausas longas viram eventos `{ isSilence }` (§5).
2. **Frases** — o backend confirma trechos por: pontuação final, silêncio ≥ threshold (configurável)
   ou tamanho máximo (corta preservando coerência). Transcrições parciais nunca são traduzidas.
3. **Tradução** — trechos entram numa fila **sequencial por sessão** (ordem da conversa preservada).
   Se a fila atrasa, trechos são **combinados linguisticamente** (§6.3) — nunca descartados em silêncio.
4. **Avatar** — a glosa do VLibras é reproduzida por um avatar; sem sobreposição: só inicia a próxima
   animação quando a atual termina. Vídeo oficial do VLibras quando disponível (ver
   [docs/vlibras-integration.md](docs/vlibras-integration.md)); senão, simulação local sinalizada na UI.
5. **Latência** — o app mede fala→animação (§12) e exibe mediana/p95 nas métricas da sessão.

## Estado do MVP

| Recurso | Status |
| --- | --- |
| Tradução real PT→glosa (VLibras, sem credencial) | ✅ |
| Dicionário de sinais oficial (valida tokens da glosa) | ✅ |
| Vídeo oficial do avatar | ⚠️ requer `VLIBRAS_API_TOKEN` (Conecta); sem ele, simulação |
| Transcrição de voz | ⚠️ `mock` por padrão; `gemini` real com `GEMINI_API_KEY` |
| Fila + política de atraso + métricas | ✅ |
| UI completa (3 abas, estados §10, acessibilidade básica) | ✅ |
| Histórico persistente / contas | ❌ fora do escopo do MVP (§11) |

## Documentação

- [docs/architecture.md](docs/architecture.md) — módulos, filas, máquina de estados e contratos.
- [docs/vlibras-integration.md](docs/vlibras-integration.md) — PoC real dos endpoints do VLibras
  (executado em 20-10-2026) e como ativar o vídeo oficial.

## Privacidade (§11/§13)

Trechos de áudio vão do aparelho ao backend e, quando ativo, ao serviço VLibras (gov.br).
Nada fica armazenado: sessões expiram, histórico vive só na memória do app e os logs do backend
redigem conteúdo sensível.
