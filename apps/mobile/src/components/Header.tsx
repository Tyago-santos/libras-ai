import React from "react";
import styled from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";

/** Cabeçalho do app (Stitch: logo + nome + ação de configurações). */

const Bar = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${(p) => p.theme.spacing.md}px;
  padding-bottom: ${(p) => p.theme.spacing.sm}px;
`;

const Brand = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.spacing.sm}px;
`;

const Logo = styled.View<{ size: "sm" | "lg" }>`
  width: ${(p) => (p.size === "lg" ? 44 : 34)}px;
  height: ${(p) => (p.size === "lg" ? 44 : 34)}px;
  border-radius: ${(p) => p.theme.radii.md}px;
  background: ${(p) => p.theme.colors.primary};
  align-items: center;
  justify-content: center;
`;

const Titles = styled.View``;

export const AppTitle = styled.Text`
  font-family: ${(p) => p.theme.typography.headlineSm.fontFamily};
  font-size: ${(p) => p.theme.typography.headlineSm.fontSize}px;
  line-height: ${(p) => p.theme.typography.headlineSm.lineHeight}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textHigh};
`;

export const AppSubtitle = styled.Text`
  font-family: ${(p) => p.theme.typography.bodySm.fontFamily};
  font-size: ${(p) => p.theme.typography.bodySm.fontSize}px;
  color: ${(p) => p.theme.colors.textMedium};
`;

const IconButton = styled.TouchableOpacity`
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${(p) => p.theme.radii.pill}px;
`;

interface Props {
  showSettingsAction?: boolean;
  onPressSettings?: () => void;
}

export function Header({ showSettingsAction = true, onPressSettings }: Props): React.JSX.Element {
  return (
    <Bar>
      <Brand>
        <Logo size="lg">
          <MaterialIcons name="record-voice-over" size={24} color="#FFFFFF" />
        </Logo>
        <Titles>
          <AppTitle>Libras AI</AppTitle>
          <AppSubtitle>Português para Libras</AppSubtitle>
        </Titles>
      </Brand>
      {showSettingsAction ? (
        <IconButton onPress={onPressSettings} accessibilityLabel="Configurações">
          <MaterialIcons name="settings" size={24} color="#4B5565" />
        </IconButton>
      ) : null}
    </Bar>
  );
}
