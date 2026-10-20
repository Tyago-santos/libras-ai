import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setAudioModeAsync, useAudioStream } from "expo-audio";
import { requestMicPermission } from "./permissions";
import { speechController } from "./controller";
import { encodeWavBase64 } from "./wav";

/**
 * Captura contínua de áudio com VAD local (§5: detecção de atividade vocal).
 *
 * - Stream PCM int16 mono @16kHz (formato adequado para transcrição);
 * - Calcula a amplitude de cada buffer → detecta silêncio (VAD);
 * - A cada `chunkMs` envia um chunk WAV em base64 para o backend;
 * - Quando o silêncio atinge o threshold configurado, emite um evento
 *   `{ isSilence }` (com duração) para o gerenciador de frases decidir.
 */

export interface SpeechChunkPayload {
  audioBase64?: string;
  mimeType?: "audio/wav";
  durationMs?: number;
  isSilence?: boolean;
}

export interface UseSpeechStreamOptions {
  /** Tamanho de cada chunk enviado ao backend (ms). */
  chunkMs?: number;
  /** Threshold de silêncio (ms) — lido de uma ref para evitar recriação. */
  getSilenceMs: () => number;
  onChunk: (payload: SpeechChunkPayload) => void;
}

/** RMS mínimo (normalizado) para considerar atividade vocal. */
const VOICE_THRESHOLD = 0.015;
/** Reenvia o marcador de silêncio no máximo a cada 500ms. */
const SILENCE_THROTTLE_MS = 500;

const SAMPLE_RATE = 16000;

export function useSpeechStream(options: UseSpeechStreamOptions): { isActive: boolean } {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isActive, setIsActive] = useState(false);
  const activeRef = useRef(false);

  // --- Estado do VAD e do chunk atual (refs: sem re-render por buffer) -----
  const pcmRef = useRef<number[]>([]);
  const chunkStartRef = useRef<number>(Date.now());
  const silentSinceRef = useRef<number | null>(null);
  const lastSilenceEventRef = useRef(0);

  const flushChunk = useCallback(() => {
    const buffered = pcmRef.current;
    if (buffered.length === 0) return;

    const pcm = new Uint8Array(new Int16Array(buffered).buffer);
    const durationMs = Date.now() - chunkStartRef.current;
    pcmRef.current = [];
    chunkStartRef.current = Date.now();

    optionsRef.current.onChunk({
      audioBase64: encodeWavBase64(pcm, SAMPLE_RATE),
      mimeType: "audio/wav",
      durationMs,
    });
  }, []);

  const handleBuffer = useCallback(
    (event: { data: ArrayBuffer }) => {
      if (!activeRef.current) return;

      const samples = new Int16Array(event.data);
      // RMS da janela atual (normalizado -1..1)
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = (samples[i] as number) / 32768;
        sumSquares += v * v;
      }
      const rms = samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0;

      const now = Date.now();
      if (rms >= VOICE_THRESHOLD) {
        silentSinceRef.current = null; // atividade vocal
      } else {
        silentSinceRef.current ??= now;
        const silenceDuration = now - silentSinceRef.current;
        const threshold = optionsRef.current.getSilenceMs();
        if (
          silenceDuration >= threshold &&
          now - lastSilenceEventRef.current >= SILENCE_THROTTLE_MS
        ) {
          lastSilenceEventRef.current = now;
          optionsRef.current.onChunk({ isSilence: true, durationMs: silenceDuration });
        }
      }

      // Acumula PCM do chunk atual
      for (let i = 0; i < samples.length; i += 1) pcmRef.current.push(samples[i] as number);

      if (now - chunkStartRef.current >= (optionsRef.current.chunkMs ?? 2000)) {
        flushChunk();
      }
    },
    [flushChunk],
  );

  // `onBuffer` é a forma oficial do expo-audio (SDK 58) de receber os
  // buffers PCM do microfone em tempo real.
  const streamConfig = useMemo(
    () => ({
      encoding: "int16" as const,
      channels: 1,
      sampleRate: SAMPLE_RATE,
      onBuffer: handleBuffer,
    }),
    [handleBuffer],
  );
  const { stream } = useAudioStream(streamConfig);

  // --- Registra a ponte com o store ----------------------------------------
  useEffect(() => {
    speechController.register({
      start: async () => {
        const permission = await requestMicPermission();
        if (permission !== "granted") {
          throw new Error("PERMISSION_DENIED");
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!stream.isStreaming) {
          pcmRef.current = [];
          chunkStartRef.current = Date.now();
          silentSinceRef.current = null;
          await stream.start();
        }
        activeRef.current = true;
        setIsActive(true);
      },
      stop: async () => {
        activeRef.current = false;
        setIsActive(false);
        if (stream.isStreaming) stream.stop();
        pcmRef.current = [];
        silentSinceRef.current = null;
      },
    });

    return () => {
      speechController.unregister();
      activeRef.current = false;
      if (stream.isStreaming) stream.stop();
    };
  }, [stream]);

  return { isActive };
}
