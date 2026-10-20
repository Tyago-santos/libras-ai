import React from "react";
import styled, { css } from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";

/** Barra de navegação inferior (Stitch: Traduzir · Histórico · Configurações). */

export type TabKey = "translate" | "history" | "settings";

const Bar = styled.View`
  flex-direction: row;
  background: ${(p) => p.theme.colors.surface};
  border-top: 1px solid ${(p) => p.theme.colors.border};
  padding-bottom: ${(p) => p.theme.spacing.sm}px;
`;

const Item = styled.TouchableOpacity<{ active: boolean }>`
  flex: 1;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 4px;
  ${(p) =>
    p.active &&
    css`
      background: ${p.theme.colors.primarySoft};
      border-radius: ${p.theme.radii.md}px;
      margin: 6px 10px 0;
    `}
`;

const Label = styled.Text<{ active: boolean }>`
  font-family: ${(p) => p.theme.typography.labelSm.fontFamily};
  font-size: 11px;
  letter-spacing: 0.3px;
  color: ${(p) => (p.active ? p.theme.colors.primary : p.theme.colors.textMuted)};
`;

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
}

const TABS: TabDef[] = [
  { key: "translate", label: "Traduzir", icon: "translate" },
  { key: "history", label: "Histórico", icon: "history" },
  { key: "settings", label: "Configurações", icon: "settings" },
];

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({ active, onChange }: Props): React.JSX.Element {
  return (
    <Bar accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Item
            key={tab.key}
            active={isActive}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <MaterialIcons
              name={tab.icon}
              size={22}
              color={isActive ? "#246BFD" : "#667085"}
            />
            <Label active={isActive}>{tab.label}</Label>
          </Item>
        );
      })}
    </Bar>
  );
}
