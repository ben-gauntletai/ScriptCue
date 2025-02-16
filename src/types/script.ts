export interface DialogueLine {
  id: string;
  text: string;
  character: string;
  timestamp: number;
  isUser: boolean;
  status: 'pending' | 'reading' | 'complete';
}

export interface ScriptSession {
  id: string;
  scriptId: string;
  currentLine: number;
  userCharacter: string;
  status: 'active' | 'paused' | 'completed';
  startTime: number;
  lastActiveTime: number;
}

export interface ScriptCharacter {
  id: string;
  name: string;
  voiceId: string | null;
  gender: 'male' | 'female' | 'unknown';
}

export interface ScriptMetadata {
  id: string;
  title: string;
  characters: Record<string, ScriptCharacter>;
  totalLines: number;
  scenes: {
    id: string;
    name: string;
    startLine: number;
    endLine: number;
  }[];
}

export interface VoiceSettings {
  voiceId: string;
  pitch: number;
  speed: number;
}

export interface ScriptContextType {
  currentSession: ScriptSession | null;
  currentScript: ScriptMetadata | null;
  lines: DialogueLine[];
  isLoading: boolean;
  error: string | null;
  voiceSettings: Record<string, VoiceSettings>;
  actions: {
    startSession: (scriptId: string, character: string) => Promise<void>;
    pauseSession: () => Promise<void>;
    resumeSession: () => Promise<void>;
    completeCurrentLine: () => Promise<void>;
    updateVoiceSettings: (characterId: string, settings: VoiceSettings) => Promise<void>;
  };
} 