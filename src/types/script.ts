import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface DialogueLine {
  id: string;
  character: string;
  text: string;
  duration: number;
  timestamp: number;
  status: 'pending' | 'active' | 'completed';
}

export interface ScriptSession {
  id: string;
  scriptId: string;
  character: string;
  status: 'active' | 'paused' | 'completed';
  startTime: number;
  endTime?: number;
  currentLineIndex: number;
  lines: DialogueLine[];
  stats: {
    readerLines: number;
    userLines: number;
    totalDuration: number;
  };
}

export interface ScriptCharacter {
  id: string;
  name: string;
  voiceId: string | null;
  gender: 'male' | 'female' | 'unknown';
  lines: number;
  firstAppearance: number;
  dialogue: Array<{
    text: string;
    lineNumber: number;
  }>;
}

export interface ScriptScene {
  id: string;
  name: string;
  startLine: number;
  endLine: number;
  location?: string;
  timeOfDay?: string;
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

export interface ScriptAnalysis {
  characters: Array<{
    name: string;
    lines: number;
    firstAppearance: number;
    dialogue?: Array<{
      text: string;
      lineNumber: number;
      isMultiLine?: boolean;
      continuationOf?: number;
      voices?: Record<string, string>;
    }>;
  }>;
  scenes: Array<{
    name: string;
    startLine: number;
    endLine: number;
    location?: string;
    timeOfDay?: string;
  }>;
  actionLines: Array<{
    text: string;
    lineNumber: number;
  }>;
  processedLines: Array<{
    characterId: string;
    characterName: string;
    text: string;
    originalLineNumber: number;
    sequentialNumber: number;
    isUser?: boolean;
    isAction?: boolean;
    voices?: Record<string, string>;
  }>;
  metadata: {
    totalLines: number;
    estimatedDuration: number;
    genre?: string;
    tone?: string;
  };
}

export interface ScriptProcessingStatus {
  status: 'starting' | 'downloading' | 'parsing' | 'analyzing' | 'saving' | 'completed' | 'error';
  progress?: number;
  error?: string;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface ScriptMetadata {
  id: string;
  title: string;
  characters: Record<string, ScriptCharacter>;
  totalLines: number;
  scenes: ScriptScene[];
  analysis?: ScriptAnalysis;
  processingStatus?: ScriptProcessingStatus;
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
  createdAt: Date | null;
  updatedAt: Date | null;
  status: 'draft' | 'in_progress' | 'completed';
  scenes: ScriptScene[];
  characters: ScriptCharacter[];
  settings: ScriptSetting[];
  analysis?: ScriptAnalysis;
  processingStatus?: ScriptProcessingStatus;
  uploadStatus?: 'uploading' | 'processing' | 'completed' | 'error';
  fileUrl?: string | null;
  originalFileName?: string | null;
  error?: string | null;
}

export interface NewScriptData {
  title: string;
  description?: string | null;
  status?: 'draft' | 'in_progress' | 'completed';
  scenes?: ScriptScene[];
  characters?: ScriptCharacter[];
  settings?: ScriptSetting[];
  userId?: string;
  id?: string;
  uploadStatus?: 'uploading' | 'processing' | 'completed' | 'error';
  uploadedAt?: FirebaseFirestoreTypes.Timestamp;
  createdAt?: FirebaseFirestoreTypes.Timestamp;
  updatedAt?: FirebaseFirestoreTypes.Timestamp;
  fileUrl?: string;
  originalFileName?: string;
}

export interface ProcessingStatus {
  status: string;
  progress?: number;
  error?: string;
  updatedAt: Date;
} 