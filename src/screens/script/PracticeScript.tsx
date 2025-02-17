import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton, useTheme, Button, Portal, Dialog, MD3Theme, RadioButton, ActivityIndicator, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MainNavigationProp, MainStackParamList } from '../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptCharacter } from '../../types/script';
import firebaseService from '../../services/firebase';
import Sound from 'react-native-sound';

type PracticeScriptRouteProp = RouteProp<MainStackParamList, 'PracticeScript'>;

interface DialogueItem {
  characterId: string;
  characterName: string;
  text: string;
  lineNumber: number;
  isUser: boolean;
}

type VoiceOption = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

const VOICE_OPTIONS: VoiceOption[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];

interface VoiceSettings {
  voice: VoiceOption;
  testText: string;
}

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  voiceSettingsButton: {
    marginRight: 8,
  },
  voiceSettingsDialog: {
    maxHeight: '80%',
  },
  voiceOptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
  },
  voiceInfo: {
    flex: 1,
    marginLeft: 8,
  },
  voiceName: {
    textTransform: 'capitalize',
  },
  testButton: {
    marginLeft: 8,
  },
  testingIndicator: {
    marginLeft: 8,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  testTextInput: {
    marginBottom: 16,
  },
  voiceDescription: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
});

const PracticeScript: React.FC = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<ScriptCharacter | null>(null);
  const [dialogue, setDialogue] = useState<DialogueItem[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSettingsVisible, setVoiceSettingsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('alloy');
  const [testingVoice, setTestingVoice] = useState<VoiceOption | null>(null);
  const [voiceTestError, setVoiceTestError] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [testText, setTestText] = useState<string>('');
  const [characterVoices, setCharacterVoices] = useState<Record<string, VoiceSettings>>({});

  const navigation = useNavigation<MainNavigationProp>();
  const route = useRoute<PracticeScriptRouteProp>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { scriptId, characterId } = route.params;

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

            // Set initial test text from character's first line
            if (character.dialogue && character.dialogue.length > 0) {
              setTestText(character.dialogue[0].text);
            }

            // Load saved voice settings if they exist
            const savedVoices = await firebaseService.getCharacterVoices(scriptId);
            if (savedVoices) {
              setCharacterVoices(savedVoices);
              if (savedVoices[character.name]) {
                setSelectedVoice(savedVoices[character.name].voice);
                setTestText(savedVoices[character.name].testText || character.dialogue?.[0]?.text || '');
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
            // Sort by line number
            allDialogue.sort((a, b) => a.lineNumber - b.lineNumber);
            if (allDialogue.length === 0) {
              setError('No dialogue found in the script');
            } else {
              setDialogue(allDialogue);
            }
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
    // Enable playback in silence mode
    Sound.setCategory('Playback');

    return () => {
      // Cleanup sound when component unmounts
      if (sound) {
        sound.release();
      }
    };
  }, [sound]);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleVoiceSettings = () => {
    setVoiceSettingsVisible(true);
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    // TODO: Implement recording functionality
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // TODO: Implement recording stop functionality
  };

  const handleTestVoice = async (voice: VoiceOption) => {
    setTestingVoice(voice);
    setVoiceTestError(null);
    
    if (sound) {
      sound.release();
      setSound(null);
    }
    
    try {
      const textToTest = testText || `This is a test of the ${voice} voice.`;
      const audioUrl = await firebaseService.testVoice(voice, textToTest);
      
      const newSound = new Sound(audioUrl, '', (error: any) => {
        if (error) {
          console.error('Error loading sound:', error);
          setVoiceTestError('Failed to load audio. Please try again.');
          setTestingVoice(null);
          return;
        }
        
        newSound.play((success: boolean) => {
          if (!success) {
            console.error('Error playing sound');
            setVoiceTestError('Failed to play audio. Please try again.');
          }
          setTestingVoice(null);
        });
      });
      
      setSound(newSound);
    } catch (error) {
      console.error('Error testing voice:', error);
      setVoiceTestError('Failed to test voice. Please try again.');
      setTestingVoice(null);
    }
  };

  const handleSaveVoiceSettings = async () => {
    if (!currentCharacter) return;
    
    try {
      const updatedVoices = {
        ...characterVoices,
        [currentCharacter.name]: {
          voice: selectedVoice,
          testText: testText
        }
      };
      
      await firebaseService.saveCharacterVoices(scriptId, updatedVoices);
      setCharacterVoices(updatedVoices);
      setVoiceSettingsVisible(false);
    } catch (error) {
      console.error('Error saving voice settings:', error);
      setVoiceTestError('Failed to save voice settings. Please try again.');
    }
  };

  if (!script || !currentCharacter) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" onPress={handleBack} />
          <Text>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={handleBack} />
        <Text>Practicing as {currentCharacter.name}</Text>
        <IconButton 
          icon="cog" 
          onPress={handleVoiceSettings}
          style={styles.voiceSettingsButton}
        />
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

      <View style={styles.controls}>
        <Button
          mode="contained"
          onPress={isRecording ? handleStopRecording : handleStartRecording}
          icon={isRecording ? "stop" : "microphone"}
        >
          {isRecording ? "Stop" : "Start"}
        </Button>
      </View>

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
          visible={voiceSettingsVisible} 
          onDismiss={() => setVoiceSettingsVisible(false)}
          style={styles.voiceSettingsDialog}
        >
          <Dialog.Title>Voice Settings for {currentCharacter?.name}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <TextInput
                label="Test Text"
                value={testText}
                onChangeText={setTestText}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.testTextInput}
                placeholder="Enter text to test the voice with..."
              />
              
              {VOICE_OPTIONS.map((voice) => (
                <View key={voice} style={styles.voiceOptionContainer}>
                  <RadioButton
                    value={voice}
                    status={selectedVoice === voice ? 'checked' : 'unchecked'}
                    onPress={() => setSelectedVoice(voice)}
                  />
                  <View style={styles.voiceInfo}>
                    <Text style={styles.voiceName}>{voice}</Text>
                    <Text style={styles.voiceDescription}>
                      {getVoiceDescription(voice)}
                    </Text>
                  </View>
                  {testingVoice === voice ? (
                    <ActivityIndicator size="small" style={styles.testingIndicator} />
                  ) : (
                    <Button 
                      mode="outlined"
                      onPress={() => handleTestVoice(voice)}
                      style={styles.testButton}
                      disabled={!!testingVoice}
                    >
                      Test
                    </Button>
                  )}
                </View>
              ))}
              {voiceTestError && (
                <Text style={{ color: theme.colors.error, marginTop: 8 }}>
                  {voiceTestError}
                </Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setVoiceSettingsVisible(false)}>Cancel</Button>
            <Button onPress={handleSaveVoiceSettings} mode="contained">
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

const getVoiceDescription = (voice: VoiceOption): string => {
  const descriptions: Record<VoiceOption, string> = {
    alloy: 'Neutral, balanced voice',
    echo: 'Warm, natural voice',
    fable: 'British, authoritative voice',
    onyx: 'Deep, resonant voice',
    nova: 'Energetic, youthful voice',
    shimmer: 'Clear, bright voice',
    ash: 'Soft, gentle voice',
    coral: 'Expressive, dynamic voice',
    sage: 'Mature, thoughtful voice'
  };
  return descriptions[voice];
};

export default PracticeScript; 