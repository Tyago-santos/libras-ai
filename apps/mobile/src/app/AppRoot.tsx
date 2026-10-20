import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "styled-components/native";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { theme } from "../theme/ThemeProvider";
import { BottomNav, type TabKey } from "../components/BottomNav";
import { TranslateScreen } from "../screens/TranslateScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { useSessionStore } from "../features/session/store";
import { useSpeechStream } from "../features/speech/useSpeechStream";

/**
 * Raiz do app: tema (styled-components + tokens do Stitch), fontes,
 * navegação de 3 abas e o hook de captura de áudio (sempre montado —
 * a gravação continua ao trocar de aba).
 */
export function AppRoot(): React.JSX.Element {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [tab, setTab] = useState<TabKey>("translate");

  const initialize = useSessionStore((s) => s.initialize);
  const processChunk = useSessionStore((s) => s.processChunk);

  // Captura contínua: registra o hook no controlador usado pelo store.
  useSpeechStream({
    chunkMs: 2000,
    getSilenceMs: () => useSessionStore.getState().silenceMs,
    onChunk: (payload) => void processChunk(payload),
  });

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F8FB" }}>
        <ActivityIndicator size="large" color="#246BFD" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider theme={theme}>
        <StatusBar style="dark" />
        {tab === "translate" ? (
          <TranslateScreen onPressSettings={() => setTab("settings")} />
        ) : tab === "history" ? (
          <HistoryScreen />
        ) : (
          <SettingsScreen />
        )}
        <BottomNav active={tab} onChange={setTab} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default AppRoot;
