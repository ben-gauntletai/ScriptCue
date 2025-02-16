import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { ScriptContextType, ScriptSession, DialogueLine, VoiceSettings, ScriptMetadata } from '../types/script';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

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

const ScriptContext = createContext<ScriptContextType>(initialState);

export const useScript = () => {
  const context = useContext(ScriptContext);
  if (!context) {
    throw new Error('useScript must be used within a ScriptProvider');
  }
  return context;
};

export const ScriptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(scriptReducer, initialState);

  const loadScript = useCallback(async (scriptId: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // Load script metadata
      const scriptDoc = await firestore().collection('scripts').doc(scriptId).get();
      if (!scriptDoc.exists) {
        throw new Error('Script not found');
      }

      const scriptData = scriptDoc.data() as ScriptMetadata;
      dispatch({ type: 'SET_SCRIPT', payload: scriptData });

      // Load user preferences
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
          timestamp: Date.now(),
          isUser: state.currentSession?.userCharacter === data.characterId,
          status: 'pending',
        };
      });

      dispatch({ type: 'UPDATE_LINES', payload: loadedLines });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load lines' });
    }
  }, [state.currentSession?.userCharacter]);

  const startSession = useCallback(async (scriptId: string, character: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      await loadScript(scriptId);
      
      // Create new session in Firestore
      const userId = auth().currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const sessionRef = await firestore().collection('readingSessions').add({
        scriptId,
        userId,
        userCharacter: character,
        currentLine: 0,
        status: 'active',
        startTime: Date.now(),
        lastActiveTime: Date.now(),
        progress: 0,
      });

      const session: ScriptSession = {
        id: sessionRef.id,
        scriptId,
        currentLine: 0,
        userCharacter: character,
        status: 'active',
        startTime: Date.now(),
        lastActiveTime: Date.now(),
      };

      dispatch({ type: 'SET_SESSION', payload: session });
      await loadLines(scriptId, 0);
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to start session' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [loadScript, loadLines]);

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
          lastActiveTime: Date.now(),
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
          lastActiveTime: Date.now(),
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
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const nextLine = state.currentSession.currentLine + 1;
      const progress = (nextLine / state.currentScript.totalLines) * 100;
      
      await firestore()
        .collection('readingSessions')
        .doc(state.currentSession.id)
        .update({
          currentLine: nextLine,
          lastActiveTime: Date.now(),
          progress,
        });

      dispatch({
        type: 'SET_SESSION',
        payload: {
          ...state.currentSession,
          currentLine: nextLine,
          lastActiveTime: Date.now(),
        },
      });

      // Load more lines if needed
      if (state.lines.length - nextLine < 5) {
        await loadLines(state.currentSession.scriptId, nextLine);
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to complete line' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentSession, state.currentScript, state.lines.length, loadLines]);

  const updateVoiceSettings = useCallback(async (characterId: string, settings: VoiceSettings) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const userId = auth().currentUser?.uid;
      if (!userId || !state.currentSession) return;

      await firestore()
        .collection('userScriptPreferences')
        .doc(`${state.currentSession.scriptId}_${userId}`)
        .set({
          userId,
          scriptId: state.currentSession.scriptId,
          selectedCharacterId: state.currentSession.userCharacter,
          voiceSettings: {
            [characterId]: settings,
          },
        }, { merge: true });

      dispatch({
        type: 'UPDATE_VOICE_SETTINGS',
        payload: { characterId, settings },
      });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to update voice settings' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.currentSession?.status === 'active') {
        pauseSession();
      }
    };
  }, [state.currentSession?.status, pauseSession]);

  const value = {
    ...state,
    actions: {
      startSession,
      pauseSession,
      resumeSession,
      completeCurrentLine,
      updateVoiceSettings,
    },
  };

  return <ScriptContext.Provider value={value}>{children}</ScriptContext.Provider>;
}; 