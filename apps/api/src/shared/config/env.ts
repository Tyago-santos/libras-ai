import { z } from "zod";

/**
 * Configuração do backend por variáveis de ambiente (.env).
 * Nenhuma chave permanente é exposta ao aplicativo (§8 da spec).
 */

// Carrega .env com a API nativa do Node (>=20.12) — sem dependência de dotenv.
// Procura na raiz do workspace e no diretório de execução.
for (const candidate of [".env", "../../.env", "../.env"]) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch {
    // arquivo inexistente — segue com defaults
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // --- VLibras (verificados na prova de conceito em 2026-10-20) -------------
  /** Tradução PT -> glosa. Funciona sem autenticação. */
  VLIBRAS_TRANSLATE_URL: z.string().url().default("https://traducao2.vlibras.gov.br/translate"),
  /** Dicionário oficial de sinais (trie) — valida tokens da glosa. */
  VLIBRAS_DICTIONARY_URL: z
    .string()
    .url()
    .default("https://dicionario2-dth.vlibras.gov.br/signs?version=2018.3.1"),
  /** Geração de vídeo do avatar. Exige credencial Conecta (retorna 401 sem token). */
  VLIBRAS_VIDEO_BASE_URL: z.string().url().default("https://traducao2.vlibras.gov.br"),
  /** Bearer token Conecta. Sem ele, o backend usa a simulação de animação no app. */
  VLIBRAS_API_TOKEN: z.string().optional().default(""),

  // --- Transcrição de voz ---------------------------------------------------
  /** mock: sem chaves, frases simuladas. gemini: transcrição real de áudio. */
  SPEECH_PROVIDER: z.enum(["mock", "gemini"]).default("mock"),
  GEMINI_API_KEY: z.string().optional().default(""),
  /** Chaves extras separadas por vírgula — rotação quando a principal esgota cota. */
  GEMINI_API_KEY_FALLBACKS: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  /** Em desenvolvimento, se o provider real falhar, cai para o mock. */
  SPEECH_FALLBACK_MOCK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // --- Filas (§6) -----------------------------------------------------------
  /** Processamento sequencial por sessão; concorrência vale entre sessões. */
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4),
  QUEUE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  /** Política de atraso: quando as pendentes atingem o limite, combina trechos. */
  QUEUE_MAX_PENDING_PER_SESSION: z.coerce.number().int().min(2).max(50).default(10),

  // --- Sessões e limites ----------------------------------------------------
  SESSION_TTL_MS: z.coerce.number().int().min(30_000).default(60 * 60_000),
  TRANSLATE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  VIDEO_POLL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  /** URL base que o app usa para chamar este backend (proxy de animações). */
  PUBLIC_BASE_URL: z.string().url().optional().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
