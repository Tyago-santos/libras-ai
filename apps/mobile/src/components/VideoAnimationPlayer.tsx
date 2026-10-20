import React from "react";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import styled from "styled-components/native";

/**
 * Reprodutor do vídeo real do VLibras (animationSource = "vlibras-video").
 * O arquivo vem do backend via GET /api/animations/:id (proxy com token, §8).
 */

const Wrap = styled.View`
  flex: 1;
`;

const PlayerBox = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

interface Props {
  /** URL do vídeo (proxy do backend). */
  url: string;
  onDone: () => void;
}

export function VideoAnimationPlayer({ url, onDone }: Props): React.JSX.Element {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  // Disparado quando o vídeo termina → próxima animação da fila (§6.2).
  useEventListener(player, "playToEnd", onDone);

  return (
    <Wrap>
      <PlayerBox accessible accessibilityLabel="Avatar sinalizando em Libras">
        <VideoView player={player} contentFit="contain" nativeControls={false} />
      </PlayerBox>
    </Wrap>
  );
}
