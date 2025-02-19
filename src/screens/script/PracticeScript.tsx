import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, PermissionsAndroid, Alert } from 'react-native';
import { Text, IconButton, useTheme, Button, Portal, Dialog, MD3Theme, RadioButton, ActivityIndicator, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MainNavigationProp, MainStackParamList } from '../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptCharacter } from '../../types/script';
import firebaseService from '../../services/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, useCameraDevice, useCameraPermission, CameraPosition, CameraRuntimeError, CameraCaptureError, CameraDeviceFormat } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';

type PracticeScriptRouteProp = RouteProp<MainStackParamList, 'PracticeScript'>;

interface DialogueItem {
  characterId: string;
  characterName: string;
  text: string;
  lineNumber: number;
  isUser: boolean;
}

type VoiceOption = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

interface VoiceInfo {
  description: string;
  gender: 'Male' | 'Female';
}

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
});

const PracticeScript: React.FC = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<ScriptCharacter | null>(null);
  const [dialogue, setDialogue] = useState<DialogueItem[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characterVoices, setCharacterVoices] = useState<Record<string, VoiceSettings>>({});
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
  const camera = useRef<Camera>(null);
  const device = useCameraDevice(cameraPosition);
  const { hasPermission: cameraPermission, requestPermission } = useCameraPermission();

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
        const scriptData = await firebaseService.getScript(scriptId);
        if (scriptData && scriptData.analysis) {
          setScript(scriptData);
          const character = scriptData.analysis.characters.find((c) => c.name === characterId);
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

            // Load saved voice settings if they exist
            const savedVoices = await firebaseService.getCharacterVoices(scriptId);
            if (savedVoices) {
              setCharacterVoices(savedVoices as Record<string, VoiceSettings>);

              // Check if we need to generate voice lines
              const existingVoiceLines = await firebaseService.getVoiceLines(scriptId);
              
              // Get all non-practicing characters that have voice settings
              const charactersNeedingVoices = Object.keys(savedVoices).filter(charName => 
                charName !== characterId && // Skip practicing character
                scriptData?.analysis?.characters.some(c => c.name === charName) // Ensure character exists
              );

              const needsVoiceGeneration = charactersNeedingVoices.length > 0 && (
                !existingVoiceLines || // No voice lines exist yet
                charactersNeedingVoices.some(charName => {
                  const character = scriptData?.analysis?.characters.find(c => c.name === charName);
                  if (!character) return false;

                  // Check each line of the character
                  return (character.dialogue || []).some(line => {
                    const lineId = `${scriptId}_${charName}_${line.lineNumber}`;
                    const currentVoice = savedVoices[charName].voice;
                    
                    // Need generation if:
                    // 1. No audio exists for this line, or
                    // 2. No audio exists for the current voice setting
                    return !existingVoiceLines[lineId] || 
                           !existingVoiceLines[lineId].some(url => 
                             url.includes(`${lineId}_${currentVoice}.mp3`));
                  });
                })
              );

              if (needsVoiceGeneration) {
                setIsGeneratingVoices(true);
                setGenerationProgress('Generating Voices...');
                console.log('Generating voice lines for characters:', charactersNeedingVoices);
                try {
                  await firebaseService.generateVoiceLines(
                    scriptId,
                    characterId,
                    savedVoices
                  );
                  setIsGeneratingVoices(false);
                } catch (error) {
                  console.error('Error generating voice lines:', error);
                  setError('Failed to generate voice lines. Some characters may not have audio.');
                  setIsGeneratingVoices(false);
                }
              }
            }

            // Organize dialogue in sequential order
            const allDialogue: DialogueItem[] = [];
            scriptData.analysis.characters.forEach((char) => {
              if (char.dialogue && char.dialogue.length > 0) {
                char.dialogue.forEach((line) => {
                  allDialogue.push({
                    characterId: char.name,
                    characterName: char.name,
                    text: line.text,
                    lineNumber: line.lineNumber,
                    isUser: char.name === characterId,
                  });
                });
              }
            });

            // Sort dialogue by line number
            allDialogue.sort((a, b) => a.lineNumber - b.lineNumber);
            setDialogue(allDialogue);
          } else {
            setError('Character not found in script');
          }
        } else {
          setError('Script analysis not found');
        }
      } catch (error) {
        console.error('Error loading script:', error);
        setError('Failed to load script. Please try again.');
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
          setCameraError(`Camera error: ${error.message}`);
        }}
      />
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
        <IconButton
          icon="camera-flip"
          size={24}
          onPress={toggleCameraPosition}
          disabled={isRecording || isUploading}
        />
        <Button
          mode="contained"
          onPress={isRecording ? handleStopRecording : handleStartRecording}
          icon={isRecording ? "stop" : "video"}
          disabled={isUploading || !!cameraError}
        >
          {isRecording ? "Stop Recording" : "Start Recording"}
        </Button>
      </View>
      <ScrollView style={styles.content}>
        <View style={styles.dialogueContainer}>
          {dialogue.map((item, index) => (
            <View
              key={`${item.characterId}-${item.lineNumber}`}
              style={styles.dialogueLine}
            >
              <View style={styles.lineNumberContainer}>
                <Text style={styles.lineNumber}>{index + 1}</Text>
              </View>
              <View style={[
                styles.dialogueContent,
                index === currentLineIndex && styles.currentLine
              ]}>
                <Text style={styles.characterName}>{item.characterName}</Text>
                <Text style={styles.dialogueText}>{item.text}</Text>
              </View>
            </View>
          ))}
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