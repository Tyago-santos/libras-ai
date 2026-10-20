import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components/native";
import Svg, { Circle, Ellipse, G, Line, Rect } from "react-native-svg";

/**
 * Avatar simulado (PoC) — reproduz a glosa token a token.
 *
 * Quando a API real do VLibras não devolve vídeo (credencial Conecta ausente),
 * este avatar reproduz a sequência de sinais da glosa com poses determinísticas
 * por token. A UI sinaliza claramente que é uma simulação (§7: não representar
 * simulação como tradução oficial).
 */

const TOKEN_BASE_MS = 650;
const TICK_MS = 50;

export interface AvatarPose {
  leftArm: number; // graus
  rightArm: number;
  leftElbow: number;
  rightElbow: number;
  raisedBrows: boolean;
  lean: number; // -1..1
}

/** Pose determinística a partir do token (mesmo token → mesma pose). */
function poseForToken(token: string): AvatarPose {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  const grammatical = /^\[.+\]$/.test(token); // marcador facial da glosa
  const leftArm = 20 + (hash % 7) * 12; // 20..92
  const rightArm = 20 + ((hash >> 3) % 7) * 12;
  const leftElbow = 15 + ((hash >> 6) % 5) * 10;
  const rightElbow = 15 + ((hash >> 9) % 5) * 10;
  const lean = ((hash >> 12) % 5) - 2; // -2..2
  return {
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    raisedBrows: grammatical,
    lean: lean / 4,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpPose(a: AvatarPose, b: AvatarPose, t: number): AvatarPose {
  return {
    leftArm: lerp(a.leftArm, b.leftArm, t),
    rightArm: lerp(a.rightArm, b.rightArm, t),
    leftElbow: lerp(a.leftElbow, b.leftElbow, t),
    rightElbow: lerp(a.rightElbow, b.rightElbow, t),
    raisedBrows: t < 0.5 ? a.raisedBrows : b.raisedBrows,
    lean: lerp(a.lean, b.lean, t),
  };
}

const IDLE_POSE: AvatarPose = {
  leftArm: 24,
  rightArm: 24,
  leftElbow: 12,
  rightElbow: 12,
  raisedBrows: false,
  lean: 0,
};

const Viewport = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const TokenBadge = styled.View`
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(23, 59, 87, 0.08);
`;

const TokenText = styled.Text`
  font-family: ${(p) => p.theme.typography.labelMd.fontFamily};
  font-size: 13px;
  color: ${(p) => p.theme.colors.brandDeep};
  text-align: center;
`;

interface Props {
  gloss: string;
  speed: number;
  onDone: () => void;
}

export function AvatarSimulation({ gloss, speed, onDone }: Props): React.JSX.Element {
  const tokens = useMemo(() => gloss.split(/\s+/).filter(Boolean), [gloss]);
  const [pose, setPose] = useState<AvatarPose>(IDLE_POSE);
  const [tokenIndex, setTokenIndex] = useState(0);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (tokens.length === 0) {
      onDoneRef.current();
      return;
    }

    const tokenMs = TOKEN_BASE_MS / Math.max(0.5, speed);
    let index = 0;
    let progress = 0; // 0..1 entre poses
    let current = poseForToken(tokens[0] as string);
    let previous = IDLE_POSE;
    setPose(current);
    setTokenIndex(0);

    const timer = setInterval(() => {
      progress += TICK_MS / tokenMs;
      if (progress >= 1) {
        progress = 0;
        index += 1;
        if (index >= tokens.length) {
          clearInterval(timer);
          setPose(IDLE_POSE);
          onDoneRef.current();
          return;
        }
        previous = current;
        current = poseForToken(tokens[index] as string);
        setTokenIndex(index);
      }
      setPose(lerpPose(previous, current, progress));
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [tokens, speed]);

  const armRotation = (angle: number, origin: { x: number; y: number }) =>
    `rotate(${angle} ${origin.x} ${origin.y})`;

  return (
    <Viewport>
      <Svg width="100%" height="100%" viewBox="0 0 200 240">
        {/* Chão do palco */}
        <Ellipse cx="100" cy="222" rx="76" ry="12" fill="#EDF2F7" />
        <Ellipse cx="100" cy="222" rx="52" ry="8" fill="#E2E8F0" />

        <G transform={`translate(${pose.lean * 6} 0)`}>
          {/* Cabeça */}
          <Circle cx="100" cy="58" r="26" fill="#2D3133" />
          {/* Sobrancelhas (marcador gramatical da glosa) */}
          <Line
            x1="86"
            y1={pose.raisedBrows ? 46 : 50}
            x2="94"
            y2={pose.raisedBrows ? 44 : 49}
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <Line
            x1="106"
            y1={pose.raisedBrows ? 44 : 49}
            x2="114"
            y2={pose.raisedBrows ? 46 : 50}
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Olhos */}
          <Circle cx="91" cy="57" r="3.4" fill="#FFFFFF" />
          <Circle cx="109" cy="57" r="3.4" fill="#FFFFFF" />
          {/* Boca */}
          <Line
            x1="94"
            y1="68"
            x2="106"
            y2="68"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Tronco */}
          <Rect x="80" y="88" width="40" height="66" rx="16" fill="#173B57" />

          {/* Braço esquerdo (ombro 82,100) */}
          <G transform={armRotation(pose.leftArm, { x: 82, y: 100 })}>
            <Line x1="82" y1="100" x2="82" y2="146" stroke="#246BFD" strokeWidth="10" strokeLinecap="round" />
            <G transform={armRotation(pose.leftElbow, { x: 82, y: 146 })}>
              <Line x1="82" y1="146" x2="82" y2="184" stroke="#246BFD" strokeWidth="9" strokeLinecap="round" />
              <Circle cx="82" cy="190" r="8" fill="#F2C9A0" />
            </G>
          </G>

          {/* Braço direito (ombro 118,100) */}
          <G transform={armRotation(-pose.rightArm, { x: 118, y: 100 })}>
            <Line x1="118" y1="100" x2="118" y2="146" stroke="#246BFD" strokeWidth="10" strokeLinecap="round" />
            <G transform={armRotation(-pose.rightElbow, { x: 118, y: 146 })}>
              <Line x1="118" y1="146" x2="118" y2="184" stroke="#246BFD" strokeWidth="9" strokeLinecap="round" />
              <Circle cx="118" cy="190" r="8" fill="#F2C9A0" />
            </G>
          </G>
        </G>
      </Svg>

      <TokenBadge accessibilityLiveRegion="polite">
        <TokenText>
          {tokens[tokenIndex] ?? ""}  ·  {Math.min(tokenIndex + 1, tokens.length)}/{tokens.length}
        </TokenText>
      </TokenBadge>
    </Viewport>
  );
}
