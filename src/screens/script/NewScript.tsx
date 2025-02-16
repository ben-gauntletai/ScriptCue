import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, TextInput, Button, useTheme, HelperText, Portal, Dialog } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { MainNavigationProp } from '../../navigation/types';
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

  const navigation = useNavigation<MainNavigationProp>();
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
    console.log('Starting script creation...');
    
    if (!user) {
      console.error('No user found');
      setError('You must be signed in to create a script');
      return;
    }

    if (!title.trim()) {
      console.log('Title is empty');
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Validating form...');
      const isValid = await validateForm();
      if (!isValid) {
        if (duplicateScriptId) {
          setShowDuplicateDialog(true);
        }
        setLoading(false);
        return;
      }

      console.log('Creating script with title:', title);
      const scriptId = await firebaseService.createScript({
        title: title.trim(),
        description: description?.trim(),
        status: 'draft',
        scenes: [],
        characters: [],
        settings: []
      });

      console.log('Script created with ID:', scriptId);

      // Navigate to the script detail screen
      navigation.reset({
        index: 0,
        routes: [
          { 
            name: 'ScriptDetail',
            params: { scriptId }
          }
        ]
      });
    } catch (error) {
      console.error('Error creating script:', error);
      setError(error instanceof Error ? error.message : 'Failed to create script');
      setLoading(false);
    }
  };

  const handleDuplicateDialogResponse = async (shouldNavigate: boolean) => {
    console.log('Handling duplicate dialog response:', shouldNavigate);
    setShowDuplicateDialog(false);
    
    if (shouldNavigate && duplicateScriptId) {
      console.log('Navigating to existing script:', duplicateScriptId);
      navigation.replace('ScriptDetail', { scriptId: duplicateScriptId });
    } else {
      console.log('Creating new script despite duplicate');
      // Create a new script without checking for duplicates
      setLoading(true);
      try {
        const scriptId = await firebaseService.createScript({
          title: title.trim(),
          description: description?.trim(),
          status: 'draft',
          scenes: [],
          characters: [],
          settings: []
        });

        console.log('Duplicate script created with ID:', scriptId);
        navigation.reset({
          index: 0,
          routes: [
            { 
              name: 'ScriptDetail',
              params: { scriptId }
            }
          ]
        });
      } catch (error) {
        console.error('Error creating duplicate script:', error);
        setError(error instanceof Error ? error.message : 'Failed to create script');
      } finally {
        setLoading(false);
      }
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