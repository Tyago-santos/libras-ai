import React from "react";
import styled from "styled-components/native";
import { AvatarViewport } from "../components/AvatarViewport";
import { Banner } from "../components/Banner";
import { Header } from "../components/Header";
import { MicButton } from "../components/MicButton";
import { StatusChip } from "../components/StatusChip";
import { TextComposer } from "../components/TextComposer";
import { TranscriptionCard } from "../components/TranscriptionCard";
import { useSessionStore, type ViewPhase } from "../features/session/store";

/**
 * Tela Traduzir (Stitch: Translation Workspace).
 * Estados conforme §10: inactive, listening, transcribing,
 * awaiting-translation, translating, signing, delayed, error, ended.
 */

const Screen = styled.View`
  flex: 1;
  background: ${(p) => p.theme.colors.canvas};
`;

const Body = styled.View`
  flex: 1;
  padding: 0 ${(p) => p.theme.spacing.md}px ${(p) => p.theme.spacing.md}px;
  gap: ${(p) => p.theme.spacing.sm}px;
`;

const StatusRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.spacing.sm}px;
  flex-wrap: wrap;
  margin-bottom: ${(p) => p.theme.spacing.xs}px;
`;

const AvatarBox = styled.View`
  min-height: 240px;
  flex: 1;
`;

const ComposerBox = styled.View`
  margin-top: ${(p) => p.theme.spacing.xs}px;
`;

/** Rótulos de fase no português da UI. */
const PHASE_LABEL: Record<ViewPhase, { label: string; tone: "neutral" | "primary" | "success" | "warning" | "error" }> = {
  inactive: { label: "Pronto para ouvir", tone: "neutral" },
  listening: { label: "Ouvindo", tone: "primary" },
  transcribing: { label: "Transcrevendo", tone: "primary" },
  "awaiting-translation": { label: "Trecho confirmado", tone: "primary" },
  translating: { label: "Traduzindo", tone: "warning" },
  signing: { label: "Sinalizando", tone: "success" },
  delayed: { label: "Fila acumulando", tone: "warning" },
  error: { label: "Erro", tone: "error" },
  ended: { label: "Sessão encerrada", tone: "neutral" },
};

const MIC_HINT: Partial<Record<ViewPhase, string>> = {
  inactive: "Toque para começar a ouvir",
  ended: "Toque para iniciar uma nova sessão",
};

interface Props {
  onPressSettings: () => void;
}

export function TranslateScreen({ onPressSettings }: Props): React.JSX.Element {
  const phase = useSessionStore((s) => s.phase);
  const partialText = useSessionStore((s) => s.partialText);
  const lastLatencyMs = useSessionStore((s) => s.lastLatencyMs);
  const error = useSessionStore((s) => s.error);
  const busy = useSessionStore((s) => s.busy);
  const pendingCount = useSessionStore((s) => s.pendingCount());
  const startListening = useSessionStore((s) => s.startListening);
  const stopListening = useSessionStore((s) => s.stopListening);
  const sendText = useSessionStore((s) => s.sendText);
  const clearError = useSessionStore((s) => s.clearError);

  const isListening = phase === "listening" || phase === "transcribing";
  const isSessionOver = phase === "ended";
  const phaseInfo = PHASE_LABEL[phase];

  const handleMic = () => {
    if (isListening) void stopListening();
    else void startListening();
  };

  return (
    <Screen>
      <Header onPressSettings={onPressSettings} />
      <Body>
        <StatusRow accessibilityLiveRegion="polite">
          <StatusChip tone={phaseInfo.tone} label={phaseInfo.label} />
          {pendingCount > 0 ? (
            <StatusChip tone="neutral" icon="queue" label={`${pendingCount} na fila`} />
          ) : null}
        </StatusRow>

        {error ? (
          <Banner
            tone={error.code === "PERMISSION_DENIED" ? "error" : "warning"}
            message={error.message}
            actionLabel={error.code === "PERMISSION_DENIED" ? "Abrir ajustes" : "Dispensar"}
            onAction={error.code === "PERMISSION_DENIED" ? onPressSettings : clearError}
          />
        ) : null}

        <AvatarBox>
          <AvatarViewport />
        </AvatarBox>

        <TranscriptionCard
          partialText={partialText}
          isListening={isListening}
          latencyMs={lastLatencyMs}
        />

        <MicButton
          listening={isListening}
          busy={busy}
          error={phase === "error"}
          hint={isSessionOver ? MIC_HINT.ended : MIC_HINT.inactive}
          onPress={handleMic}
        />

        <ComposerBox>
          <TextComposer disabled={busy} onSend={(text) => void sendText(text)} />
        </ComposerBox>
      </Body>
    </Screen>
  );
}
