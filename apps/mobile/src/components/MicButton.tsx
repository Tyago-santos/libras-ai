import React, { useEffect, useRef } from "react";
import { Animated, Easing, ActivityIndicator } from "react-native";
import styled from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";

/**
 * Botão principal de voz (Stitch: 72dp circular, ondas concêntricas
 * enquanto escuta, estado de erro/ocupado).
 */

const Wrapper = styled.View`
  align-items: center;
  justify-content: center;
  padding: ${(p) => p.theme.spacing.sm}px;
`;

const Ripple = styled(Animated.View)`
  position: absolute;
  width: 72px;
  height: 72px;
  border-radius: 36px;
  background: ${(p) => p.theme.colors.primary};
`;

const Circle = styled.TouchableOpacity<{ listening: boolean; error: boolean }>`
  width: 72px;
  height: 72px;
  border-radius: 36px;
  align-items: center;
  justify-content: center;
  background: ${(p) => (p.error ? p.theme.colors.error : p.theme.colors.primary)};
  elevation: 4;
  shadow-color: #172b3a;
  shadow-opacity: 0.18;
  shadow-radius: 12px;
  shadow-offset:
    0px
    6px;
`;

const Hint = styled.Text`
  margin-top: ${(p) => p.theme.spacing.sm}px;
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: ${(p) => p.theme.typography.bodySm.fontSize}px;
  color: ${(p) => p.theme.colors.textMuted};
  text-align: center;
`;

interface Props {
  listening: boolean;
  busy?: boolean;
  error?: boolean;
  hint?: string;
  onPress: () => void;
}

export function MicButton({
  listening,
  busy = false,
  error = false,
  hint,
  onPress,
}: Props): React.JSX.Element {
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      ripple1.setValue(0);
      ripple2.setValue(0);
      return;
    }
    const loop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const a = loop(ripple1, 0);
    const b = loop(ripple2, 800);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [listening, ripple1, ripple2]);

  const scale = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });

  return (
    <Wrapper>
      {listening ? (
        <>
          <Ripple style={{ transform: [{ scale: scale(ripple1) }], opacity: opacity(ripple1) }} />
          <Ripple style={{ transform: [{ scale: scale(ripple2) }], opacity: opacity(ripple2) }} />
        </>
      ) : null}
      <Circle
        listening={listening}
        error={error}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={listening ? "Parar de ouvir" : "Começar a ouvir"}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <MaterialIcons
            name={listening ? "stop" : "mic"}
            size={32}
            color="#FFFFFF"
          />
        )}
      </Circle>
      {hint ? <Hint>{hint}</Hint> : null}
    </Wrapper>
  );
}
