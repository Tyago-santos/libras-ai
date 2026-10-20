/**
 * Codifica PCM int16 mono em container WAV (RIFF) e converte para base64.
 * Usado para enviar chunks de áudio ao backend sem bibliotecas nativas.
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function arrayBufferToBase64(bytes: Uint8Array): string {
  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < len ? (bytes[i + 1] as number) : undefined;
    const b2 = i + 2 < len ? (bytes[i + 2] as number) : undefined;

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** Monta um WAV válido a partir de PCM int16. */
export function pcmInt16ToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const byteRate = sampleRate * channels * 2;
  const dataSize = pcm.length;

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do chunk fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(header, 0);
  wav.set(pcm, 44);
  return wav;
}

/** PCM int16 → WAV base64 pronto para envio. */
export function encodeWavBase64(pcm: Uint8Array, sampleRate: number): string {
  return arrayBufferToBase64(pcmInt16ToWav(pcm, sampleRate));
}
