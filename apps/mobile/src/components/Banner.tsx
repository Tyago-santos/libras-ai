import React from "react";
import styled, { css } from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";

/** Banner de aviso/erro (§10: aviso de atraso ou falha; §14: sem travar). */

type Tone = "error" | "warning" | "info";

const Box = styled.View<{ tone: Tone }>`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.spacing.sm}px;
  padding: ${(p) => p.theme.spacing.sm}px ${(p) => p.theme.spacing.md}px;
  border-radius: ${(p) => p.theme.radii.md}px;
  ${(p) => {
    const c = p.theme.colors;
    switch (p.tone) {
      case "error":
        return css`background: ${c.errorContainer};`;
      case "warning":
        return css`background: ${c.warningContainer};`;
      default:
        return css`background: ${c.infoContainer};`;
    }
  }}
`;

const Message = styled.Text<{ tone: Tone }>`
  flex: 1;
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: ${(p) => p.theme.typography.bodySm.fontSize}px;
  line-height: 20px;
  color: ${(p) => (p.tone === "error" ? p.theme.colors.errorText : p.theme.colors.textHigh)};
`;

const Action = styled.TouchableOpacity`
  min-height: 32px;
  justify-content: center;
  padding: 0 10px;
  border-radius: ${(p) => p.theme.radii.pill}px;
  background: rgba(255, 255, 255, 0.7);
`;

const ActionText = styled.Text`
  font-family: ${(p) => p.theme.typography.labelMd.fontFamily};
  font-size: 13px;
  color: ${(p) => p.theme.colors.brandDeep};
`;

const ICON: Record<Tone, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  error: "error-outline",
  warning: "priority-high",
  info: "info-outline",
};

const TONE_COLOR: Record<Tone, string> = {
  error: "#C62828",
  warning: "#B7791F",
  info: "#173B57",
};

interface Props {
  tone?: Tone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Banner({ tone = "info", message, actionLabel, onAction }: Props): React.JSX.Element {
  return (
    <Box tone={tone} accessibilityRole="alert">
      <MaterialIcons name={ICON[tone]} size={18} color={TONE_COLOR[tone]} />
      <Message tone={tone}>{message}</Message>
      {actionLabel && onAction ? (
        <Action onPress={onAction} accessibilityRole="button">
          <ActionText>{actionLabel}</ActionText>
        </Action>
      ) : null}
    </Box>
  );
}
