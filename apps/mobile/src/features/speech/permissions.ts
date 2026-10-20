import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";

/**
 * Permissão de microfone (§11: solicitação explícita + indicação de captura).
 */
export type MicPermission = "unknown" | "granted" | "denied";

export async function getMicPermission(): Promise<MicPermission> {
  const res = await getRecordingPermissionsAsync();
  return res.granted ? "granted" : res.status === "undetermined" ? "unknown" : "denied";
}

/** Solicita a permissão; retorna o estado final. */
export async function requestMicPermission(): Promise<MicPermission> {
  const res = await requestRecordingPermissionsAsync();
  if (res.granted) return "granted";
  return res.status === "undetermined" ? "unknown" : "denied";
}
