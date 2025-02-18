import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton, useTheme, Button, Portal, Dialog, MD3Theme, RadioButton, ActivityIndicator, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MainNavigationProp, MainStackParamList } from '../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptCharacter } from '../../types/script';
import firebaseService from '../../services/firebase';

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

            // Load saved voice settings if they exist
            const savedVoices = await firebaseService.getCharacterVoices(scriptId);
            if (savedVoices) {
              setCharacterVoices(savedVoices as Record<string, VoiceSettings>);
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

  const handleStartRecording = () => {
    setIsRecording(true);
    // TODO: Implement recording functionality
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // TODO: Implement recording stop functionality
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
          onPress={handleSettings}
          style={styles.settingsButton}
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
      </Portal>
    </SafeAreaView>
  );
};

const getVoiceDescription = (voice: VoiceOption): string => {
  return VOICE_INFO[voice].description;
};

export default PracticeScript; 