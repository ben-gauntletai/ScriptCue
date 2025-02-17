import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button, useTheme, IconButton, Menu, Divider, Portal, Dialog, FAB, TextInput, ProgressBar, MD3Theme, Card } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MainNavigationProp, MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptScene, ScriptCharacter, ProcessingStatus } from '../../types/script';
import firebaseService from '../../services/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

type ScriptDetailRouteProp = RouteProp<MainStackParamList, 'ScriptDetail'>;

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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: theme.colors.onPrimary,
    fontSize: 12,
    textTransform: 'capitalize',
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
                } catch (error) {
                  console.error('Error fetching script content:', error);
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

  const handleEdit = () => {
    setMenuVisible(false);
    navigation.navigate('EditScript', { scriptId });
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
                <Text variant="bodyMedium">{char.name}</Text>
                <Text variant="bodySmall">
                  {char.lines} lines (First appearance: line {char.firstAppearance})
                </Text>
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
          <View style={[styles.statusBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.statusText}>{script.status}</Text>
          </View>
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
          <IconButton
            icon="dots-vertical"
            onPress={() => setMenuVisible(true)}
          />
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