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
    maxHeight: 300,
  },
  contentScroll: {
    maxHeight: 280,
  },
  contentText: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
});

const ScriptDetail: React.FC = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [addSceneDialogVisible, setAddSceneDialogVisible] = useState(false);
  const [addCharacterDialogVisible, setAddCharacterDialogVisible] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newCharacterGender, setNewCharacterGender] = useState<'male' | 'female' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);

  const navigation = useNavigation<MainNavigationProp>();
  const route = useRoute<ScriptDetailRouteProp>();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { scriptId } = route.params;

  useEffect(() => {
    let unsubscribe: () => void;
    let processingUnsubscribe: () => void;

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

        // Subscribe to processing status
        processingUnsubscribe = firebaseService.subscribeToProcessingStatus(
          scriptId,
          (status: ProcessingStatus) => {
            console.log('Processing status update:', status);
            setProcessingStatus(status);
            
            // Log when processing completes
            if (status.status.toLowerCase() === 'completed') {
              console.log('Script processing completed:', {
                scriptId,
                timestamp: status.updatedAt
              });
            }
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
      if (processingUnsubscribe) {
        processingUnsubscribe();
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

  const handleAddScene = async () => {
    if (!script || !newSceneName.trim()) return;

    try {
      const newScene: ScriptScene = {
        id: Date.now().toString(),
        name: newSceneName.trim(),
        startLine: 0,
        endLine: 0
      };

      await firebaseService.updateScript(scriptId, {
        scenes: [...script.scenes, newScene],
      });

      setNewSceneName('');
      setAddSceneDialogVisible(false);
    } catch (error) {
      console.error('Error adding scene:', error);
      setError('Failed to add scene. Please try again.');
    }
  };

  const handleAddCharacter = async () => {
    if (!script || !newCharacterName.trim()) return;

    try {
      const newCharacter: ScriptCharacter = {
        id: Date.now().toString(),
        name: newCharacterName.trim(),
        voiceId: null,
        gender: newCharacterGender
      };

      await firebaseService.updateScript(scriptId, {
        characters: [...script.characters, newCharacter],
      });

      setNewCharacterName('');
      setNewCharacterGender('unknown');
      setAddCharacterDialogVisible(false);
    } catch (error) {
      console.error('Error adding character:', error);
      setError('Failed to add character. Please try again.');
    }
  };

  const renderProcessingStatus = () => {
    if (!processingStatus) return null;

    const getStatusColor = (status: string) => {
      switch (status.toLowerCase()) {
        case 'error':
          return theme.colors.error;
        case 'completed':
          return theme.colors.primary;
        default:
          return theme.colors.primary;
      }
    };

    return (
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Processing Status
        </Text>
        <View style={styles.processingStatus}>
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ marginBottom: 8 }}>
                {processingStatus.status}
              </Text>
              {processingStatus.progress !== undefined && (
                <>
                  <ProgressBar
                    progress={processingStatus.progress / 100}
                    color={getStatusColor(processingStatus.status)}
                    style={styles.progressBar}
                  />
                  <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant }}>
                    {processingStatus.progress}% Complete
                  </Text>
                </>
              )}
              {processingStatus.error && (
                <Text style={{ color: theme.colors.error, marginTop: 8 }}>
                  Error: {processingStatus.error}
                </Text>
              )}
            </View>
            {processingStatus.status.toLowerCase() !== 'completed' && 
             processingStatus.status.toLowerCase() !== 'error' && (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            )}
          </View>
        </View>
      </View>
    );
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
              Character Analysis
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
              <Text style={styles.contentText}>
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
          <Menu.Item onPress={handleEdit} title="Edit" leadingIcon="pencil" />
          <Divider />
          <Menu.Item 
            onPress={handleDeletePress} 
            title="Delete" 
            leadingIcon="delete"
            titleStyle={{ color: theme.colors.error }}
          />
        </Menu>
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

        {renderProcessingStatus()}
        {renderAnalysis()}
        {renderContent()}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Scenes ({script.scenes?.length || 0})
            </Text>
            <Button
              mode="contained"
              onPress={() => setAddSceneDialogVisible(true)}
              icon="plus"
            >
              Add Scene
            </Button>
          </View>
          {script.scenes.map((scene, index) => (
            <View key={scene.id} style={styles.listItem}>
              <Text variant="bodyLarge">{scene.name}</Text>
              <Text variant="bodySmall">Lines: {scene.startLine} - {scene.endLine}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Characters ({script.characters?.length || 0})
            </Text>
            <Button
              mode="contained"
              onPress={() => setAddCharacterDialogVisible(true)}
              icon="plus"
            >
              Add Character
            </Button>
          </View>
          {script.characters.map((character, index) => (
            <View key={character.id} style={styles.listItem}>
              <Text variant="bodyLarge">{character.name}</Text>
              <Text variant="bodySmall">Gender: {character.gender}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, styles.metaSection]}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Script Information
          </Text>
          <View style={styles.metaInfo}>
            <Text variant="bodyMedium" style={styles.metaText}>
              Created: {script.createdAt?.toLocaleString()}
            </Text>
            <Text variant="bodyMedium" style={styles.metaText}>
              Last updated: {script.updatedAt?.toLocaleString()}
            </Text>
          </View>
        </View>
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

        <Dialog visible={addSceneDialogVisible} onDismiss={() => setAddSceneDialogVisible(false)}>
          <Dialog.Title>Add New Scene</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Scene Name"
              value={newSceneName}
              onChangeText={setNewSceneName}
              mode="outlined"
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddSceneDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleAddScene} disabled={!newSceneName.trim()}>Add</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={addCharacterDialogVisible} onDismiss={() => setAddCharacterDialogVisible(false)}>
          <Dialog.Title>Add New Character</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Character Name"
              value={newCharacterName}
              onChangeText={setNewCharacterName}
              mode="outlined"
              style={styles.dialogInput}
            />
            <View style={styles.genderSelector}>
              <Text variant="bodyMedium">Gender:</Text>
              <Button
                mode={newCharacterGender === 'male' ? 'contained' : 'outlined'}
                onPress={() => setNewCharacterGender('male')}
                style={styles.genderButton}
              >
                Male
              </Button>
              <Button
                mode={newCharacterGender === 'female' ? 'contained' : 'outlined'}
                onPress={() => setNewCharacterGender('female')}
                style={styles.genderButton}
              >
                Female
              </Button>
              <Button
                mode={newCharacterGender === 'unknown' ? 'contained' : 'outlined'}
                onPress={() => setNewCharacterGender('unknown')}
                style={styles.genderButton}
              >
                Unknown
              </Button>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddCharacterDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleAddCharacter} disabled={!newCharacterName.trim()}>Add</Button>
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