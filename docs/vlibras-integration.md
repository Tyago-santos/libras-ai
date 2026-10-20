# Integração VLibras — resultados reais (PoC executado em 20-10-2026)

Este documento registra o que foi **verificado ao vivo** contra os serviços públicos do VLibras
(gov.br / MCID) e como o projeto usa cada capacidade.

## Endpoints verificados

### 1. Tradução PT → glosa — ✅ funciona sem autenticação

```
POST https://traducao2.vlibras.gov.br/translate
Content-Type: application/json

{"text": "Bom dia, tudo bem?"}
```

Resposta (200): glosa em texto, ex. `BOM_DIA TUDO_BEM [INTERROGAÇÃO]`.
Também observamos formato alternado JSON `{"traducao": "..."}` — o backend normaliza ambos
(`normalizeGloss`).

Uso no projeto: `apps/api/src/providers/vlibras/translate.ts` (com timeout e retries na fila).

### 2. Dicionário oficial de sinais — ✅ funciona sem autenticação

```
GET https://dicionario2-dth.vlibras.gov.br/signs?version=2018.3.1
```

Trie de palavras (~3,6 MB). O backend carrega em memória e usa para validar os tokens da glosa:

- token com marcação gramatical (`[INTERROGAÇÃO]`, `[PERGUNTA]`…) → **suportado** (sinal facial);
- token existente no dicionário → suportado;
- token inexistente → listado em `unsupportedTokens`; o resultado vira `status: "unsupported"`
  e o app mostra "Trecho sem animação" mantendo o texto (§7: nunca fingir que sinalizou).

### 3. Geração de vídeo do avatar — ⚠️ requer credencial Conecta (OAuth)

```
POST https://traducao2.vlibras.gov.br/video       → 401 Unauthorized (sem token)
```

O fluxo oficial (swagger Conecta, `vlibras-v3-1`) é:

1. `POST /video` com `Authorization: Bearer <token>` → id do vídeo;
2. `GET /video/status?id=…` até `isReady`;
3. `GET /video/file?id=…` → arquivo MP4.

O gateway público `www.gov.br/translate?text=…` retorna 400 (não é um substituto).

**Como ativar no projeto:** obtenha um token OAuth no Conecta (catálogo MCID) e defina
`VLIBRAS_API_TOKEN` no backend. Com o token, o pipeline passa a:

- chamar `POST /video` após a tradução (com polling de status dentro de `VIDEO_POLL_TIMEOUT_MS`);
- responder `animationSource: "vlibras-video"` + `animationUrl: /api/animations/:id`;
- o backend serve o MP4 via proxy (`modules/avatar/routes`) com o token no header — o app nunca
  vê credenciais (§8).

Sem o token (estado atual do MVP), o backend responde `animationSource: "simulation"` e o app
reproduz a **glosa token a token em um avatar simulado** (`AvatarSimulation`), com a UI exibindo
o selo "Avatar simulado" — simulados nunca são apresentados como tradução oficial (§7).

## Decisões derivadas do PoC

| Tema | Decisão |
| --- | --- |
| Credenciais | Nenhuma chave é necessária para traduzir; token só habilita o vídeo. |
| Contrato | Gloss chega como texto; tokens `[...]` são marcadores gramaticais, não palavras. |
| Disponibilidade | Provedores têm timeout (10 s tradução, 15 s vídeo) + retry na fila + estados `failed` explícitos. |
| Fallback | Falha do VLibras não derruba a sessão: trecho marcado e captura continua (§14). |

## Referências

- Swagger oficial (Conecta): `https://www.gov.br/conecta/catalogo/apis/vlibras/vlibras-v3-1-swagger-artesanal-json/swagger.json`
- VLibras: https://www.vlibras.gov.br · Projeto MCID: https://www.mcid.gov.br
