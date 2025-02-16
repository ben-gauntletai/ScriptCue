import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, TextInput, Button, useTheme, HelperText, Portal, Dialog } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { NavigationProp, RootStackParamList } from '../../navigation/types';
import { Script } from '../../types/script';
import firebaseService from '../../services/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

type EditScriptRouteProp = RouteProp<RootStackParamList, 'EditScript'>;

const EditScript = () => {
  const [script, setScript] = useState<Script | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'in_progress' | 'completed'>('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateScriptId, setDuplicateScriptId] = useState<string | null>(null);

  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditScriptRouteProp>();
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
              const scriptData = {
                id: doc.id,
                title: data?.title || '',
                description: data?.description || '',
                status: data?.status || 'draft',
                scenes: data?.scenes || [],
                characters: data?.characters || [],
                settings: data?.settings || [],
                userId: data?.userId || '',
                createdAt: data?.createdAt?.toDate(),
                updatedAt: data?.updatedAt?.toDate(),
              } as Script;
              
              setScript(scriptData);
              setTitle(scriptData.title);
              setDescription(scriptData.description || '');
              setStatus(scriptData.status as 'draft' | 'in_progress' | 'completed');
            } else {
              navigation.goBack();
            }
            setLoading(false);
          },
          (error: Error) => {
            console.error('Error listening to script:', error);
            setError('Failed to load script. Please try again.');
            setLoading(false);
          }
        );
      } catch (error: any) {
        console.error('Error setting up script listener:', error);
        setError('Failed to load script. Please try again.');
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

  const validateForm = async (): Promise<boolean> => {
    let isValid = true;

    // Basic validation
    if (!title.trim()) {
      setTitleError('Title is required');
      isValid = false;
    } else {
      setTitleError(null);
    }

    if (!isValid) return false;

    // Check for duplicate titles (excluding current script)
    if (title.trim() !== script?.title) {
      try {
        const snapshot = await firebaseService.checkDuplicateTitle(user?.uid, title.trim());

        if (!snapshot.empty) {
          const duplicateScript = snapshot.docs[0];
          setDuplicateScriptId(duplicateScript.id);
          setShowDuplicateDialog(true);
          return false;
        }
      } catch (err) {
        console.error('Error checking for duplicate titles:', err);
        setError('Failed to validate title. Please try again.');
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!user || !script) return;
    
    setSaving(true);
    setError(null);

    try {
      const isValid = await validateForm();
      if (!isValid) {
        setSaving(false);
        return;
      }

      await firebaseService.updateScript(scriptId, {
        title: title.trim(),
        description: description.trim() || null,
        status,
      });

      navigation.goBack();
    } catch (err: any) {
      console.error('Error updating script:', err);
      setError('Failed to update script. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateDialogResponse = (shouldNavigate: boolean) => {
    setShowDuplicateDialog(false);
    if (shouldNavigate && duplicateScriptId) {
      navigation.replace('ScriptDetail', { scriptId: duplicateScriptId });
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="headlineMedium" style={styles.title}>Edit Script</Text>

        <View style={styles.form}>
          <TextInput
            label="Title"
            value={title}
            onChangeText={text => {
              setTitle(text);
              setTitleError(null);
              setError(null);
            }}
            mode="outlined"
            error={!!titleError}
            style={styles.input}
            disabled={saving}
          />
          {titleError && (
            <HelperText type="error" visible={!!titleError}>
              {titleError}
            </HelperText>
          )}

          <TextInput
            label="Description (Optional)"
            value={description}
            onChangeText={text => {
              setDescription(text);
              setError(null);
            }}
            mode="outlined"
            multiline
            numberOfLines={4}
            style={styles.input}
            disabled={saving}
          />

          <Text variant="bodyMedium" style={styles.label}>Status</Text>
          <View style={styles.statusButtons}>
            <Button
              mode={status === 'draft' ? 'contained' : 'outlined'}
              onPress={() => setStatus('draft')}
              style={styles.statusButton}
              disabled={saving}
            >
              Draft
            </Button>
            <Button
              mode={status === 'in_progress' ? 'contained' : 'outlined'}
              onPress={() => setStatus('in_progress')}
              style={styles.statusButton}
              disabled={saving}
            >
              In Progress
            </Button>
            <Button
              mode={status === 'completed' ? 'contained' : 'outlined'}
              onPress={() => setStatus('completed')}
              style={styles.statusButton}
              disabled={saving}
            >
              Completed
            </Button>
          </View>

          {error && (
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {error}
            </Text>
          )}

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.button}
          >
            Save Changes
          </Button>

          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            disabled={saving}
            style={styles.button}
          >
            Cancel
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={showDuplicateDialog} onDismiss={() => handleDuplicateDialogResponse(false)}>
          <Dialog.Title>Duplicate Title</Dialog.Title>
          <Dialog.Content>
            <Text>A script with this title already exists. Would you like to view the existing script?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => handleDuplicateDialogResponse(false)}>Stay Here</Button>
            <Button onPress={() => handleDuplicateDialogResponse(true)}>View Existing</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
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
  title: {
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: 'transparent',
  },
  label: {
    marginBottom: 8,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
  },
  button: {
    marginTop: 8,
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
  },
});

export default EditScript; 