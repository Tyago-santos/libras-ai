import { beforeEach, describe, expect, it } from "vitest";
import { translationQueue } from "../src/modules/translations/queue";
import type { QueueTask } from "../src/modules/translations/queue";

const ok = (task: QueueTask) =>
  Promise.resolve({ status: "ready" as const, fields: { gloss: `GLOSAS ${task.sequence}` } });

describe("Fila de tradução (§6.1)", () => {
  beforeEach(() => {
    translationQueue.reset();
    translationQueue.setProcessor(ok);
  });

  it("preserva a ordem da conversa (processamento sequencial por sessão)", async () => {
    const order: number[] = [];
    translationQueue.setProcessor((task) => {
      order.push(task.sequence);
      return Promise.resolve({ status: "ready" as const, fields: { gloss: "OK" } });
    });

    for (let i = 1; i <= 5; i += 1) {
      translationQueue.enqueue({ sessionId: "s1", sequence: i, text: `frase ${i}` });
    }
    await translationQueue.drainNow("s1");
    await new Promise((r) => setTimeout(r, 100));

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("evita duplicações por sessionId+sequence", () => {
    const a = translationQueue.enqueue({ sessionId: "s1", sequence: 1, text: "oi" });
    const b = translationQueue.enqueue({ sessionId: "s1", sequence: 1, text: "oi" });
    expect(b.task.id).toBe(a.task.id);
  });

  it("registra latência (espera + processamento + total)", async () => {
    const { task } = translationQueue.enqueue({ sessionId: "s1", sequence: 1, text: "oi" });
    await translationQueue.drainNow("s1");
    await new Promise((r) => setTimeout(r, 60));

    const done = translationQueue.get(task.id);
    expect(done?.status).toBe("ready");
    expect(done?.result?.latency?.totalMs).toBeGreaterThanOrEqual(0);
    expect(done?.result?.latency?.queueWaitMs).toBeGreaterThanOrEqual(0);
  });

  it("retentativa em falha transitória e falha definitiva após esgotar tentativas", async () => {
    let calls = 0;
    translationQueue.setProcessor(() => {
      calls += 1;
      return Promise.reject(new Error("boom"));
    });

    const { task } = translationQueue.enqueue({ sessionId: "s1", sequence: 1, text: "oi" });
    await translationQueue.drainNow("s1");
    await new Promise((r) => setTimeout(r, 1500));

    const done = translationQueue.get(task.id);
    expect(done?.status).toBe("failed");
    expect(calls).toBeGreaterThanOrEqual(2); // tentou de novo antes de falhar
  });

  it("cancela pendentes ao encerrar a sessão (§6.2 / DELETE /sessions)", () => {
    // processador lento: 1ª tarefa fica "processing", demais ficam "pending"
    translationQueue.setProcessor(() => new Promise(() => {}));
    translationQueue.enqueue({ sessionId: "s1", sequence: 1, text: "a" });
    translationQueue.enqueue({ sessionId: "s1", sequence: 2, text: "b" });

    const cancelled = translationQueue.cancelSession("s1");
    expect(cancelled).toBeGreaterThanOrEqual(1);
    const stillPending = translationQueue
      .listBySession("s1")
      .filter((t) => t.status === "pending");
    expect(stillPending).toHaveLength(0);
    const cancelledTask = translationQueue.getBySessionAndSequence("s1", 2);
    expect(cancelledTask?.errorCode).toBe("SESSION_CANCELLED");
  });

  it("política de atraso: combina trechos ao ultrapassar o limite (§6.3)", () => {
    translationQueue.setProcessor(() => new Promise(() => {})); // nunca resolve
    for (let i = 1; i <= 3; i += 1) {
      translationQueue.enqueue({ sessionId: "s1", sequence: i, text: `frase ${i}` }, 3);
    }
    // 4ª tarefa: backlog (processing + pendentes) = 3 = limite → combina pendentes
    const { merged } = translationQueue.enqueue(
      { sessionId: "s1", sequence: 4, text: "frase 4" },
      3,
    );
    expect(merged.length).toBeGreaterThanOrEqual(1);
    expect(translationQueue.isOverloaded("s1")).toBe(true);

    // Trechos pendentes combinados linguisticamente na ordem original:
    const absorved = translationQueue.getBySessionAndSequence("s1", 2);
    expect(absorved?.text).toContain("frase 3");
    expect(absorved?.merged).toBe(true);
    // Nada descartado silenciosamente: os combinados ficam marcados (§6.3)
    const combined = translationQueue.getBySessionAndSequence("s1", 3);
    expect(combined?.status).toBe("failed");
    expect(combined?.errorCode).toBe("MERGED_INTO_PREVIOUS");
  });

  it("lista em ordem por sequência (alimenta fila de animação §6.2)", () => {
    translationQueue.setProcessor(() => new Promise(() => {}));
    translationQueue.enqueue({ sessionId: "s1", sequence: 3, text: "c" });
    translationQueue.enqueue({ sessionId: "s1", sequence: 1, text: "a" });
    translationQueue.enqueue({ sessionId: "s1", sequence: 2, text: "b" });

    const list = translationQueue.listBySession("s1");
    expect(list.map((t) => t.sequence)).toEqual([1, 2, 3]);
  });
});
