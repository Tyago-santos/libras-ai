import type { Session, SessionConfig } from "@libras-ai/contracts";
import { sessionConfigSchema } from "@libras-ai/contracts";
import { env } from "../../shared/config/env";
import { newSessionId } from "../../shared/lib/ids";

/** Armazenamento em memória de sessões (MVP — §3: fila em memória). */

export interface SessionRecord {
  id: string;
  state: "active" | "ended";
  label?: string;
  createdAt: string;
  config: SessionConfig;
  utterances: number;
  nextUtteranceSequence: number;
  expiresAt: number;
}

const sessions = new Map<string, SessionRecord>();

export const sessionStore = {
  create(label?: string, configOverrides?: Partial<SessionConfig>): SessionRecord {
    const config = sessionConfigSchema.parse({ ...configOverrides });
    const record: SessionRecord = {
      id: newSessionId(),
      state: "active",
      label,
      createdAt: new Date().toISOString(),
      config,
      utterances: 0,
      nextUtteranceSequence: 1,
      expiresAt: Date.now() + env.SESSION_TTL_MS,
    };
    sessions.set(record.id, record);
    return record;
  },

  get(id: string): SessionRecord | undefined {
    const rec = sessions.get(id);
    if (!rec) return undefined;
    if (rec.state === "active" && rec.expiresAt < Date.now()) {
      rec.state = "ended";
    }
    return rec;
  },

  end(id: string): SessionRecord | undefined {
    const rec = sessions.get(id);
    if (!rec) return undefined;
    rec.state = "ended";
    return rec;
  },

  toDomain(rec: SessionRecord, pendingTranslations: number): Session {
    return {
      id: rec.id,
      state: rec.state,
      createdAt: rec.createdAt,
      config: rec.config,
      stats: {
        utterances: rec.utterances,
        translations: rec.utterances,
        pendingTranslations,
      },
    };
  },

  /** Remove sessões expiradas periodicamente (§11: política de retenção). */
  sweep(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, rec] of sessions) {
      if (rec.expiresAt < now) {
        sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  },

  clear(): void {
    sessions.clear();
  },
};

/** Agenda a varredura de expiração. */
export function startSweeper(): NodeJS.Timeout {
  return setInterval(() => sessionStore.sweep(), 5 * 60_000).unref();
}
