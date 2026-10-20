import React from "react";
import styled from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusChip } from "./StatusChip";

/**
 * Cartão "Você disse:" (Stitch: Real-Time Transcription Card).
 * Mostra o texto parcial em tempo real; trechos confirmados vão para a lista.
 */

const Card = styled.View`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radii.card}px;
  padding: ${(p) => p.theme.spacing.md}px;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${(p) => p.theme.spacing.sm}px;
`;

const HeaderLabel = styled.Text`
  font-family: ${(p) => p.theme.typography.labelSm.fontFamily};
  font-size: 12px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textMuted};
`;

const PartialText = styled.Text<{ streaming: boolean }>`
  font-family: ${(p) => p.theme.typography.bodyLg.fontFamily};
  font-size: 18px;
  line-height: 28px;
  color: ${(p) => p.theme.colors.textHigh};
  ${(p) =>
    p.streaming &&
    `
    border-bottom-width: 2px;
    border-bottom-color: ${p.theme.colors.primary};
    padding-bottom: 4px;
    align-self: flex-start;
  `}
`;

const EmptyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const EmptyText = styled.Text`
  font-family: ${(p) => p.theme.typography.bodyLg.fontFamily};
  font-size: 18px;
  color: ${(p) => p.theme.colors.textMuted};
`;

const TipRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-top: ${(p) => p.theme.spacing.sm}px;
  padding-top: ${(p) => p.theme.spacing.sm}px;
  border-top: 1px dashed ${(p) => p.theme.colors.border};
`;

const TipText = styled.Text`
  flex: 1;
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 14px;
  line-height: 20px;
  color: ${(p) => p.theme.colors.textMedium};
`;

interface Props {
  partialText: string;
  isListening: boolean;
  latencyMs?: number;
}

export function TranscriptionCard({ partialText, isListening, latencyMs }: Props): React.JSX.Element {
  const streaming = partialText.length > 0;
  return (
    <Card accessibilityRole="summary">
      <HeaderRow>
        <HeaderLabel>Você disse:</HeaderLabel>
        {typeof latencyMs === "number" ? (
          <StatusChip tone="success" label={`latência ${(latencyMs / 1000).toFixed(1)}s`} icon="bolt" />
        ) : null}
      </HeaderRow>

      {streaming ? (
        <PartialText streaming={isListening}>{partialText}</PartialText>
      ) : (
        <EmptyRow>
          <MaterialIcons name="graphic-eq" size={20} color="#667085" />
          <EmptyText>{isListening ? "Ouvindo…" : "Aguardando voz"}</EmptyText>
        </EmptyRow>
      )}

      <TipRow>
        <MaterialIcons name="lightbulb-outline" size={16} color="#B7791F" />
        <TipText>
          Fale frases naturais e em ritmo cadenciado para melhor tradução. O app agrupa a fala em
          trechos pelos seus pausos naturais.
        </TipText>
      </TipRow>
    </Card>
  );
}
