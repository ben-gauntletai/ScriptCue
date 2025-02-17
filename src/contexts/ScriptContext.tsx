import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { ScriptContextType, ScriptSession, DialogueLine, VoiceSettings, ScriptMetadata } from '../types/script';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import firebaseService from '../services/firebase';
import { ProcessingStatus } from '../types/script';
import { useAuth } from './AuthContext';

const initialState: ScriptContextType = {
  currentSession: null,
  currentScript: null,
  lines: [],
  isLoading: false,
  error: null,
  voiceSettings: {},
  actions: {
    startSession: async () => {},
    pauseSession: async () => {},
    resumeSession: async () => {},
    completeCurrentLine: async () => {},
    updateVoiceSettings: async () => {},
  },
};

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSION'; payload: ScriptSession }
  | { type: 'SET_SCRIPT'; payload: ScriptMetadata }
  | { type: 'UPDATE_LINES'; payload: DialogueLine[] }
  | { type: 'UPDATE_LINE_STATUS'; payload: { lineId: string; status: DialogueLine['status'] } }
  | { type: 'UPDATE_VOICE_SETTINGS'; payload: { characterId: string; settings: VoiceSettings } };

const scriptReducer = (state: ScriptContextType, action: Action): ScriptContextType => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_SESSION':
      return { ...state, currentSession: action.payload };
    case 'SET_SCRIPT':
      return { ...state, currentScript: action.payload };
    case 'UPDATE_LINES':
      return { ...state, lines: action.payload };
    case 'UPDATE_LINE_STATUS':
      return {
        ...state,
        lines: state.lines.map(line =>
          line.id === action.payload.lineId
            ? { ...line, status: action.payload.status }
            : line
        ),
      };
    case 'UPDATE_VOICE_SETTINGS':
      return {
        ...state,
        voiceSettings: {
          ...state.voiceSettings,
          [action.payload.characterId]: action.payload.settings,
        },
      };
    default:
      return state;
  }
};

const ScriptContext = createContext<ScriptContextType | undefined>(undefined);

export const useScript = () => {
  const context = useContext(ScriptContext);
  if (context === undefined) {
    throw new Error('useScript must be used within a ScriptProvider');
  }
  return context;
};

export const ScriptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(scriptReducer, initialState);
  const [scripts, setScripts] = useState<ScriptMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const calculateLineDuration = (text: string): number => {
    // Basic duration calculation: 1 second per 15 characters
    const baseTime = text.length / 15;
    // Add padding for very short lines
    return Math.max(baseTime, 2.0);
  };

  const updateSessionStats = useCallback(async (sessionId: string) => {
    const readerLines = state.lines.filter(l => l.character !== 'MYSELF' && l.status === 'completed').length;
    const userLines = state.lines.filter(l => l.character === 'MYSELF' && l.status === 'completed').length;
    const completedLines = state.lines.filter(l => l.status === 'completed');
    const totalDuration = completedLines.reduce((sum, line) => sum + line.duration, 0);

    const stats = {
      readerLines,
      userLines,
      totalDuration,
    };

    await firestore()
      .collection('readingSessions')
      .doc(sessionId)
      .update({
        stats,
        lastActiveTime: Date.now(),
      });

    return stats;
  }, [state.lines]);

  const loadScript = useCallback(async (scriptId: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const scriptDoc = await firestore().collection('scripts').doc(scriptId).get();
      if (!scriptDoc.exists) {
        throw new Error('Script not found');
      }

      const scriptData = scriptDoc.data() as ScriptMetadata;
      dispatch({ type: 'SET_SCRIPT', payload: scriptData });

      const userId = auth().currentUser?.uid;
      if (userId) {
        const prefsDoc = await firestore()
          .collection('userScriptPreferences')
          .doc(`${scriptId}_${userId}`)
          .get();

        if (prefsDoc.exists) {
          const prefs = prefsDoc.data();
          if (prefs?.voiceSettings) {
            Object.entries(prefs.voiceSettings).forEach(([characterId, settings]) => {
              dispatch({
                type: 'UPDATE_VOICE_SETTINGS',
                payload: { characterId, settings: settings as VoiceSettings },
              });
            });
          }
        }
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load script' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const loadLines = useCallback(async (scriptId: string, startLine: number, count: number = 20) => {
    try {
      const linesSnapshot = await firestore()
        .collection('lines')
        .where('scriptId', '==', scriptId)
        .where('lineNumber', '>=', startLine)
        .orderBy('lineNumber')
        .limit(count)
        .get();

      const loadedLines: DialogueLine[] = linesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          character: data.characterId,
          duration: calculateLineDuration(data.text),
          timestamp: Date.now(),
          status: 'pending',
        };
      });

      dispatch({ type: 'UPDATE_LINES', payload: loadedLines });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load lines' });
    }
  }, []);

  const startSession = useCallback(async (scriptId: string, character: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await loadScript(scriptId);
      
      const userId = auth().currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const sessionRef = await firestore().collection('readingSessions').add({
        scriptId,
        userId,
        character,
        status: 'active',
        startTime: Date.now(),
        currentLineIndex: 0,
        lines: [],
        stats: {
          readerLines: 0,
          userLines: 0,
          totalDuration: 0,
        },
      });

      const session: ScriptSession = {
        id: sessionRef.id,
        scriptId,
        character,
        status: 'active',
        startTime: Date.now(),
        currentLineIndex: 0,
        lines: [],
        stats: {
          readerLines: 0,
          userLines: 0,
          totalDuration: 0,
        },
      };

      dispatch({ type: 'SET_SESSION', payload: session });
      await loadLines(scriptId, 0);

      // Set first line as active
      if (state.lines.length > 0) {
        dispatch({
          type: 'UPDATE_LINE_STATUS',
          payload: { lineId: state.lines[0].id, status: 'active' },
        });
      }

      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to start session' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [loadScript, loadLines, state.lines]);

  const pauseSession = useCallback(async () => {
    if (!state.currentSession) return;
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await firestore()
        .collection('readingSessions')
        .doc(state.currentSession.id)
        .update({
          status: 'paused',
          lastActiveTime: Date.now(),
        });

      dispatch({
        type: 'SET_SESSION',
        payload: {
          ...state.currentSession,
          status: 'paused',
        },
      });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to pause session' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentSession]);

  const resumeSession = useCallback(async () => {
    if (!state.currentSession) return;
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await firestore()
        .collection('readingSessions')
        .doc(state.currentSession.id)
        .update({
          status: 'active',
          lastActiveTime: Date.now(),
        });

      dispatch({
        type: 'SET_SESSION',
        payload: {
          ...state.currentSession,
          status: 'active',
        },
      });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to resume session' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentSession]);

  const completeCurrentLine = useCallback(async () => {
    if (!state.currentSession || !state.currentScript) return;
    
    try {
      const currentIndex = state.currentSession.currentLineIndex;
      const currentLine = state.lines[currentIndex];
      
      if (!currentLine) return;

      // Mark current line as completed
      dispatch({
        type: 'UPDATE_LINE_STATUS',
        payload: { lineId: currentLine.id, status: 'completed' },
      });

      // Update session stats
      const stats = await updateSessionStats(state.currentSession.id);

      // Move to next line
      const nextIndex = currentIndex + 1;
      if (nextIndex < state.lines.length) {
        // Mark next line as active
        dispatch({
          type: 'UPDATE_LINE_STATUS',
          payload: { lineId: state.lines[nextIndex].id, status: 'active' },
        });

        // Update session
        const updatedSession: ScriptSession = {
          ...state.currentSession,
          currentLineIndex: nextIndex,
          stats,
        };

        await firestore()
          .collection('readingSessions')
          .doc(state.currentSession.id)
          .update({
            currentLineIndex: nextIndex,
            stats,
            lastActiveTime: Date.now(),
          });

        dispatch({ type: 'SET_SESSION', payload: updatedSession });

        // Load more lines if needed
        if (nextIndex + 5 >= state.lines.length) {
          await loadLines(state.currentSession.scriptId, nextIndex + 1);
        }
      } else {
        // End of script
        const updatedSession: ScriptSession = {
          ...state.currentSession,
          status: 'completed',
          endTime: Date.now(),
          stats,
        };

        await firestore()
          .collection('readingSessions')
          .doc(state.currentSession.id)
          .update({
            status: 'completed',
            endTime: Date.now(),
            stats,
          });

        dispatch({ type: 'SET_SESSION', payload: updatedSession });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to complete line' });
    }
  }, [state.currentSession, state.currentScript, state.lines, loadLines, updateSessionStats]);

  const refreshScripts = async () => {
    if (!user) {
      setScripts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const fetchedScripts = await firebaseService.getScripts();
      setScripts(fetchedScripts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching scripts:', err);
    } finally {
      setLoading(false);
    }
  };

  const getProcessingStatus = async (scriptId: string): Promise<ProcessingStatus | null> => {
    try {
      return await firebaseService.getProcessingStatus(scriptId);
    } catch (err) {
      console.error('Error fetching processing status:', err);
      return null;
    }
  };

  const subscribeToProcessingStatus = (
    scriptId: string,
    callback: (status: ProcessingStatus) => void
  ): (() => void) => {
    return firebaseService.subscribeToProcessingStatus(scriptId, callback);
  };

  useEffect(() => {
    if (user) {
      refreshScripts();
    }
  }, [user]);

  const value = {
    ...state,
    actions: {
      startSession,
      pauseSession,
      resumeSession,
      completeCurrentLine,
      updateVoiceSettings: async () => {}, // Implement if needed
    },
    scripts,
    loading,
    error,
    refreshScripts,
    getProcessingStatus,
    subscribeToProcessingStatus,
  };

  return <ScriptContext.Provider value={value}>{children}</ScriptContext.Provider>;
}; 