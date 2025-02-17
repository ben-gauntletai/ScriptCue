import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { Text, Button, useTheme, ProgressBar, Portal, Dialog, IconButton, TextInput } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MainNavigationProp } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker, { 
  DocumentPickerResponse, 
  types,
  isInProgress
} from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import firebaseService from '../../services/firebase';
import { v4 as uuidv4 } from 'uuid';
import firestore from '@react-native-firebase/firestore';

// Add type definitions
interface ProcessingStatus {
  status: string;
  progress?: number;
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const UploadScript: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number | null>(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [scriptTitle, setScriptTitle] = useState('');
  const [completedScriptId, setCompletedScriptId] = useState<string | null>(null);

  const navigation = useNavigation<MainNavigationProp>();
  const { user } = useAuth();
  const theme = useTheme();

  const validateFile = (file: DocumentPickerResponse): string | null => {
    console.log('Validating file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      uri: file.uri
    });

    if (!file.name) {
      return 'Invalid file name';
    }

    if (!file.type?.toLowerCase().includes('pdf')) {
      return 'Only PDF files are supported';
    }

    if (file.size && file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }

    return null;
  };

  const requestStoragePermission = async () => {
    if (Platform.OS !== 'android') return true;
    
    try {
      if (Platform.Version >= 33) {
        // For Android 13 and above, we need photo and video permissions
        const photoPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        );
        return photoPermission === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // For older Android versions
        const storagePermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        return storagePermission === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.error('Error requesting permissions:', err);
      return false;
    }
  };

  const createLocalCopy = async (file: DocumentPickerResponse): Promise<string> => {
    console.log('Creating local copy of file:', {
      uri: file.uri,
      fileCopyUri: file.fileCopyUri,
      type: file.type
    });
    
    try {
      // Use the fileCopyUri if available (this is the local copy created by DocumentPicker)
      if (file.fileCopyUri) {
        console.log('Using fileCopyUri:', file.fileCopyUri);
        return file.fileCopyUri;
      }

      // If no fileCopyUri, create our own copy
      const tempFilePath = `${RNFS.CachesDirectoryPath}/${uuidv4()}.pdf`;
      console.log('Creating new copy at:', tempFilePath);

      if (Platform.OS === 'android') {
        // For Android, we need to handle content:// URIs
        try {
          const base64Data = await RNFS.readFile(file.uri, 'base64');
          await RNFS.writeFile(tempFilePath, base64Data, 'base64');
        } catch (error) {
          console.error('Error copying file:', error);
          throw new Error('Failed to create local copy of file');
        }
      } else {
        // For iOS, direct copy should work
        await RNFS.copyFile(file.uri, tempFilePath);
      }

      // Verify the copy
      const stats = await RNFS.stat(tempFilePath);
      if (!stats.size) {
        throw new Error('Created file is empty');
      }

      console.log('Local copy created successfully at:', tempFilePath);
      return tempFilePath;
    } catch (error) {
      console.error('Error in createLocalCopy:', error);
      throw new Error('Failed to create local copy of file');
    }
  };

  const handleFilePick = useCallback(async () => {
    try {
      // Request permissions first
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        setError('Storage permission is required to select files');
        return;
      }

      console.log('Starting file pick...');
      const result = await DocumentPicker.pick({
        type: [types.pdf],
        mode: 'open',
        allowMultiSelection: false,
        presentationStyle: 'fullScreen',
        copyTo: 'cachesDirectory',
        transitionStyle: 'coverVertical'
      });

      console.log('File pick result:', result);
      const file = result[0];

      // Validate the file
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      // Create local copy
      const localPath = await createLocalCopy(file);
      console.log('Local copy created at:', localPath);

      // Create script document
      const scriptId = uuidv4();

      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      // Start upload
      await uploadFile(file, localPath, scriptId);

      // Clean up
      try {
        await RNFS.unlink(localPath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    } catch (err) {
      if (!isInProgress(err)) {
        console.error('Error picking document:', err);
        setError(err instanceof Error ? err.message : 'Failed to pick document');
      }
    }
  }, [user]);

  const uploadFile = async (file: DocumentPickerResponse, localFilePath: string, scriptId: string) => {
    if (!user?.uid) {
      setError('You must be logged in to upload scripts');
      return;
    }

    if (!file.name) {
      setError('Invalid file name');
      return;
    }

    setUploading(true);
    setError(null);
    
    try {
      console.log('Starting file upload...', {
        localFilePath,
        fileName: file.name,
        userId: user.uid,
        scriptId
      });

      // Create initial script document
      await firestore().collection('scripts').doc(scriptId).set({
        userId: user.uid,
        title: file.name?.replace('.pdf', '') || 'Untitled Script',
        originalFileName: file.name || 'Untitled Script.pdf',
        description: '',
        uploadStatus: 'uploading',
        createdAt: firestore.Timestamp.now(),
        updatedAt: firestore.Timestamp.now(),
      });

      // Upload the file
      const fileUrl = await firebaseService.uploadScript(
        localFilePath,
        file.name,
        user.uid,
        scriptId,
        (progress: number) => {
          console.log('Upload progress:', progress);
          setUploadProgress(progress);
        }
      );

      // Update the script document with the file URL
      await firestore().collection('scripts').doc(scriptId).update({
        fileUrl,
        uploadStatus: 'processing',
        updatedAt: firestore.Timestamp.now()
      });

      console.log('File uploaded successfully, setting up processing listener...');

      return new Promise((resolve, reject) => {
        const unsubscribe = firebaseService.listenToScriptProcessingStatus(
          scriptId,
          (status: ProcessingStatus) => {
            console.log('Processing status update:', status);
            setProcessingStatus(status.status);
            setProcessingProgress(status.progress || null);

            if (status.status === 'completed') {
              console.log('Processing completed, navigating back...');
              unsubscribe();
              navigation.replace('Scripts', {
                newScriptId: scriptId,
                scriptTitle: file.name?.replace('.pdf', '') || 'Untitled Script'
              });
              resolve(true);
            } else if (status.status === 'error') {
              console.error('Processing error:', status.error);
              const errorMessage = status.error || 'An error occurred during processing';
              setError(errorMessage);
              unsubscribe();
              reject(new Error(errorMessage));
            }
          },
          (error: Error) => {
            console.error('Error listening to processing status:', error);
            setError('Failed to monitor processing status');
            unsubscribe();
            reject(error);
          }
        );
      });
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file. Please try again.');
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const handleRenameScript = async () => {
    if (!completedScriptId || !scriptTitle.trim()) return;

    try {
      await firestore()
        .collection('scripts')
        .doc(completedScriptId)
        .update({
          title: scriptTitle.trim(),
          updatedAt: firestore.Timestamp.now()
        });

      navigation.replace('ScriptDetail', { scriptId: completedScriptId });
    } catch (error) {
      console.error('Error renaming script:', error);
      setError('Failed to rename script');
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surfaceVariant,
    },
    headerTitle: {
      flex: 1,
      marginLeft: 32,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
      gap: 16,
    },
    title: {
      marginBottom: 24,
      textAlign: 'center',
    },
    progressContainer: {
      width: '100%',
      marginTop: 24,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
    },
    progressText: {
      marginTop: 8,
      textAlign: 'center',
    },
    statusText: {
      marginTop: 16,
      textAlign: 'center',
    },
    infoText: {
      textAlign: 'center',
      marginTop: 8,
      color: theme.colors.onSurfaceVariant,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          onPress={() => navigation.goBack()}
        />
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Upload Script
        </Text>
      </View>

      <View style={styles.content}>
        {!uploading && !processingStatus && (
          <>
            <Button
              mode="contained"
              onPress={handleFilePick}
              icon="file-upload"
              loading={uploading}
            >
              Select PDF File
            </Button>
            <Text variant="bodySmall" style={styles.infoText}>
              Maximum file size: {MAX_FILE_SIZE / (1024 * 1024)}MB
            </Text>
          </>
        )}

        {(uploading || processingStatus) && (
          <View style={styles.progressContainer}>
            {uploading && (
              <>
                <ProgressBar
                  progress={uploadProgress / 100}
                  color={theme.colors.primary}
                  style={styles.progressBar}
                />
                <Text variant="bodyMedium" style={styles.progressText}>
                  Uploading: {Math.round(uploadProgress)}%
                </Text>
              </>
            )}

            {processingStatus && (
              <>
                <Text variant="titleMedium" style={styles.statusText}>
                  {processingStatus.charAt(0).toUpperCase() + processingStatus.slice(1)}
                </Text>
                {processingProgress !== null && (
                  <>
                    <ProgressBar
                      progress={processingProgress / 100}
                      color={theme.colors.primary}
                      style={styles.progressBar}
                    />
                    <Text variant="bodyMedium" style={styles.progressText}>
                      Progress: {Math.round(processingProgress)}%
                    </Text>
                  </>
                )}
              </>
            )}
          </View>
        )}
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
          visible={renameDialogVisible} 
          onDismiss={() => {
            setRenameDialogVisible(false);
            navigation.replace('ScriptDetail', { scriptId: completedScriptId! });
          }}
        >
          <Dialog.Title>Name Your Script</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Script Title"
              value={scriptTitle}
              onChangeText={setScriptTitle}
              mode="outlined"
              autoFocus
              style={{ marginTop: 8 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              onPress={() => {
                setRenameDialogVisible(false);
                navigation.replace('ScriptDetail', { scriptId: completedScriptId! });
              }}
            >
              Skip
            </Button>
            <Button
              onPress={handleRenameScript}
              mode="contained"
              disabled={!scriptTitle.trim()}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

export default UploadScript; 