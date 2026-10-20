import { Platform } from "react-native";

/**
 * Configuração de rede do app.
 * - Emulator Android: 10.0.2.2 aponta para a máquina host.
 * - Dispositivo físico: defina EXPO_PUBLIC_API_URL no .env do Expo.
 *
 * O Expo embute variáveis EXPO_PUBLIC_* em tempo de build; declaramos o
 * tipo de `process.env` aqui para não depender de @types/node no app.
 */
declare const process: { env: Record<string, string | undefined> };

const EMULATOR_ANDROID = "http://10.0.2.2:3000";
const LOCALHOST = "http://localhost:3000";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? EMULATOR_ANDROID : LOCALHOST);

export const api = {
  url(path: string): string {
    return `${API_URL.replace(/\/$/, "")}${path}`;
  },
};

/** Timeout padrão das requisições do app (ms). */
export const REQUEST_TIMEOUT_MS = 12_000;
