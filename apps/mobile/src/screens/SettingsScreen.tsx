import React from "react";
import styled from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { StatusChip } from "../components/StatusChip";
import { Banner } from "../components/Banner";
import { useSessionStore } from "../features/session/store";
import { requestMicPermission } from "../features/speech/permissions";
import { API_URL } from "../lib/config";

/**
 * Tela Configurações (Stitch: Settings & Permission).
 * Ajustes da sessão (pausa para confirmação, velocidade), permissão de
 * microfone, status do backend e aviso de privacidade (§11/§13).
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

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${(p) => p.theme.spacing.sm}px;
  min-height: 48px;
`;

const RowLabel = styled.Text`
  flex: 1;
  font-family: ${(p) => p.theme.typography.bodyMd.fontFamily};
  font-size: 15px;
  color: ${(p) => p.theme.colors.textHigh};
`;

const RowValue = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 13px;
  color: ${(p) => p.theme.colors.textMedium};
`;

const OptionGroup = styled.View`
  flex-direction: row;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: ${(p) => p.theme.spacing.xs}px;
`;

const Option = styled.TouchableOpacity<{ selected: boolean }>`
  min-height: 40px;
  justify-content: center;
  padding: 0 14px;
  border-radius: ${(p) => p.theme.radii.pill}px;
  background: ${(p) => (p.selected ? p.theme.colors.primarySoft : p.theme.colors.surfaceAlt)};
  border: 1px solid ${(p) => (p.selected ? p.theme.colors.primary : p.theme.colors.border)};
`;

const OptionLabel = styled.Text<{ selected: boolean }>`
  font-family: ${(p) => p.theme.typography.labelMd.fontFamily};
  font-size: 14px;
  color: ${(p) => (p.selected ? p.theme.colors.primary : p.theme.colors.textMedium)};
`;

const Hint = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 13px;
  line-height: 18px;
  color: ${(p) => p.theme.colors.textMedium};
  margin-top: ${(p) => p.theme.spacing.xs}px;
`;

const SILENCE_OPTIONS = [300, 500, 700, 1000];
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function OptionButton({ label, selected, onPress }: OptionButtonProps): React.JSX.Element {
  return (
    <Option
      selected={selected}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <OptionLabel selected={selected}>{label}</OptionLabel>
    </Option>
  );
}

export function SettingsScreen(): React.JSX.Element {
  const micPermission = useSessionStore((s) => s.micPermission);
  const silenceMs = useSessionStore((s) => s.silenceMs);
  const playbackSpeed = useSessionStore((s) => s.playbackSpeed);
  const serverInfo = useSessionStore((s) => s.serverInfo);
  const setSilenceMs = useSessionStore((s) => s.setSilenceMs);
  const setPlaybackSpeed = useSessionStore((s) => s.setPlaybackSpeed);
  const initialize = useSessionStore((s) => s.initialize);

  const handleRequestPermission = async () => {
    await requestMicPermission();
    await initialize(); // atualiza o estado exibido
  };

  return (
    <Screen>
      <Header showSettingsAction={false} />
      <Scroll contentContainerStyle={{ paddingBottom: 24 }}>
        <SectionTitle>Microfone</SectionTitle>
        <Card>
          <Row>
            <RowLabel>Permissão de microfone</RowLabel>
            <StatusChip
              tone={micPermission === "granted" ? "success" : micPermission === "denied" ? "error" : "warning"}
              label={
                micPermission === "granted"
                  ? "Concedida"
                  : micPermission === "denied"
                    ? "Negada"
                    : "Não solicitada"
              }
            />
          </Row>
          {micPermission !== "granted" ? (
            <>
              <Hint>
                O Libras AI usa o microfone para transcrever sua fala. A permissão é solicitada
                apenas ao iniciar a escuta.
              </Hint>
              <OptionGroup>
                <OptionButton label="Permitir microfone" selected={false} onPress={() => void handleRequestPermission()} />
              </OptionGroup>
            </>
          ) : null}
        </Card>

        <SectionTitle>Tradução</SectionTitle>
        <Card>
          <RowLabel>Pausa para confirmar um trecho</RowLabel>
          <OptionGroup>
            {SILENCE_OPTIONS.map((ms) => (
              <OptionButton
                key={ms}
                label={`${(ms / 1000).toFixed(1)}s`}
                selected={silenceMs === ms}
                onPress={() => void setSilenceMs(ms)}
              />
            ))}
          </OptionGroup>
          <Hint>
            Quanto maior a pausa, mais frases longas o app confirma. Também confirmamos automaticamente
            no fim de frases (ponto, pergunta, exclamação).
          </Hint>
        </Card>

        <Card>
          <RowLabel>Velocidade do avatar</RowLabel>
          <OptionGroup>
            {SPEED_OPTIONS.map((speed) => (
              <OptionButton
                key={speed}
                label={`${speed}x`}
                selected={playbackSpeed === speed}
                onPress={() => setPlaybackSpeed(speed)}
              />
            ))}
          </OptionGroup>
          <Hint>Afeta apenas o avatar simulado; vídeos oficiais do VLibras usam a velocidade real.</Hint>
        </Card>

        <SectionTitle>Servidor</SectionTitle>
        <Card>
          <Row>
            <RowLabel>Backend</RowLabel>
            <RowValue numberOfLines={1}>{API_URL}</RowValue>
          </Row>
          <Row>
            <RowLabel>Provedor de voz</RowLabel>
            <StatusChip
              tone={serverInfo ? "success" : "error"}
              label={serverInfo ? serverInfo.speechProvider : "offline"}
            />
          </Row>
          <Row>
            <RowLabel>Dicionário VLibras</RowLabel>
            <StatusChip
              tone={serverInfo?.dictionaryLoaded ? "success" : "warning"}
              label={serverInfo?.dictionaryLoaded ? "carregado" : "não carregado"}
            />
          </Row>
          <Row>
            <RowLabel>Vídeo oficial do VLibras</RowLabel>
            <StatusChip
              tone={serverInfo?.videoEnabled ? "success" : "neutral"}
              label={serverInfo?.videoEnabled ? "ativado" : "simulação"}
            />
          </Row>
        </Card>

        <SectionTitle>Privacidade</SectionTitle>
        <Banner
          tone="info"
          message="Trechos de áudio são enviados ao backend deste app e, quando ativo, ao serviço de tradução VLibras (gov.br). Nenhum texto ou áudio fica armazenado: histórico vive só na memória do aparelho."
        />
      </Scroll>
    </Screen>
  );
}
