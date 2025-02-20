import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, PermissionsAndroid, Alert, AppState, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text, IconButton, useTheme, Button, Portal, Dialog, MD3Theme, RadioButton, ActivityIndicator, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MainNavigationProp, MainStackParamList } from '../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptCharacter } from '../../types/script';
import firebaseService from '../../services/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, useCameraDevice, useCameraPermission, CameraPosition, CameraRuntimeError, CameraCaptureError, CameraDeviceFormat } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import Sound from 'react-native-sound';
import Voice from '@react-native-voice/voice';

type PracticeScriptRouteProp = RouteProp<MainStackParamList, 'PracticeScript'>;

type VoiceOption = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

interface DialogueLine {
  text: string;
  lineNumber: number;
  voices?: Record<string, string>;
}

interface DialogueItem {
  characterId: string;
  characterName: string;
  text: string;
  lineNumber: number;
  isUser: boolean;
  isMultiLine?: boolean;
  continuationOf?: number;
  isAction?: boolean;
  voices?: Record<string, string>;
}

type VoiceInfo = {
  description: string;
  gender: 'Male' | 'Female';
};

const VOICE_OPTIONS: VoiceOption[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];

const VOICE_INFO: Record<VoiceOption, VoiceInfo> = {
  alloy: { description: 'Warm, steady', gender: 'Male' },
  ash: { description: 'Deep, authoritative', gender: 'Male' },
  coral: { description: 'Bright, expressive', gender: 'Female' },
  echo: { description: 'Smooth, refined', gender: 'Male' },
  fable: { description: 'Soft, lyrical', gender: 'Male' },
  onyx: { description: 'Bold, resonant', gender: 'Male' },
  nova: { description: 'Youthful, energetic', gender: 'Female' },
  sage: { description: 'Calm, wise', gender: 'Female' },
  shimmer: { description: 'Airy, melodic', gender: 'Female' }
};

interface VoiceSettings {
  voice: VoiceOption;
  testText: string;
}

interface Character {
  name: string;
  lines: number;
  firstAppearance: number;
  dialogue?: DialogueLine[];
}

// Add ProcessedLine type
interface ProcessedLine {
  characterName: string;
  text: string;
  originalLineNumber: number;
  sequentialNumber: number;
  isAction?: boolean;
  voices?: Record<string, string>;
}

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.onBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
  },
  content: {
    flex: 1,
  },
  dialogueContainer: {
    padding: 16,
  },
  dialogueLine: {
    flexDirection: 'row',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  lineNumberContainer: {
    width: 40,
    marginRight: 16,
    alignItems: 'flex-end',
  },
  lineNumber: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    fontFamily: 'monospace',
  },
  dialogueContent: {
    flex: 1,
  },
  characterName: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dialogueText: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.onSurface,
  },
  currentLine: {
    backgroundColor: theme.colors.primaryContainer,
    borderRadius: 4,
    padding: 8,
    marginHorizontal: -8,
  },
  controls: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceVariant,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsButton: {
    marginRight: 8,
  },
  settingsDialog: {
    maxHeight: '80%',
  },
  dialogueSubtext: {
    marginBottom: 16,
    color: theme.colors.onSurfaceVariant,
  },
  characterList: {
    gap: 8,
  },
  characterButton: {
    marginBottom: 8,
  },
  camera: {
    width: '100%',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  recordingIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingText: {
    color: theme.colors.onError,
    fontSize: 12,
    fontWeight: 'bold',
  },
  uploadingIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: theme.colors.primaryContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadingText: {
    color: theme.colors.onPrimaryContainer,
    fontSize: 12,
    fontWeight: 'bold',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  errorContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.errorContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: theme.colors.onErrorContainer,
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  generatingContent: {
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  generatingText: {
    textAlign: 'center',
    color: theme.colors.onSurface,
  },
  dialogueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playButton: {
    marginLeft: 8,
  },
  actionLine: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 4,
    padding: 8,
    marginVertical: 8,
    fontStyle: 'italic',
  },
  actionText: {
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  continuedDialogue: {
    marginTop: 4,
    marginLeft: 16,
  },
});

const LINES_PER_PAGE = 20;

const PracticeScript: React.FC = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<ScriptCharacter | null>(null);
  const [dialogue, setDialogue] = useState<DialogueItem[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characterVoices, setCharacterVoices] = useState<Record<string, VoiceSettings>>({});
  const characterVoicesRef = useRef<Record<string, VoiceSettings>>({});
  const [hasPermission, setHasPermission] = useState(false);
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('front');
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFormat, setCameraFormat] = useState<CameraDeviceFormat | null>(null);
  const [micPermission, setMicPermission] = useState(false);
  const [savedVideoPath, setSavedVideoPath] = useState<string | null>(null);
  const [isGeneratingVoices, setIsGeneratingVoices] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [showCamera, setShowCamera] = useState(false);
  const [currentlyPlayingLine, setCurrentlyPlayingLine] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState<NodeJS.Timeout | null>(null);
  const [lastSpeechTime, setLastSpeechTime] = useState<number | null>(null);
  const [isLineInProgress, setIsLineInProgress] = useState(false);
  const [partialResults, setPartialResults] = useState<string[]>([]);
  const [confidenceThreshold] = useState(0.7);
  const [recognitionTimeout, setRecognitionTimeout] = useState<NodeJS.Timeout | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [intentionalStop, setIntentionalStop] = useState(false);
  const intentionalStopRef = useRef(false);
  const errorInProgress = useRef(false);
  const MAX_RETRIES = 3;
  const SILENCE_THRESHOLD = 2000; // 2 seconds of silence
  const RECOGNITION_TIMEOUT = 10000; // 10 seconds max for recognition
  const camera = useRef<Camera>(null);
  const dialogueRef = useRef<DialogueItem[]>([]);
  const currentIndexRef = useRef<number | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const isRehearsingRef = useRef(false);
  const device = useCameraDevice(cameraPosition);
  const { hasPermission: cameraPermission, requestPermission } = useCameraPermission();
  const appState = useRef(AppState.currentState);
  const scrollViewRef = useRef<ScrollView>(null);
  const voiceInitialized = useRef(false);
  const currentRecognitionStart = useRef<number | null>(null);
  const [silenceHandlingInProgress, setSilenceHandlingInProgress] = useState(false);
  const silenceHandlingRef = useRef(false);
  const lastSilenceTime = useRef<number | null>(null);
  const SILENCE_DEBOUNCE = 1000; // Minimum time between silence detections
  const processedLinesRef = useRef<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreLines, setHasMoreLines] = useState(true);
  const [allLines, setAllLines] = useState<ProcessedLine[]>([]);
  const scriptRef = useRef<Script | null>(null);

  const navigation = useNavigation<MainNavigationProp>();
  const route = useRoute<PracticeScriptRouteProp>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { scriptId, characterId } = route.params;

  // Set up navigation options
  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: currentCharacter ? `Practicing as ${currentCharacter.name}` : 'Practice Script',
      headerRight: () => (
        <IconButton 
          icon="cog" 
          onPress={() => setSettingsVisible(true)}
          style={styles.settingsButton}
        />
      ),
    });
  }, [navigation, currentCharacter]);

  useEffect(() => {
    const loadScript = async () => {
      try {
        // Load script and voice settings in parallel
        const [scriptData, savedVoices] = await Promise.all([
          firebaseService.getScript(scriptId),
          firebaseService.getCharacterVoices(scriptId)
        ]);

        if (scriptData && scriptData.analysis) {
          console.log('Loaded script analysis:', {
            hasProcessedLines: !!scriptData.analysis.processedLines,
            processedLinesCount: scriptData.analysis.processedLines?.length,
            characterCount: scriptData.analysis.characters?.length,
            characters: scriptData.analysis.characters?.map(c => c.name)
          });
          
          // Store processed lines in ref immediately
          processedLinesRef.current = scriptData.analysis.processedLines || [];
          
          setScript(scriptData);
          const character = scriptData.analysis.characters.find((c: Character) => c.name === characterId);
          if (character) {
            setCurrentCharacter({
              id: character.name,
              name: character.name,
              lines: character.lines,
              firstAppearance: character.firstAppearance,
              dialogue: character.dialogue || [],
              voiceId: null,
              gender: 'unknown'
            });

            // Set initial lines for pagination and initialize dialogue
            const initialLines = scriptData.analysis.processedLines.slice(0, LINES_PER_PAGE);
            setAllLines(initialLines);
            setHasMoreLines(scriptData.analysis.processedLines.length > LINES_PER_PAGE);
            
            // Store full script data for later use
            scriptRef.current = scriptData;

            // Initialize dialogue with initial lines
            const initialDialogue = initializeDialogue(initialLines);
            setDialogue(initialDialogue);
            dialogueRef.current = initialDialogue;

            if (savedVoices) {
              console.log('Loaded voice settings:', savedVoices);
              const typedVoices = savedVoices as Record<string, VoiceSettings>;
              setCharacterVoices(typedVoices);
              characterVoicesRef.current = typedVoices;

              // Pre-process all lines that need voice generation
              const linesToGenerate = processedLinesRef.current
                .filter(pl => {
                  // Skip practicing character and action lines
                  if (pl.characterName === characterId || pl.isAction) return false;
                  
                  // Check if this character has voice settings
                  const charVoice = savedVoices[pl.characterName]?.voice;
                  if (!charVoice) return false;

                  // Check if this line needs voice generation
                  return !pl.voices || !pl.voices[charVoice];
                })
                .reduce((acc, pl) => {
                  if (!acc.includes(pl.characterName)) {
                    acc.push(pl.characterName);
                  }
                  return acc;
                }, [] as string[]);

              if (linesToGenerate.length > 0) {
                console.log('Starting voice generation for characters:', linesToGenerate);
                try {
                  setIsGeneratingVoices(true);
                  setGenerationProgress('Generating Voices...');
                  await firebaseService.generateVoiceLines(
                    scriptId,
                    characterId,
                    savedVoices
                  );

                  // Refresh processed lines after generation
                  const updatedScript = await firebaseService.getScript(scriptId);
                  if (updatedScript?.analysis?.processedLines) {
                    processedLinesRef.current = updatedScript.analysis.processedLines;
                    
                    // Update dialogue state with new voice URLs
                    setDialogue(prevDialogue => {
                      return prevDialogue.map(dialogueItem => {
                        // Skip action lines and practicing character's lines
                        if (dialogueItem.isAction || dialogueItem.characterName === characterId) {
                          return dialogueItem;
                        }

                        // Find corresponding processed line to get updated voice URLs
                        const processedLine = updatedScript?.analysis?.processedLines?.find(
                          pl => pl.characterName === dialogueItem.characterName && 
                               pl.originalLineNumber === dialogueItem.lineNumber
                        );

                        if (processedLine?.voices) {
                          return {
                            ...dialogueItem,
                            voices: processedLine.voices
                          };
                        }

                        return dialogueItem;
                      });
                    });

                    // Also update dialogueRef to maintain consistency
                    dialogueRef.current = dialogueRef.current.map(dialogueItem => {
                      if (dialogueItem.isAction || dialogueItem.characterName === characterId) {
                        return dialogueItem;
                      }

                      const processedLine = updatedScript?.analysis?.processedLines?.find(
                        pl => pl.characterName === dialogueItem.characterName && 
                             pl.originalLineNumber === dialogueItem.lineNumber
                      );

                      if (processedLine?.voices) {
                        return {
                          ...dialogueItem,
                          voices: processedLine.voices
                        };
                      }

                      return dialogueItem;
                    });
                  }
                } catch (error) {
                  console.error('Error generating voice lines:', error);
                  setError('Failed to generate voice lines. Some characters may not have audio.');
                } finally {
                  setIsGeneratingVoices(false);
                }
              } else {
                console.log('No voice generation needed');
              }
            }
          } else {
            setError('Character not found in script');
          }
        } else {
          setError('Script analysis not found');
        }
      } catch (error) {
        console.error('Error loading script:', error);
        setError(error instanceof Error ? error.message : 'Failed to load script');
      }
    };

    loadScript();
  }, [scriptId, characterId]);

  useEffect(() => {
    checkPermissions();
  }, []);

  useEffect(() => {
    if (device?.formats) {
      // Filter for formats that support video recording with common resolutions
      const videoFormats = device.formats.filter(f => {
        // Check for standard video resolutions (1080p or 720p)
        const isStandardResolution = (
          (f.videoWidth === 1920 && f.videoHeight === 1080) ||
          (f.videoWidth === 1280 && f.videoHeight === 720)
        );
        return f.videoHeight && f.videoWidth && isStandardResolution;
      });

      // Prefer 1080p, fallback to 720p, then any available format
      let bestFormat = videoFormats.find(f => f.videoHeight === 1080);
      if (!bestFormat) {
        bestFormat = videoFormats.find(f => f.videoHeight === 720);
      }
      if (!bestFormat && device.formats.length > 0) {
        // Fallback to first available format
        bestFormat = device.formats[0];
      }

      if (bestFormat) {
        console.log('Selected camera format:', {
          width: bestFormat.videoWidth,
          height: bestFormat.videoHeight,
          fps: bestFormat.maxFps,
          pixelFormats: bestFormat.pixelFormats,
        });
        setCameraFormat(bestFormat);
      }
    }
  }, [device]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to foreground
        console.log('App has come to foreground, reinitializing camera...');
        checkPermissions();
        setCameraError(null);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const checkPermissions = async () => {
    try {
      // Request camera permission
      if (!cameraPermission) {
        const newCameraPermission = await requestPermission();
        setHasPermission(newCameraPermission);
      } else {
        setHasPermission(true);
      }

      // Request microphone permission for Android
      if (Platform.OS === 'android') {
        const micResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone Permission",
            message: "ScriptCue needs access to your microphone to record video with audio.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        setMicPermission(micResult === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        // On iOS, the camera permission includes microphone access
        setMicPermission(cameraPermission);
      }
    } catch (err) {
      console.error('Error requesting permissions:', err);
      setError('Failed to get required permissions');
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSettings = () => {
    setSettingsVisible(true);
  };

  const handleCharacterChange = (newCharacterId: string) => {
    // Navigate to the same screen with the new character
    navigation.replace('PracticeScript', {
      scriptId,
      characterId: newCharacterId,
    });
    setSettingsVisible(false);
  };

  const saveVideoLocally = async (sourcePath: string) => {
    try {
      // Create a directory for practice videos if it doesn't exist
      const practiceDir = `${RNFS.DocumentDirectoryPath}/practice_videos/${scriptId}`;
      await RNFS.mkdir(practiceDir, { NSURLIsExcludedFromBackupKey: true });

      // Generate a unique filename with timestamp
      const timestamp = new Date().getTime();
      const fileName = `practice_${characterId}_${timestamp}.mp4`;
      const destinationPath = `${practiceDir}/${fileName}`;

      // Copy the video file to our app's documents directory
      await RNFS.copyFile(sourcePath, destinationPath);
      console.log('Video saved locally at:', destinationPath);
      
      // Delete the temporary file
      await RNFS.unlink(sourcePath);

      return destinationPath;
    } catch (error) {
      console.error('Error saving video locally:', error);
      throw error;
    }
  };

  const handleStartRecording = async () => {
    if (!camera.current) {
      setError('Camera not initialized');
      return;
    }

    if (!micPermission) {
      setError('Microphone permission is required for recording');
      return;
    }

    try {
      setIsVideoRecording(true);
      setIsRecording(true);
      setCameraError(null);
      
      await camera.current.startRecording({
        flash: 'off',
        fileType: 'mp4',
        videoCodec: 'h264',
        onRecordingFinished: async (video) => {
          console.log('Recording finished:', video);
          try {
            setIsUploading(true);
            
            const savedPath = await saveVideoLocally(video.path);
            setSavedVideoPath(savedPath);
            
            Alert.alert(
              'Success',
              'Video saved successfully!',
              [{ text: 'OK' }]
            );
            
            setIsUploading(false);
          } catch (error) {
            console.error('Error saving video:', error);
            setError('Failed to save video. Please try again.');
            setIsUploading(false);
          }
        },
        onRecordingError: (error: CameraCaptureError) => {
          console.error('Recording error:', error);
          setCameraError(`Recording failed: ${error.message}`);
          setIsVideoRecording(false);
          setIsRecording(false);
        },
      });
    } catch (e) {
      console.error('Error starting recording:', e);
      setError('Failed to start recording. Please try again.');
      setIsVideoRecording(false);
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!camera.current) {
      setError('Camera not initialized');
      return;
    }

    try {
      await camera.current.stopRecording();
      setIsVideoRecording(false);
      setIsRecording(false);
    } catch (e) {
      console.error('Error stopping recording:', e);
      setError('Failed to stop recording. Please try again.');
      setIsVideoRecording(false);
      setIsRecording(false);
    }
  };

  const toggleCameraPosition = () => {
    setCameraPosition(current => current === 'front' ? 'back' : 'front');
  };

  // Update dialogue ref when dialogue state changes
  useEffect(() => {
    dialogueRef.current = dialogue;
  }, [dialogue]);

  // Update characterVoicesRef when characterVoices changes
  useEffect(() => {
    characterVoicesRef.current = characterVoices;
  }, [characterVoices]);

  // Add a new function to centralize state management
  const resetSpeechState = () => {
    setIsListening(false);
    setRetryCount(0);
    intentionalStopRef.current = false;
    setPartialResults([]);
  };

  // Add a function to ensure rehearsal state is valid
  const ensureRehearsalState = () => {
    if (!isRehearsingRef.current || !dialogueRef.current.length) {
      handleStopRehearsal();
      return false;
    }
    return true;
  };

  // Improved speech recognition handlers
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      if (voiceInitialized.current) return;
      
      try {
        Sound.setCategory('Playback');
        
        const available = await Voice.isAvailable();
        if (!available) {
          throw new Error('Voice recognition not available');
        }
        
        Voice.onSpeechStart = () => {
          if (!isMounted) return;
          console.log('Speech started');
          setIsListening(true);
        };

        Voice.onSpeechEnd = () => {
          if (!isMounted) return;
          console.log('Speech ended');
          // Don't change state here, wait for results or error
        };

        Voice.onSpeechResults = async (result: { value: string[] }) => {
          if (!isMounted) return;
          console.log('Final results:', result.value);
          
          try {
            // First stop listening
            await stopListening();
            
            // Ensure we're still in a valid state
            if (!ensureRehearsalState()) return;
            
            // Move to next line
            await playNextLine();
          } catch (error) {
            console.error('Error in speech results:', error);
            // Even if error occurs, try to continue
            if (ensureRehearsalState()) {
              await playNextLine();
            }
          }
        };

        Voice.onSpeechError = async (error: { error: string }) => {
          if (!isMounted) return;
          console.log('Speech recognition error:', error);

          try {
            // If we're intentionally stopping, just clean up
            if (intentionalStopRef.current) {
              resetSpeechState();
              return;
            }

            // If we're not rehearsing, just clean up
            if (!ensureRehearsalState()) {
              resetSpeechState();
              return;
            }

            // Handle retries
            if (retryCount < MAX_RETRIES) {
              console.log('Retrying recognition...');
              setRetryCount(prev => prev + 1);
              await new Promise(resolve => setTimeout(resolve, 500));
              await startListening();
            } else {
              console.log('Max retries reached, moving to next line');
              resetSpeechState();
              await playNextLine();
            }
          } catch (error) {
            console.error('Error handling speech error:', error);
            // If all else fails, try to continue
            if (ensureRehearsalState()) {
              resetSpeechState();
              await playNextLine();
            }
          }
        };

        voiceInitialized.current = true;
        console.log('Voice recognition initialized successfully');
      } catch (error) {
        console.error('Initialization error:', error);
        setError('Failed to initialize audio and speech. Please restart the app.');
      }
    };

    initialize();
    
    return () => {
      isMounted = false;
      if (soundRef.current) {
        soundRef.current.release();
      }
      resetSpeechState();
      stopListening();
    };
  }, []);

  // Improved start listening
  const startListening = async () => {
    try {
      console.log('Starting listening...');
      
      // First ensure we're in a valid state
      if (!ensureRehearsalState()) return;
      
      // Stop any existing listening
      await stopListening();
      
      // Reset state before starting
      resetSpeechState();
      
      // Start recognition
      await Voice.start('en-US');
      setIsListening(true);
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      // On error, reset state and try to continue
      resetSpeechState();
      if (ensureRehearsalState()) {
        await playNextLine();
      }
    }
  };

  // Improved stop listening
  const stopListening = async () => {
    try {
      console.log('Stopping listening...');
      
      // Set flag before stopping to prevent error handling
      intentionalStopRef.current = true;
      
      // Stop recognition
      await Voice.stop();
      
      // Small delay to ensure stop completes
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
    } finally {
      // Always reset state
      resetSpeechState();
    }
  };

  // Simplified playNextLine
  const playNextLine = async () => {
    console.log('Playing next line');

    if (!isRehearsingRef.current) {
      console.log('Not rehearsing, stopping');
      handleStopRehearsal();
      return;
    }

    const nextIndex = currentIndexRef.current === null ? 0 : currentIndexRef.current + 1;
    
    if (nextIndex >= dialogueRef.current.length) {
      console.log('End of script reached');
      handleStopRehearsal();
      return;
    }

    currentIndexRef.current = nextIndex;
    setCurrentPlayingIndex(nextIndex);
    setCurrentLineIndex(nextIndex);
    scrollToLine(nextIndex);

    const currentLine = dialogueRef.current[nextIndex];
    console.log('Current line:', {
      index: nextIndex,
      characterName: currentLine.characterName,
      lineNumber: currentLine.lineNumber,
      isAction: currentLine.isAction,
      isUser: currentLine.isUser,
      text: currentLine.text
    });
    
    try {
      if (currentLine.isAction) {
        console.log('Processing action line, pausing briefly');
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (isRehearsingRef.current) {
          await playNextLine();
        }
      } else if (currentLine.isUser || currentLine.characterName === characterId) {
        console.log('Processing user line, starting voice recognition');
        await startListening();
      } else {
        console.log('Processing AI line, checking voice settings');
        const lineId = `${scriptId}_${currentLine.characterName}_${currentLine.lineNumber}`;
        const characterVoiceSettings = characterVoicesRef.current[currentLine.characterName];
        
        console.log('Voice settings:', {
          characterName: currentLine.characterName,
          hasSettings: !!characterVoiceSettings,
          voiceId: characterVoiceSettings?.voice,
          lineId
        });

        if (!characterVoiceSettings?.voice) {
          console.log('No voice settings found for character:', currentLine.characterName);
          await playNextLine();
          return;
        }

        const voiceUrl = getVoiceLineUrl(currentLine.characterName, currentLine.lineNumber, characterVoiceSettings.voice);

        if (!voiceUrl) {
          console.log('No voice URL found for line:', {
            lineId,
            characterName: currentLine.characterName,
            lineNumber: currentLine.lineNumber,
            voiceId: characterVoiceSettings.voice
          });
          await playNextLine();
          return;
        }

        try {
          console.log('Playing voice line:', {
            lineId,
            voiceUrl
          });
          await playVoiceLine(lineId, voiceUrl);
          if (isRehearsingRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await playNextLine();
          }
        } catch (error) {
          console.error('Error playing voice line:', error);
          if (isRehearsingRef.current) {
            await playNextLine();
          }
        }
      }
    } catch (error) {
      console.error('Error in playNextLine:', error);
      if (isRehearsingRef.current) {
        await playNextLine();
      }
    }
  };

  const handleStartRehearsal = async () => {
    console.log('Starting rehearsal', {
      availableVoices: Object.keys(characterVoicesRef.current),
      dialogueLength: dialogueRef.current.length
    });
    
    try {
      // Reset all state first
      currentIndexRef.current = null;
      
      // Stop any ongoing processes
      await stopListening();
      if (soundRef.current) {
        soundRef.current.stop();
        soundRef.current.release();
        soundRef.current = null;
      }
      
      // Ensure clean state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Set rehearsal state
      isRehearsingRef.current = true;
      setCurrentPlayingIndex(null);
      setCurrentLineIndex(0);
      setIsLineInProgress(false);
      setCurrentlyPlayingLine(null);
      setIsRehearsing(true);
      
      // Begin with first line
      await playNextLine();
    } catch (error) {
      console.error('Error starting rehearsal:', error);
      handleStopRehearsal();
      setError('Failed to start rehearsal. Please try again.');
    }
  };

  const handleStopRehearsal = async () => {
    console.log('Stopping rehearsal');
    
    // Set rehearsal flag first to prevent new operations
    isRehearsingRef.current = false;
    
    try {
      // Stop all ongoing processes
      if (soundRef.current) {
        soundRef.current.stop();
        soundRef.current.release();
        soundRef.current = null;
      }
      
      await stopListening();
      
      // Reset all state
      resetSpeechState();
      currentIndexRef.current = null;
      setCurrentPlayingIndex(null);
      setCurrentLineIndex(0);
      setIsLineInProgress(false);
      setCurrentlyPlayingLine(null);
      setIsRehearsing(false);
    } catch (error) {
      console.error('Error stopping rehearsal:', error);
      // Force reset state even if error occurs
      setIsRehearsing(false);
      resetSpeechState();
    }
  };

  const toggleCamera = () => {
    setShowCamera(!showCamera);
    if (isRecording) {
      handleStopRecording();
    }
  };

  // Simple scroll to line function
  const scrollToLine = (index: number) => {
    if (scrollViewRef.current && dialogueRef.current[index]) {
      scrollViewRef.current.scrollTo({
        y: index * 100,
        animated: true
      });
    }
  };

  // Update getVoiceLineUrl to use the ref
  const getVoiceLineUrl = (characterName: string, lineNumber: number, voiceId: VoiceOption): string | null => {
    console.log('Getting voice URL for:', {
      characterName,
      lineNumber,
      voiceId,
      isPracticingCharacter: characterName === characterId
    });

    // Log the entire processedLines array for debugging
    console.log('All processed lines:', {
      count: processedLinesRef.current.length,
      lines: processedLinesRef.current.map(pl => ({
        characterName: pl.characterName,
        lineNumber: pl.originalLineNumber,
        hasVoices: !!pl.voices,
        text: pl.text
      }))
    });

    if (characterName === characterId) {
      console.log('Skipping voice URL for practicing character');
      return null;
    }

    // Try to find the processed line using the ref
    const processedLine = processedLinesRef.current.find(
      pl => {
        const match = pl.characterName === characterName && pl.originalLineNumber === lineNumber;
        console.log('Checking line:', {
          checking: {
            characterName: pl.characterName,
            lineNumber: pl.originalLineNumber
          },
          looking_for: {
            characterName,
            lineNumber
          },
          isMatch: match
        });
        return match;
      }
    );

    console.log('Found processed line:', {
      found: !!processedLine,
      characterName: processedLine?.characterName,
      lineNumber: processedLine?.originalLineNumber,
      hasVoices: !!processedLine?.voices,
      availableVoices: processedLine?.voices ? Object.keys(processedLine.voices) : [],
      text: processedLine?.text
    });

    const voiceUrl = processedLine?.voices?.[voiceId];
    console.log('Voice URL result:', {
      hasUrl: !!voiceUrl,
      voiceId,
      url: voiceUrl
    });

    return voiceUrl || null;
  };

  // Simple play voice line function
  const playVoiceLine = async (lineId: string, voiceUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        // Clean up previous sound
        if (soundRef.current) {
          soundRef.current.stop();
          soundRef.current.release();
          soundRef.current = null;
        }

        const newSound = new Sound(voiceUrl, '', (error) => {
          if (error) {
            reject(error);
            return;
          }

          newSound.play((success) => {
            if (success) {
              resolve();
            } else {
              reject(new Error('Playback failed'));
            }
            
            // Cleanup
            newSound.release();
            soundRef.current = null;
          });
          
          soundRef.current = newSound;
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  // Add loadMoreLines function
  const loadMoreLines = async () => {
    if (!hasMoreLines || isLoadingMore || !scriptRef.current?.analysis?.processedLines) return;

    try {
      setIsLoadingMore(true);
      const startIndex = currentPage * LINES_PER_PAGE;
      const nextLines = scriptRef.current.analysis.processedLines.slice(
        startIndex,
        startIndex + LINES_PER_PAGE
      );

      if (nextLines.length > 0) {
        setAllLines(prev => [...prev, ...nextLines]);
        setCurrentPage(prev => prev + 1);
        setHasMoreLines(
          startIndex + LINES_PER_PAGE < scriptRef.current.analysis.processedLines.length
        );

        // Process new lines and update dialogue
        const updatedDialogue = initializeDialogue([...allLines, ...nextLines]);
        setDialogue(updatedDialogue);
        dialogueRef.current = updatedDialogue;
      } else {
        setHasMoreLines(false);
      }
    } catch (error) {
      console.error('Error loading more lines:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Add scroll handler to FlatList
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isCloseToBottom = 
      layoutMeasurement.height + contentOffset.y >= 
      contentSize.height - paddingToBottom;

    if (isCloseToBottom && !isLoadingMore && hasMoreLines) {
      loadMoreLines();
    }
  };

  // Add initializeDialogue function
  const initializeDialogue = (lines: ProcessedLine[] = allLines) => {
    if (!scriptRef.current?.analysis) return [];

    const combinedLines: DialogueItem[] = lines.map(line => ({
      characterId: line.isAction ? 'action' : line.characterName,
      characterName: line.isAction ? 'action' : line.characterName,
      text: line.text,
      lineNumber: line.originalLineNumber,
      isUser: line.characterName === characterId,
      isAction: line.isAction,
      voices: line.voices
    }));

    // Sort by line number
    return combinedLines.sort((a, b) => a.lineNumber - b.lineNumber);
  };

  if (!script || !currentCharacter) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading script...</Text>
      </View>
    );
  }

  if (!device || !hasPermission || !micPermission) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text>Camera and/or microphone permission required</Text>
        <Button onPress={checkPermissions}>Request Permissions</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showCamera && (
        <Camera
          ref={camera}
          style={[styles.camera, {
            aspectRatio: cameraFormat ? cameraFormat.videoWidth / cameraFormat.videoHeight : 16/9
          }]}
          device={device}
          isActive={true}
          video={true}
          audio={true}
          format={cameraFormat || undefined}
          fps={30}
          enableZoomGesture={true}
          orientation="portrait"
          onError={(error) => {
            console.error('Camera error:', error);
            if (error.message.includes('camera-has-been-disconnected') || 
                error.message.includes('Camera disabled by policy')) {
              checkPermissions();
            } else {
              setCameraError(`Camera error: ${error.message}`);
            }
          }}
        />
      )}
      {isVideoRecording && (
        <View style={styles.recordingIndicator}>
          <ActivityIndicator size="small" color={theme.colors.onError} />
          <Text style={styles.recordingText}>Recording</Text>
        </View>
      )}
      {isUploading && (
        <View style={styles.uploadingIndicator}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.uploadingText}>
            Saving video...
          </Text>
        </View>
      )}
      {(error || cameraError) && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || cameraError}</Text>
          <IconButton
            icon="close"
            size={20}
            onPress={() => {
              setError(null);
              setCameraError(null);
            }}
          />
        </View>
      )}
      <View style={styles.controlsRow}>
        <Button
          mode="contained"
          onPress={toggleCamera}
          icon="camera"
          disabled={isUploading || !!cameraError || isRehearsing}
        >
          Toggle
        </Button>
        {showCamera && (
          <IconButton
            icon="camera-flip"
            size={24}
            onPress={toggleCameraPosition}
            disabled={isRecording || isUploading || isRehearsing}
          />
        )}
        <Button
          mode="contained"
          onPress={isRehearsing ? handleStopRehearsal : handleStartRehearsal}
          icon={isRehearsing ? "stop" : "play"}
          disabled={isUploading || !!cameraError}
        >
          {isRehearsing ? "Stop" : "Rehearse"}
        </Button>
      </View>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.content}
      >
        <View style={styles.dialogueContainer}>
          {dialogueRef.current.map((item, index) => {
            // Skip continued lines as they'll be shown with their parent
            if (item.continuationOf) {
              return null;
            }

            // Find any continuation lines
            const continuedLines = dialogueRef.current.filter(
              line => line.continuationOf === item.lineNumber
            );

            // Calculate the actual sequential line number
            // Filter out continuation lines that come before this line
            const sequentialNumber = dialogueRef.current
              .slice(0, index)
              .filter(line => !line.continuationOf)
              .length + 1;

            // Combine the text of the main line with any continuation lines
            const fullText = [item.text, ...continuedLines.map(line => line.text)].join(' ');

            return (
              <View
                key={`${item.characterId}-${item.lineNumber}`}
                style={styles.dialogueLine}
              >
                <View style={styles.lineNumberContainer}>
                  <Text style={styles.lineNumber}>{sequentialNumber}</Text>
                </View>
                <View style={[
                  styles.dialogueContent,
                  index === currentLineIndex && styles.currentLine,
                  item.isAction && styles.actionLine
                ]}>
                  {!item.isAction && <Text style={styles.characterName}>{item.characterName}</Text>}
                  <View style={styles.dialogueRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.dialogueText,
                        item.isAction && styles.actionText
                      ]}>
                        {fullText}
                      </Text>
                    </View>
                    {!item.isAction && !item.isUser && characterVoicesRef.current[item.characterName] &&
                      <IconButton
                        icon={currentlyPlayingLine === `${scriptId}_${item.characterName}_${item.lineNumber}` ? "stop" : "play"}
                        size={20}
                        mode="contained-tonal"
                        onPress={() => {
                          const lineId = `${scriptId}_${item.characterName}_${item.lineNumber}`;
                          const voiceId = characterVoicesRef.current[item.characterName].voice;
                          // Find the line in processedLines instead of character dialogue
                          const processedLine = processedLinesRef.current.find(
                            (pl: { characterName: string; originalLineNumber: number }) => 
                              pl.characterName === item.characterName && pl.originalLineNumber === item.lineNumber
                          );
                          const voiceUrl = processedLine?.voices?.[voiceId];
                          
                          if (voiceUrl) {
                            if (currentlyPlayingLine === lineId) {
                              if (soundRef.current) {
                                soundRef.current.stop();
                                soundRef.current.release();
                                soundRef.current = null;
                              }
                              setCurrentlyPlayingLine(null);
                            } else {
                              playVoiceLine(lineId, voiceUrl);
                            }
                          }
                        }}
                        style={styles.playButton}
                      />
                    }
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={!!error} onDismiss={() => setError(null)}>
          <Dialog.Title>Error</Dialog.Title>
          <Dialog.Content>
            <Text>{error}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setError(null)}>OK</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog 
          visible={settingsVisible} 
          onDismiss={() => setSettingsVisible(false)}
          style={styles.settingsDialog}
        >
          <Dialog.Title>Change Character</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogueSubtext}>
              Select the character you want to practice as. Other characters will be voiced by AI.
            </Text>
            <View style={styles.characterList}>
              {script.analysis?.characters?.map((character) => (
                <Button
                  key={character.name}
                  mode={currentCharacter.name === character.name ? "contained" : "outlined"}
                  onPress={() => handleCharacterChange(character.name)}
                  style={styles.characterButton}
                >
                  {character.name} ({character.lines} lines)
                </Button>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSettingsVisible(false)}>
              Close
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={isGeneratingVoices} dismissable={false}>
          <Dialog.Content>
            <View style={styles.generatingContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.generatingText}>{generationProgress}</Text>
            </View>
          </Dialog.Content>
        </Dialog>
      </Portal>
    </View>
  );
};

const getVoiceDescription = (voice: VoiceOption): string => {
  return VOICE_INFO[voice].description;
};

export default PracticeScript; 