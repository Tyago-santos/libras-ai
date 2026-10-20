import { randomBytes, randomUUID } from "node:crypto";

/**
 * Identificadores não previsíveis (§11 da spec).
 * - Sessões usam UUID v4.
 * - Tarefas usam UUID v4 com prefixo legível para depuração.
 */
export const newSessionId = (): string => randomUUID();

export const newTaskId = (): string => `tr_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

export const newUtteranceId = (): string => `ut_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

/** Fallback curto e não previsível para ambientes sem crypto forte. */
export const shortToken = (): string => randomBytes(16).toString("hex");
