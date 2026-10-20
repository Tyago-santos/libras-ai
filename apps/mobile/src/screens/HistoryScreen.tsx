import React from "react";
import styled from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { StatusChip } from "../components/StatusChip";
import { useSessionStore, type UtteranceItem } from "../features/session/store";

/**
 * Tela Histórico (Stitch: Translation History).
 * Sessões e trechos ficam em memória no app (§11: sem histórico persistente
 * no MVP — dados são descartados ao reiniciar).
 */

const Screen = styled.View`
  flex: 1;
  background: ${(p) => p.theme.colors.canvas};
`;

const Scroll = styled.ScrollView`
  flex: 1;
  padding: 0 ${(p) => p.theme.spacing.md}px ${(p) => p.theme.spacing.lg}px;
`;

const SectionTitle = styled.Text`
  font-family: ${(p) => p.theme.typography.headlineSm.fontFamily};
  font-size: 18px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textHigh};
  margin: ${(p) => p.theme.spacing.sm}px 0;
`;

const Card = styled.View`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radii.card}px;
  padding: ${(p) => p.theme.spacing.md}px;
  margin-bottom: ${(p) => p.theme.spacing.sm}px;
`;

const CardHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${(p) => p.theme.spacing.xs}px;
`;

const CardTitle = styled.Text`
  font-family: ${(p) => p.theme.typography.labelLg.fontFamily};
  font-size: 15px;
  color: ${(p) => p.theme.colors.textHigh};
`;

const CardMeta = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 13px;
  color: ${(p) => p.theme.colors.textMedium};
`;

const UtteranceRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${(p) => p.theme.spacing.sm}px;
  padding: ${(p) => p.theme.spacing.sm}px 0;
  border-top: 1px solid ${(p) => p.theme.colors.border};
`;

const UtteranceText = styled.Text`
  flex: 1;
  font-family: ${(p) => p.theme.typography.bodyMd.fontFamily};
  font-size: 15px;
  line-height: 22px;
  color: ${(p) => p.theme.colors.textHigh};
`;

const EmptyState = styled.View`
  align-items: center;
  padding: ${(p) => p.theme.spacing.xl}px;
  gap: ${(p) => p.theme.spacing.sm}px;
`;

const EmptyTitle = styled.Text`
  font-family: ${(p) => p.theme.typography.headlineSm.fontFamily};
  font-size: 18px;
  color: ${(p) => p.theme.colors.textHigh};
`;

const EmptyText = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  color: ${(p) => p.theme.colors.textMedium};
`;

/** Estado do trecho → chip de status. */
function utteranceChip(item: UtteranceItem): { label: string; tone: "neutral" | "primary" | "success" | "warning" | "error" } {
  switch (item.status) {
    case "done":
      return { label: "Sinalizado", tone: "success" };
    case "signing":
      return { label: "Sinalizando", tone: "primary" };
    case "ready":
      return { label: "Pronto", tone: "primary" };
    case "translating":
      return { label: "Traduzindo", tone: "warning" };
    case "unsupported":
      return { label: "Sem sinal", tone: "warning" };
    default:
      return { label: "Falhou", tone: "error" };
  }
}

export function HistoryScreen(): React.JSX.Element {
  const utterances = useSessionStore((s) => s.utterances);
  const sessionLabel = useSessionStore((s) => s.sessionLabel);
  const history = useSessionStore((s) => s.history);

  return (
    <Screen>
      <Header showSettingsAction={false} />
      <Scroll contentContainerStyle={{ paddingBottom: 24 }}>
        <SectionTitle>Sessão atual</SectionTitle>
        {utterances.length === 0 ? (
          <Card>
            <CardMeta>Nenhum trecho nesta sessão ainda. Fale ou digite uma frase para começar.</CardMeta>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{sessionLabel ?? "Sessão"}</CardTitle>
              <StatusChip tone="neutral" icon="fact-check" label={`${utterances.length} trechos`} />
            </CardHeader>
            {utterances.map((item) => {
              const chip = utteranceChip(item);
              return (
                <UtteranceRow key={item.id}>
                  <MaterialIcons
                    name={
                      item.status === "done" || item.status === "signing"
                        ? "check-circle"
                        : item.status === "failed"
                          ? "error-outline"
                          : "schedule"
                    }
                    size={18}
                    color={
                      chip.tone === "success"
                        ? "#16845B"
                        : chip.tone === "error"
                          ? "#C62828"
                          : chip.tone === "warning"
                            ? "#B7791F"
                            : "#246BFD"
                    }
                  />
                  <UtteranceText>{item.text}</UtteranceText>
                  <StatusChip tone={chip.tone} label={chip.label} icon={undefined} />
                </UtteranceRow>
              );
            })}
          </Card>
        )}

        <SectionTitle>Sessões anteriores</SectionTitle>
        {history.length === 0 ? (
          <EmptyState>
            <MaterialIcons name="history" size={48} color="#B8C7EA" />
            <EmptyTitle>Nenhuma sessão encerrada</EmptyTitle>
            <EmptyText>
              Ao encerrar uma sessão, ela aparece aqui com a contagem de trechos e a latência
              média. O histórico vive apenas na memória do app.
            </EmptyText>
          </EmptyState>
        ) : (
          history.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <CardTitle>{entry.label}</CardTitle>
                <StatusChip
                  tone="success"
                  icon="fact-check"
                  label={`${entry.utterances} trechos`}
                />
              </CardHeader>
              <CardMeta>
                Latência
                {entry.medianMs !== undefined
                  ? ` · mediana ${(entry.medianMs / 1000).toFixed(1)}s`
                  : ""}
                {entry.p95Ms !== undefined ? ` · p95 ${(entry.p95Ms / 1000).toFixed(1)}s` : ""}
              </CardMeta>
            </Card>
          ))
        )}
      </Scroll>
    </Screen>
  );
}
