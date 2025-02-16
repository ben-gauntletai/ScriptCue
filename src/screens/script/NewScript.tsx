import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, TextInput, Button, useTheme, HelperText, Portal, Dialog } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { NavigationProp } from '../../navigation/types';
import { NewScriptData, Script } from '../../types/script';
import firebaseService from '../../services/firebase';

const NewScript = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateScriptId, setDuplicateScriptId] = useState<string | null>(null);
  const [pendingScript, setPendingScript] = useState<NewScriptData | null>(null);

  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const theme = useTheme();

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

    // Check for duplicate titles
    try {
      const snapshot = await firebaseService.checkDuplicateTitle(user?.uid, title.trim());

      if (!snapshot.empty) {
        const duplicateScript = snapshot.docs[0];
        setDuplicateScriptId(duplicateScript.id);
        return false;
      }
    } catch (err) {
      console.error('Error checking for duplicate titles:', err);
      setError('Failed to validate title. Please try again.');
      return false;
    }

    return true;
  };

  const handleCreate = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);

    try {
      const isValid = await validateForm();
      if (!isValid) {
        // If there's a duplicate, show the dialog and store the pending script
        if (duplicateScriptId) {
          const newScript: NewScriptData = {
            title: title.trim(),
            description: description.trim() || null,
            userId: user.uid,
            status: 'draft',
            scenes: [],
            characters: [],
            settings: []
          };
          setPendingScript(newScript);
          setShowDuplicateDialog(true);
        }
        setLoading(false);
        return;
      }

      await createScript();
    } catch (err) {
      console.error('Error creating script:', err);
      setError('Failed to create script. Please check your connection and try again.');
      setLoading(false);
    }
  };

  const createScript = async () => {
    if (!user || !title.trim()) return;

    try {
      const newScript = pendingScript || {
        title: title.trim(),
        description: description.trim() || null,
        userId: user.uid,
        status: 'draft',
        scenes: [],
        characters: [],
        settings: []
      };

      const scriptId = await firebaseService.createScript(newScript);
      navigation.replace('ScriptDetail', { scriptId });
    } catch (err) {
      console.error('Error creating script:', err);
      setError('Failed to create script. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setPendingScript(null);
    }
  };

  const handleDuplicateDialogResponse = async (shouldNavigate: boolean) => {
    setShowDuplicateDialog(false);
    if (shouldNavigate && duplicateScriptId) {
      navigation.replace('ScriptDetail', { scriptId: duplicateScriptId });
    } else if (pendingScript) {
      // If user wants to create anyway, proceed with creation
      setLoading(true);
      await createScript();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="headlineMedium" style={styles.title}>Create New Script</Text>

        <View style={styles.form}>
          <TextInput
            label="Title"
            value={title}
            onChangeText={text => {
              setTitle(text);
              setTitleError(null);
              setError(null);
              setDuplicateScriptId(null);
              setPendingScript(null);
            }}
            mode="outlined"
            error={!!titleError}
            style={styles.input}
            disabled={loading}
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
            disabled={loading}
          />

          {error && (
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {error}
            </Text>
          )}

          <Button
            mode="contained"
            onPress={handleCreate}
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            Create Script
          </Button>

          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            disabled={loading}
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
            <Text>A script with this title already exists. Would you like to view the existing script or create a new one with the same title?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => handleDuplicateDialogResponse(true)}>View Existing</Button>
            <Button onPress={() => handleDuplicateDialogResponse(false)}>Create Anyway</Button>
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
  title: {
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: 'transparent',
  },
  button: {
    marginTop: 8,
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
  },
});

export default NewScript; 