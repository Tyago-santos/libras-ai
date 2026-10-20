/**
 * Ponte entre o store (código imperativo) e o hook de áudio (React).
 *
 * O hook `useSpeechStream` se registra aqui quando monta; o store chama
 * `speechController.start()`/`.stop()` sem depender de React.
 */
export interface SpeechStreamHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

let handle: SpeechStreamHandle | null = null;

export const speechController = {
  register(h: SpeechStreamHandle): void {
    handle = h;
  },
  unregister(): void {
    handle = null;
  },
  isRegistered(): boolean {
    return handle !== null;
  },
  async start(): Promise<void> {
    if (!handle) throw new Error("Gravador de áudio não inicializado (tela não montada)");
    await handle.start();
  },
  async stop(): Promise<void> {
    await handle?.stop();
  },
};
