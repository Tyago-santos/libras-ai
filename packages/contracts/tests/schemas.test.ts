import { describe, expect, it } from "vitest";
import { createSessionRequestSchema, translationRequestSchema } from "../src/schemas";

describe("contracts", () => {
  it("aplica valores padrao da configuracao de sessao", () => {
    const parsed = createSessionRequestSchema.parse({});
    expect(parsed.config?.silenceMs).toBe(500);
    expect(parsed.config?.maxUtteranceChars).toBe(220);
    expect(parsed.config?.maxQueueSize).toBe(10);
  });

  it("rejeita traducao sem texto", () => {
    const result = translationRequestSchema.safeParse({ sessionId: "s", sequence: 1, text: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita silencio fora do intervalo permitido", () => {
    const result = createSessionRequestSchema.safeParse({ config: { silenceMs: 50 } });
    expect(result.success).toBe(false);
  });
});
