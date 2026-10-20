import React from "react";
import styled, { css } from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

/** Badge de status contextual (§10: estados + §6.3: indicador de atraso). */

type Tone = "neutral" | "primary" | "success" | "warning" | "error" | "info";

const Pill = styled.View<{ tone: Tone }>`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: ${(p) => p.theme.radii.pill}px;
  ${(p) => {
    const c = p.theme.colors;
    switch (p.tone) {
      case "primary":
        return css`background: ${c.primarySoft};`;
      case "success":
        return css`background: ${c.successContainer};`;
      case "warning":
        return css`background: ${c.warningContainer};`;
      case "error":
        return css`background: ${c.errorContainer};`;
      case "info":
        return css`background: ${c.infoContainer};`;
      default:
        return css`background: ${c.surfaceAlt}; border: 1px solid ${c.border};`;
    }
  }}
`;

const Label = styled.Text<{ tone: Tone }>`
  font-family: ${(p) => p.theme.typography.labelSm.fontFamily};
  font-size: ${(p) => p.theme.typography.labelSm.fontSize}px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  ${(p) => {
    const c = p.theme.colors;
    switch (p.tone) {
      case "primary":
        return css`color: ${c.primary};`;
      case "success":
        return css`color: ${c.success};`;
      case "warning":
        return css`color: ${c.warning};`;
      case "error":
        return css`color: ${c.error};`;
      default:
        return css`color: ${c.textMedium};`;
    }
  }}
`;

const ICON_BY_TONE: Record<Tone, ComponentProps<typeof MaterialIcons>["name"]> = {
  neutral: "fiber-manual-record",
  primary: "mic",
  success: "check-circle",
  warning: "schedule",
  error: "error-outline",
  info: "info-outline",
};

const COLOR_BY_TONE: Record<Tone, string> = {
  neutral: "#4B5565",
  primary: "#246BFD",
  success: "#16845B",
  warning: "#B7791F",
  error: "#C62828",
  info: "#173B57",
};

interface Props {
  tone?: Tone;
  label: string;
  icon?: ComponentProps<typeof MaterialIcons>["name"];
}

export function StatusChip({ tone = "neutral", label, icon }: Props): React.JSX.Element {
  return (
    <Pill tone={tone} accessibilityRole="text">
      <MaterialIcons name={icon ?? ICON_BY_TONE[tone]} size={14} color={COLOR_BY_TONE[tone]} />
      <Label tone={tone}>{label}</Label>
    </Pill>
  );
}
