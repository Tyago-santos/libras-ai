import React, { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import styled from "styled-components/native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { AvatarSimulation } from "./AvatarSimulation";
import { VideoAnimationPlayer } from "./VideoAnimationPlayer";
import { StatusChip } from "./StatusChip";
import { useSessionStore, type UtteranceItem } from "../features/session/store";

/**
 * Viewport do avatar (Stitch: Avatar Translation Viewport).
 *
 * Orquestra a reprodução da fila de animação (§6.2): nunca sobrepõe
 * animações — só inicia a próxima quando a atual termina (`onDone`).
 * Reproduz vídeo real quando disponível; caso contrário, simulação local
 * com sinalização explícita na UI (§7).
 */

const Frame = styled.View`
  flex: 1;
  border-radius: ${(p) => p.theme.radii.card}px;
  overflow: hidden;
  background: ${(p) => p.theme.colors.surfaceAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
`;

const Content = styled.View`
  flex: 1;
`;

const Overlay = styled.View`
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
  padding: ${(p) => p.theme.spacing.lg}px;
  gap: ${(p) => p.theme.spacing.sm}px;
`;

const OverlayTitle = styled.Text`
  font-family: ${(p) => p.theme.typography.headlineSm.fontFamily};
  font-size: 18px;
  color: ${(p) => p.theme.colors.textHigh};
  text-align: center;
`;

const OverlayText = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 14px;
  line-height: 20px;
  color: ${(p) => p.theme.colors.textMedium};
  text-align: center;
`;

const TopBar = styled.View`
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
`;

const ControlRow = styled.View`
  position: absolute;
  bottom: 10px;
  right: 10px;
  flex-direction: row;
  gap: 8px;
  z-index: 2;
`;

const ControlButton = styled.TouchableOpacity`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(23, 59, 87, 0.1);
`;

const Caption = styled.View`
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 64px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(23, 59, 87, 0.08);
`;

const CaptionText = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: 13px;
  line-height: 18px;
  color: ${(p) => p.theme.colors.brandDeep};
`;

function IdleState(): React.JSX.Element {
  return (
    <Overlay>
      <MaterialIcons name="accessibility-new" size={64} color="#B8C7EA" />
      <OverlayTitle>Pronto para ouvir</OverlayTitle>
      <OverlayText>
        Toque no botão de microfone e fale. O avatar vai sinalizar cada trecho confirmado, na ordem
        da conversa.
      </OverlayText>
    </Overlay>
  );
}

function TranslatingState(): React.JSX.Element {
  return (
    <Overlay accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color="#246BFD" />
      <OverlayTitle>Traduzindo…</OverlayTitle>
      <OverlayText>Seu trecho está na fila de tradução para Libras.</OverlayText>
    </Overlay>
  );
}

function UnsupportedState({ item }: { item: UtteranceItem }): React.JSX.Element {
  return (
    <Overlay accessibilityLiveRegion="polite">
      <MaterialIcons name="visibility-off" size={48} color="#B7791F" />
      <OverlayTitle>Trecho sem animação</OverlayTitle>
      <OverlayText>
        O VLibras não possui glosa para: {item.unsupportedTokens?.join(", ") || item.text}.
        {"\n"}O texto transcrito continua disponível abaixo.
      </OverlayText>
    </Overlay>
  );
}

function FailedState(): React.JSX.Element {
  return (
    <Overlay accessibilityLiveRegion="polite">
      <MaterialIcons name="error-outline" size={48} color="#C62828" />
      <OverlayTitle>Falha na tradução</OverlayTitle>
      <OverlayText>Não foi possível traduzir este trecho. Continue falando — a sessão segue.</OverlayText>
    </Overlay>
  );
}

export function AvatarViewport(): React.JSX.Element {
  const displayItem = useSessionStore((s) => s.displayItem());
  const playbackSpeed = useSessionStore((s) => s.playbackSpeed);
  const phase = useSessionStore((s) => s.phase);
  const onSignStart = useSessionStore((s) => s.onSignStart);
  const onSignComplete = useSessionStore((s) => s.onSignComplete);
  const replayCurrent = useSessionStore((s) => s.replayCurrent);
  const setPlaybackSpeed = useSessionStore((s) => s.setPlaybackSpeed);

  const signing = displayItem?.status === "signing" ? displayItem : undefined;
  const ready = displayItem?.status === "ready" ? displayItem : undefined;
  const translating = displayItem?.status === "translating" ? displayItem : undefined;

  // Pronto → assinando: marca o início (medição de latência §12).
  useEffect(() => {
    if (ready) onSignStart(ready.id);
  }, [ready, onSignStart]);

  const showVideo = signing?.animationSource === "vlibras-video" && signing.animationUrl;

  return (
    <Frame>
      <LinearGradient
        colors={["#F1F5FB", "#E6EDF8"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <Content>
        {signing ? (
          showVideo ? (
            <VideoAnimationPlayer
              key={signing.id}
              url={signing.animationUrl as string}
              onDone={() => onSignComplete(signing.id)}
            />
          ) : (
            <AvatarSimulation
              key={signing.id}
              gloss={signing.gloss ?? signing.text}
              speed={playbackSpeed}
              onDone={() => onSignComplete(signing.id)}
            />
          )
        ) : translating ? (
          <TranslatingState />
        ) : displayItem?.status === "unsupported" ? (
          <UnsupportedState item={displayItem} />
        ) : displayItem?.status === "failed" ? (
          <FailedState />
        ) : (
          <IdleState />
        )}
      </Content>

      <TopBar>
        {signing ? (
          <StatusChip
            tone="primary"
            icon={showVideo ? "videocam" : "accessibility-new"}
            label={showVideo ? "VLibras oficial" : "Avatar simulado"}
          />
        ) : translating ? (
          <StatusChip tone="warning" icon="sync" label="Traduzindo" />
        ) : (
          <StatusChip tone="neutral" icon="accessibility-new" label="Avatar" />
        )}
        {phase === "delayed" ? (
          <StatusChip tone="warning" icon="hourglass-bottom" label="Fila acumulando" />
        ) : null}
      </TopBar>

      {signing ? (
        <ControlRow>
          <ControlButton onPress={replayCurrent} accessibilityLabel="Repetir sinalização">
            <MaterialIcons name="replay" size={20} color="#173B57" />
          </ControlButton>
          <ControlButton
            onPress={() => setPlaybackSpeed(playbackSpeed >= 1.5 ? 0.75 : playbackSpeed + 0.25)}
            accessibilityLabel="Velocidade da animação"
          >
            <MaterialIcons name="speed" size={20} color="#173B57" />
          </ControlButton>
        </ControlRow>
      ) : null}

      {signing ? (
        <Caption accessibilityLiveRegion="polite">
          <CaptionText numberOfLines={2}>{signing.text}</CaptionText>
        </Caption>
      ) : null}

    </Frame>
  );
}
