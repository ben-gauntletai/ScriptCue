import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { Text, Button, useTheme, ProgressBar, Portal, Dialog, IconButton, TextInput, ActivityIndicator } from 'react-native-paper';
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
import firestore from '@react-native-firebase/firestore';

// Add type definitions
interface ProcessingStatus {
  status: string;
  progress?: number;
  error?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const PROCESSING_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Generate a unique ID using timestamp and random number
const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
};

const UploadScript: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number | null>(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [scriptTitle, setScriptTitle] = useState('');
  const [completedScriptId, setCompletedScriptId] = useState<string | null>(null);
  const [tempFilePath, setTempFilePath] = useState<string | null>(null);

  const navigation = useNavigation<MainNavigationProp>();
  const { user } = useAuth();
  const theme = useTheme();

  // Cleanup temporary files on component unmount or error
  useEffect(() => {
    return () => {
      if (tempFilePath) {
        RNFS.exists(tempFilePath)
          .then(exists => {
            if (exists) {
              RNFS.unlink(tempFilePath)
                .catch(err => console.error('Error cleaning up temp file:', err));
            }
          })
          .catch(err => console.error('Error checking temp file:', err));
      }
    };
  }, [tempFilePath]);

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
        const permissions = [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
        ];
        
        const results = await Promise.all(
          permissions.map(permission => PermissionsAndroid.request(permission))
        );
        
        return results.every(result => result === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
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
      // Use the fileCopyUri if available and valid
      if (file.fileCopyUri) {
        const exists = await RNFS.exists(file.fileCopyUri);
        if (exists) {
          console.log('Using existing fileCopyUri:', file.fileCopyUri);
          setTempFilePath(file.fileCopyUri);
          return file.fileCopyUri;
        }
      }

      // Create new copy
      const newPath = `${RNFS.CachesDirectoryPath}/${generateUniqueId()}.pdf`;
      console.log('Creating new copy at:', newPath);

      if (Platform.OS === 'android') {
        const base64Data = await RNFS.readFile(file.uri, 'base64');
        await RNFS.writeFile(newPath, base64Data, 'base64');
      } else {
        await RNFS.copyFile(file.uri, newPath);
      }

      // Verify the copy
      const stats = await RNFS.stat(newPath);
      if (!stats.size) {
        throw new Error('Created file is empty');
      }

      setTempFilePath(newPath);
      console.log('Local copy created successfully at:', newPath);
      return newPath;
    } catch (error) {
      console.error('Error in createLocalCopy:', error);
      throw new Error('Failed to create local copy of file');
    }
  };

  const handleUploadTimeout = (scriptId: string) => {
    setError('Upload timed out. Please try again.');
    setUploading(false);
    setUploadProgress(0);
    
    // Update script status
    firestore()
      .collection('scripts')
      .doc(scriptId)
      .update({
        uploadStatus: 'error',
        error: 'Upload timed out',
        updatedAt: firestore.Timestamp.now()
      })
      .catch(err => console.error('Error updating timeout status:', err));
  };

  const handleProcessingTimeout = (scriptId: string, unsubscribe: () => void) => {
    unsubscribe();
    setError('Script processing timed out. Please try again.');
    setProcessingStatus('error');
    setProcessingProgress(null);
    
    firestore()
      .collection('scriptProcessing')
      .doc(scriptId)
      .update({
        status: 'error',
        error: 'Processing timed out',
        updatedAt: firestore.Timestamp.now()
      })
      .catch(err => console.error('Error updating processing timeout status:', err));
  };

  const uploadFile = async (file: DocumentPickerResponse, localFilePath: string, scriptId: string) => {
    if (!user?.uid) {
      setError('You must be logged in to upload scripts');
      return;
    }

    if (!file.name) {
      setError('Invalid file name');
      return;
    }

    const fileName = file.name; // Store in variable to satisfy TypeScript
    setUploading(true);
    setError(null);
    
    // Set upload timeout
    const uploadTimeout = setTimeout(() => handleUploadTimeout(scriptId), UPLOAD_TIMEOUT);
    
    try {
      const fileUrl = await firebaseService.uploadScript(
        localFilePath,
        fileName,
        user.uid,
        scriptId,
        (progress: number) => {
          console.log('Upload progress:', progress);
          setUploadProgress(progress);
        }
      );

      clearTimeout(uploadTimeout);

      // Set processing timeout and listener
      const processingTimeout = setTimeout(
        () => handleProcessingTimeout(scriptId, unsubscribe),
        PROCESSING_TIMEOUT
      );

      const unsubscribe = firebaseService.listenToScriptProcessingStatus(
        scriptId,
        (status: ProcessingStatus) => {
          console.log('Processing status update:', status);
          setProcessingStatus(status.status);
          setProcessingProgress(status.progress || null);

          if (status.status === 'completed') {
            clearTimeout(processingTimeout);
            unsubscribe();
            setCompletedScriptId(scriptId);
            setScriptTitle(fileName.replace('.pdf', ''));
            setRenameDialogVisible(true);
          } else if (status.status === 'error') {
            clearTimeout(processingTimeout);
            unsubscribe();
            setError(status.error || 'An error occurred during processing');
          }
        },
        (error: Error) => {
          clearTimeout(processingTimeout);
          console.error('Error listening to processing status:', error);
          setError('Failed to monitor processing status');
        }
      );

      return fileUrl;
    } catch (err) {
      clearTimeout(uploadTimeout);
      console.error('Error uploading file:', err);
      setError('Failed to upload file. Please try again.');
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = useCallback(async () => {
    try {
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

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      const localPath = await createLocalCopy(file);
      console.log('Local copy created at:', localPath);

      const scriptId = generateUniqueId();

      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      await uploadFile(file, localPath, scriptId);
    } catch (err) {
      if (!isInProgress(err)) {
        console.error('Error picking document:', err);
        setError(err instanceof Error ? err.message : 'Failed to pick document');
      }
    }
  }, [user]);

  const resetStates = () => {
    setRenameDialogVisible(false);
    setScriptTitle('');
    setCompletedScriptId(null);
    setProcessingStatus(null);
    setProcessingProgress(null);
    setUploadProgress(0);
    setUploading(false);
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

      const scriptId = completedScriptId; // Store ID before reset
      resetStates();
      navigation.replace('ScriptDetail', { scriptId });
    } catch (error) {
      console.error('Error renaming script:', error);
      setError('Failed to rename script');
    }
  };

  const handleSkipRename = () => {
    if (!completedScriptId) return;
    const scriptId = completedScriptId; // Store ID before reset
    resetStates();
    navigation.replace('ScriptDetail', { scriptId });
  };

  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      resetStates();
    };
  }, []);

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
    progressContainer: {
      width: '100%',
      marginTop: 24,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      marginVertical: 8,
    },
    progressText: {
      marginTop: 8,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
    statusText: {
      marginBottom: 16,
      textAlign: 'center',
      color: theme.colors.onSurface,
    },
    infoText: {
      textAlign: 'center',
      marginTop: 8,
      color: theme.colors.onSurfaceVariant,
    },
    errorText: {
      color: theme.colors.error,
    },
    retryButton: {
      marginLeft: 8,
    },
    loader: {
      marginTop: 16,
    },
    titleInput: {
      marginTop: 8,
    },
    dialogueSubtext: {
      marginBottom: 16,
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
              disabled={uploading || !!processingStatus}
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
                <Text variant="titleMedium" style={styles.statusText}>
                  Uploading Script...
                </Text>
                <ProgressBar
                  progress={uploadProgress / 100}
                  color={theme.colors.primary}
                  style={styles.progressBar}
                />
                <Text variant="bodyMedium" style={styles.progressText}>
                  {Math.round(uploadProgress)}%
                </Text>
              </>
            )}

            {processingStatus && (
              <>
                <Text variant="titleMedium" style={styles.statusText}>
                  {processingStatus === 'starting' ? 'Preparing Script...' :
                   processingStatus === 'processing' ? 'Analyzing Script...' :
                   processingStatus === 'completed' ? 'Script Ready!' :
                   processingStatus.charAt(0).toUpperCase() + processingStatus.slice(1)}
                </Text>
                {processingProgress !== null && (
                  <>
                    <ProgressBar
                      progress={processingProgress / 100}
                      color={theme.colors.primary}
                      style={styles.progressBar}
                    />
                    <Text variant="bodyMedium" style={styles.progressText}>
                      {Math.round(processingProgress)}%
                    </Text>
                  </>
                )}
                {processingStatus === 'processing' && processingProgress === null && (
                  <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
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
            <Text variant="bodyMedium" style={styles.errorText}>{error}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setError(null)}>OK</Button>
            {error?.includes('timed out') && (
              <Button 
                mode="contained" 
                onPress={handleFilePick}
                style={styles.retryButton}
              >
                Retry
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>

        <Dialog 
          visible={renameDialogVisible} 
          onDismiss={handleSkipRename}
        >
          <Dialog.Title>Name Your Script</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogueSubtext}>
              Choose a name for your script to help you identify it later.
            </Text>
            <TextInput
              label="Script Title"
              value={scriptTitle}
              onChangeText={setScriptTitle}
              mode="outlined"
              autoFocus
              style={styles.titleInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleSkipRename}>
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