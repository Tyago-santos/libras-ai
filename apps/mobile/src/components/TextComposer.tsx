import React, { useState } from "react";
import styled from "styled-components/native";
import { MaterialIcons } from "@expo/vector-icons";

/** Entrada manual "Ou digite uma frase" (modo alternativo ao microfone). */

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.spacing.sm}px;
`;

const Field = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 14px;
  border-radius: ${(p) => p.theme.radii.pill}px;
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.borderStrong};
`;

const Input = styled.TextInput`
  flex: 1;
  font-family: ${(p) => p.theme.typography.bodyMd.fontFamily};
  font-size: 15px;
  color: ${(p) => p.theme.colors.textHigh};
  padding: 0;
`;

const SendButton = styled.TouchableOpacity<{ enabled: boolean }>`
  height: 48px;
  min-width: 48px;
  padding: 0 16px;
  border-radius: ${(p) => p.theme.radii.pill}px;
  background: ${(p) => (p.enabled ? p.theme.colors.primary : "#B8C7EA")};
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 6px;
`;

const SendLabel = styled.Text`
  font-family: ${(p) => p.theme.typography.labelLg.fontFamily};
  font-size: 15px;
  color: ${(p) => p.theme.colors.textOnPrimary};
`;

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export function TextComposer({ disabled = false, onSend }: Props): React.JSX.Element {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <Row>
      <Field>
        <MaterialIcons name="keyboard" size={18} color="#667085" />
        <Input
          value={value}
          onChangeText={setValue}
          placeholder="Ou digite uma frase"
          placeholderTextColor="#98A2B3"
          returnKeyType="send"
          onSubmitEditing={submit}
          editable={!disabled}
          maxLength={300}
          accessibilityLabel="Digite uma frase em português"
        />
      </Field>
      <SendButton enabled={canSend} onPress={submit} disabled={!canSend} accessibilityRole="button">
        <MaterialIcons name="translate" size={18} color="#FFFFFF" />
        <SendLabel>Traduzir</SendLabel>
      </SendButton>
    </Row>
  );
}
