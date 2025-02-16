import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Button, useTheme, IconButton, Menu, Divider, Portal, Dialog, FAB, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NavigationProp, RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script, ScriptScene, ScriptCharacter } from '../../types/script';
import firebaseService from '../../services/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

type ScriptDetailRouteProp = RouteProp<RootStackParamList, 'ScriptDetail'>;

const ScriptDetail: React.FC = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [addSceneDialogVisible, setAddSceneDialogVisible] = useState(false);
  const [addCharacterDialogVisible, setAddCharacterDialogVisible] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newCharacterGender, setNewCharacterGender] = useState<'male' | 'female' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);

  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScriptDetailRouteProp>();
  const { user } = useAuth();
  const theme = useTheme();
  const { scriptId } = route.params;

  useEffect(() => {
    let unsubscribe: () => void;

    const setupScriptListener = async () => {
      if (!user || !scriptId) return;

      try {
        unsubscribe = firebaseService.scriptListener(
          scriptId,
          (doc: FirebaseFirestoreTypes.DocumentSnapshot) => {
            if (doc.exists && doc.data()?.userId === user.uid) {
              const data = doc.data();
              setScript({
                id: doc.id,
                title: data?.title || '',
                description: data?.description,
                status: data?.status || 'draft',
                scenes: data?.scenes || [],
                characters: data?.characters || [],
                settings: data?.settings || [],
                userId: data?.userId || '',
                createdAt: data?.createdAt?.toDate(),
                updatedAt: data?.updatedAt?.toDate(),
              } as Script);
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
        console.error('Error setting up script listener:', error);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
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
  },
  description: {
    opacity: 0.7,
  },
  listItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8,
  },
  metaSection: {
    opacity: 0.7,
  },
  metaInfo: {
    gap: 4,
  },
  metaText: {
    fontSize: 12,
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
});

export default ScriptDetail; 