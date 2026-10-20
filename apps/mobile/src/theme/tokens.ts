/**
 * Design tokens extraídos do projeto Google Stitch "Libras AI Interface Design"
 * (design system "Libras AI Interface Standard" — Plus Jakarta Sans, tema claro).
 */
import { Platform } from "react-native";

export const colors = {
  // Paleta principal (designMd do Stitch)
  primary: "#246BFD",
  primaryPressed: "#0052D6",
  primarySoft: "rgba(36, 107, 253, 0.10)",
  brandDeep: "#173B57",

  canvas: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F9FC",
  border: "rgba(23, 59, 87, 0.08)",
  borderStrong: "rgba(23, 59, 87, 0.16)",
  viewportFloor: "#EDF2F7",

  textHigh: "#172B3A",
  textMedium: "#4B5565",
  textMuted: "#667085",
  textOnPrimary: "#FFFFFF",

  // Status (§10: estados visuais)
  success: "#16845B",
  successContainer: "#E8F5E9",
  warning: "#B7791F",
  warningContainer: "#FEF3C7",
  error: "#C62828",
  errorContainer: "#FEE2E2",
  errorText: "#93000A",
  infoContainer: "#E3F0FF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  card: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontFamily: "PlusJakartaSans_700Bold", fontSize: 32, lineHeight: 40 },
  headlineLg: { fontFamily: "PlusJakartaSans_700Bold", fontSize: 24, lineHeight: 32 },
  headlineMd: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 20, lineHeight: 28 },
  headlineSm: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 14, lineHeight: 20 },
  labelLg: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 16, lineHeight: 20 },
  labelMd: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 14, lineHeight: 18 },
  labelSm: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
} as const;

export const shadows = {
  level2: Platform.select({
    ios: {
      shadowColor: "#172B3A",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 4 },
    default: {},
  }) as object,
} as const;

/** Estados visuais do app (§10 da spec). */
export type AppViewState =
  | "inactive"
  | "listening"
  | "transcribing"
  | "awaiting-translation"
  | "translating"
  | "signing"
  | "delayed"
  | "error"
  | "ended";

export const viewStateLabel: Record<AppViewState, string> = {
  inactive: "Inativo",
  listening: "Ouvindo",
  transcribing: "Transcrevendo",
  "awaiting-translation": "Aguardando tradução",
  translating: "Traduzindo",
  signing: "Sinalizando",
  delayed: "Atrasado",
  error: "Erro",
  ended: "Encerrado",
};
