declare module '@react-native-voice/voice' {
  interface VoiceModule {
    onSpeechStart: ((callback: () => void) => void) | (() => void);
    onSpeechEnd: ((callback: () => void) => void) | (() => void);
    onSpeechError: ((callback: (error: { error: string }) => void) => void) | ((error: { error: string }) => void);
    onSpeechResults: ((callback: (result: { value: string[] }) => void) => void) | ((result: { value: string[] }) => void);
    onSpeechPartialResults: ((callback: (result: { value: string[] }) => void) => void) | ((result: { value: string[] }) => void);
    start: (locale?: string) => Promise<void>;
    stop: () => Promise<void>;
    destroy: () => Promise<void>;
    removeAllListeners: () => void;
    isAvailable: () => Promise<boolean>;
  }

  const Voice: VoiceModule;
  export default Voice;
} 