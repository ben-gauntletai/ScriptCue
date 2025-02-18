import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button, useTheme, IconButton, Menu, Divider, Portal, Dialog, FAB, TextInput, ProgressBar, MD3Theme, Card, RadioButton } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MainNavigationProp, MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptScene, ScriptCharacter, ProcessingStatus } from '../../types/script';
import firebaseService from '../../services/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import Sound from 'react-native-sound';

type ScriptDetailRouteProp = RouteProp<MainStackParamList, 'ScriptDetail'>;

type VoiceOption = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

interface VoiceInfo {
  description: string;
  gender: 'Male' | 'Female';
}

interface VoiceSettings {
  voice: string;
  testText: string;
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

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    color: theme.colors.onBackground,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    color: theme.colors.onBackground,
  },
  description: {
    color: theme.colors.onSurfaceVariant,
  },
  listItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    borderRadius: 8,
    marginBottom: 8,
  },
  processingStatus: {
    padding: 12,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 8,
    marginTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  analysisContainer: {
    gap: 16,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  metadataItem: {
    minWidth: 100,
    backgroundColor: theme.colors.surfaceVariant,
    padding: 12,
    borderRadius: 8,
  },
  characterAnalysis: {
    marginTop: 16,
  },
  subsectionTitle: {
    marginBottom: 8,
  },
  characterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
  },
  dialogInput: {
    marginBottom: 16,
  },
  genderSelector: {
    marginTop: 16,
    gap: 8,
  },
  genderButton: {
    marginTop: 8,
  },
  metaSection: {
    opacity: 0.7,
  },
  metaInfo: {
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  contentCard: {
    marginTop: 8,
  },
  contentScroll: {
  },
  contentText: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
    padding: 8,
  },
  dialogueContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceVariant,
  },
  dialogueHeader: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 4,
  },
  dialogueLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
  },
  lineNumber: {
    minWidth: 60,
    color: theme.colors.onSurfaceVariant,
  },
  dialogueText: {
    flex: 1,
    color: theme.colors.onSurface,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  practiceButton: {
    marginRight: 8,
  },
  dialogueSubtext: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 16,
  },
  characterList: {
    gap: 8,
  },
  characterButton: {
    marginVertical: 4,
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
  testTextInput: {
    marginBottom: 16,
  },
  voiceDescription: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});

const ScriptDetail: React.FC = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practiceDialogVisible, setPracticeDialogVisible] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [voiceSettingsVisible, setVoiceSettingsVisible] = useState(false);
  const [selectedCharacterForVoice, setSelectedCharacterForVoice] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('alloy');
  const [testingVoice, setTestingVoice] = useState<VoiceOption | null>(null);
  const [voiceTestError, setVoiceTestError] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [testText, setTestText] = useState<string>('');
  const [characterVoices, setCharacterVoices] = useState<Record<string, VoiceSettings>>({});

  const navigation = useNavigation<MainNavigationProp>();
  const route = useRoute<ScriptDetailRouteProp>();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { scriptId } = route.params;

  useEffect(() => {
    let unsubscribe: () => void;

    const setupScriptListener = async () => {
      if (!user || !scriptId) return;

      try {
        // Subscribe to script document
        unsubscribe = firebaseService.scriptListener(
          scriptId,
          async (doc: FirebaseFirestoreTypes.DocumentSnapshot) => {
            if (doc.exists && doc.data()?.userId === user.uid) {
              const data = doc.data();
              setScript({
                id: doc.id,
                ...data,
              } as Script);

              // Fetch script content if processing is completed
              if (data?.uploadStatus === 'completed') {
                try {
                  const analysis = await firebaseService.getScriptAnalysis(doc.id);
                  if (analysis?.content) {
                    setScriptContent(analysis.content);
                  }
                  
                  // Load saved voice settings
                  const savedVoices = await firebaseService.getCharacterVoices(doc.id);
                  if (savedVoices) {
                    setCharacterVoices(savedVoices);
                  }
                } catch (error) {
                  console.error('Error fetching script data:', error);
                }
              }
            } else {
              navigation.goBack();
            }
            setLoading(false);
          },
          (error: Error) => {
            console.error('Error listening to script:', error);
            setLoading(false);
          }
        );
      } catch (error: any) {
        console.error('Error setting up listeners:', error);
        setLoading(false);
      }
    };

    setupScriptListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [scriptId, user]);

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

  const handleDeletePress = () => {
    setMenuVisible(false);
    setDeleteDialogVisible(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteDialogVisible(false);
    try {
      await firebaseService.deleteScript(scriptId);
      navigation.goBack();
    } catch (error: any) {
      console.error('Error deleting script:', error);
      setError('Failed to delete script. Please try again.');
    }
  };

  const handlePracticePress = () => {
    if (selectedCharacter) {
      navigation.navigate('PracticeScript', {
        scriptId,
        characterId: selectedCharacter,
      });
      setPracticeDialogVisible(false);
      setSelectedCharacter(null);
    }
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
    if (!selectedCharacterForVoice) return;
    
    try {
      const updatedVoices = {
        ...characterVoices,
        [selectedCharacterForVoice]: {
          voice: selectedVoice,
          testText: testText
        }
      };
      
      await firebaseService.saveCharacterVoices(scriptId, updatedVoices);
      setCharacterVoices(updatedVoices);
      setVoiceSettingsVisible(false);
      setSelectedCharacterForVoice(null);
    } catch (error) {
      console.error('Error saving voice settings:', error);
      setVoiceTestError('Failed to save voice settings. Please try again.');
    }
  };

  const handleAssignVoice = (characterName: string) => {
    setSelectedCharacterForVoice(characterName);
    // Set initial test text from character's first line
    const character = script?.analysis?.characters.find(c => c.name === characterName);
    if (character?.dialogue?.[0]) {
      setTestText(character.dialogue[0].text);
    }
    // Load existing voice settings if they exist
    if (characterVoices[characterName]) {
      setSelectedVoice(characterVoices[characterName].voice as VoiceOption);
      setTestText(characterVoices[characterName].testText);
    } else {
      setSelectedVoice('alloy');
    }
    setVoiceSettingsVisible(true);
  };

  const getVoiceDescription = (voice: VoiceOption): string => {
    return VOICE_INFO[voice].description;
  };

  const handleRename = () => {
    setMenuVisible(false);
    setNewTitle(script?.title || '');
    setRenameDialogVisible(true);
  };

  const handleRenameConfirm = async () => {
    if (!script || !newTitle.trim()) return;

    try {
      await firebaseService.updateScript(script.id, {
        title: newTitle.trim(),
        updatedAt: new Date()
      });
      setRenameDialogVisible(false);
    } catch (error) {
      console.error('Error renaming script:', error);
      setError('Failed to rename script. Please try again.');
    }
  };

  const renderAnalysis = () => {
    if (!script?.analysis) return null;

    const { metadata, characters } = script.analysis;

    return (
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Script Analysis
        </Text>
        <View style={styles.analysisContainer}>
          <View style={styles.metadataRow}>
            <View style={styles.metadataItem}>
              <Text variant="bodySmall">Total Lines</Text>
              <Text variant="bodyLarge">{metadata.totalLines}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text variant="bodySmall">Duration</Text>
              <Text variant="bodyLarge">{Math.round(metadata.estimatedDuration)} min</Text>
            </View>
            {metadata.genre && (
              <View style={styles.metadataItem}>
                <Text variant="bodySmall">Genre</Text>
                <Text variant="bodyLarge">{metadata.genre}</Text>
              </View>
            )}
            {metadata.tone && (
              <View style={styles.metadataItem}>
                <Text variant="bodySmall">Tone</Text>
                <Text variant="bodyLarge">{metadata.tone}</Text>
              </View>
            )}
          </View>

          <View style={styles.characterAnalysis}>
            <Text variant="titleSmall" style={styles.subsectionTitle}>
              Characters
            </Text>
            {characters.map((char) => (
              <View key={char.name} style={styles.characterRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{char.name}</Text>
                  <Text variant="bodySmall">
                    {char.lines} lines {characterVoices[char.name] ? 
                      `• ${characterVoices[char.name].voice.charAt(0).toUpperCase() + characterVoices[char.name].voice.slice(1)} (${VOICE_INFO[characterVoices[char.name].voice as VoiceOption].gender} | ${getVoiceDescription(characterVoices[char.name].voice as VoiceOption)})` : 
                      '• No voice assigned'}
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  onPress={() => handleAssignVoice(char.name)}
                >
                  {characterVoices[char.name] ? 'Change Voice' : 'Assign Voice'}
                </Button>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (!scriptContent) return null;

    return (
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Script Content
        </Text>
        <Card style={styles.contentCard}>
          <Card.Content>
            <ScrollView style={styles.contentScroll}>
              <Text style={styles.contentText} selectable>
                {scriptContent}
              </Text>
            </ScrollView>
          </Card.Content>
        </Card>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (!script) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text>Script not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text variant="headlineMedium" style={styles.title}>
            {script.title}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button
            mode="contained"
            onPress={() => setPracticeDialogVisible(true)}
            icon="microphone"
            style={styles.practiceButton}
            disabled={!script.analysis?.characters?.length}
          >
            Practice
          </Button>
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                onPress={() => setMenuVisible(true)}
              />
            }
          >
            <Menu.Item 
              onPress={handleRename}
              title="Rename"
              leadingIcon="text"
            />
            <Menu.Item 
              onPress={handleDeletePress}
              title="Delete"
              leadingIcon="delete"
              titleStyle={{ color: theme.colors.error }}
            />
          </Menu>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {script.description && (
          <View style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Description
            </Text>
            <Text variant="bodyMedium" style={styles.description}>
              {script.description}
            </Text>
          </View>
        )}

        {renderAnalysis()}
        {renderContent()}
      </ScrollView>

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Script</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete "{script?.title}"? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleDeleteConfirm} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={practiceDialogVisible} onDismiss={() => setPracticeDialogVisible(false)}>
          <Dialog.Title>Choose Your Character</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogueSubtext}>
              Select the character you want to practice as. Other characters will be voiced by AI.
            </Text>
            <View style={styles.characterList}>
              {script.analysis?.characters?.map((character) => (
                <Button
                  key={character.name}
                  mode={selectedCharacter === character.name ? "contained" : "outlined"}
                  onPress={() => setSelectedCharacter(character.name)}
                  style={styles.characterButton}
                >
                  {character.name} ({character.lines} lines)
                </Button>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setPracticeDialogVisible(false);
              setSelectedCharacter(null);
            }}>
              Cancel
            </Button>
            <Button 
              onPress={handlePracticePress}
              disabled={!selectedCharacter}
            >
              Start Practice
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog 
          visible={voiceSettingsVisible} 
          onDismiss={() => {
            setVoiceSettingsVisible(false);
            setSelectedCharacterForVoice(null);
          }}
          style={styles.voiceSettingsDialog}
        >
          <Dialog.Title>Voice Settings for {selectedCharacterForVoice}</Dialog.Title>
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
            <Button onPress={() => {
              setVoiceSettingsVisible(false);
              setSelectedCharacterForVoice(null);
            }}>
              Cancel
            </Button>
            <Button onPress={handleSaveVoiceSettings} mode="contained">
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={renameDialogVisible} onDismiss={() => setRenameDialogVisible(false)}>
          <Dialog.Title>Rename Script</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Script Title"
              value={newTitle}
              onChangeText={setNewTitle}
              mode="outlined"
              autoFocus
              style={{ marginTop: 8 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={handleRenameConfirm}
              mode="contained"
              disabled={!newTitle.trim()}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {error && (
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
        </Portal>
      )}
    </SafeAreaView>
  );
};

export default ScriptDetail; 