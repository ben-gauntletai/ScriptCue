import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

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
  userId: string;
  currentLine: number;
  userCharacter: string;
  status: 'active' | 'paused' | 'completed';
  startTime: FirebaseFirestoreTypes.Timestamp;
  lastActiveTime: FirebaseFirestoreTypes.Timestamp;
}

export interface ScriptCharacter {
  id: string;
  name: string;
  voiceId: string | null;
  gender: 'male' | 'female' | 'unknown';
}

export interface ScriptScene {
  id: string;
  name: string;
  startLine: number;
  endLine: number;
}

export interface ScriptSetting {
  id: string;
  key: string;
  value: any;
}

export interface VoiceSettings {
  voiceId: string;
  pitch: number;
  speed: number;
}

export interface ScriptMetadata {
  id: string;
  title: string;
  characters: Record<string, ScriptCharacter>;
  totalLines: number;
  scenes: ScriptScene[];
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

export interface Script {
  id: string;
  title: string;
  description: string | null;
  userId: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  status: 'draft' | 'in_progress' | 'completed';
  scenes: ScriptScene[];
  characters: ScriptCharacter[];
  settings: ScriptSetting[];
}

export type NewScriptData = Omit<Script, 'id' | 'createdAt' | 'updatedAt'>; 