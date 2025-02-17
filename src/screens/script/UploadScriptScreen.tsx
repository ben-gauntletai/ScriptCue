import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import DocumentPicker from 'react-native-document-picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../theme';

export const UploadScriptScreen: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();

  const handleUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf],
      });

      const file = result[0];
      if (!file.uri || !file.name) {
        Alert.alert('Error', 'Could not read file');
        return;
      }

      setUploading(true);
      setProcessingStatus('processing');
      setError(null);

      const userId = auth().currentUser?.uid;
      if (!userId) {
        Alert.alert('Error', 'Please sign in to upload scripts');
        return;
      }

      // Create script document first
      const scriptRef = await firestore().collection('scripts').add({
        title: file.name,
        uploadedBy: userId,
        createdAt: firestore.FieldValue.serverTimestamp(),
        status: 'processing',
      });

      const fileName = `scripts/${userId}/${scriptRef.id}_${file.name}`;
      const reference = storage().ref(fileName);

      // Upload file with metadata
      const task = reference.putFile(file.uri, {
        contentType: 'application/pdf',
        customMetadata: {
          uploadedBy: userId,
          originalName: file.name,
          scriptId: scriptRef.id,
        },
      });

      // Track upload progress
      task.on('state_changed', 
        (snapshot) => {
          const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(currentProgress);
        },
        (error) => {
          console.error('Upload error:', error);
          setError('Failed to upload script. Please try again.');
          setProcessingStatus('error');
          setUploading(false);
          setProgress(0);
        }
      );

      await task;
      
      // Start monitoring processing status
      const unsubscribe = firestore()
        .collection('scripts')
        .doc(scriptRef.id)
        .onSnapshot((doc) => {
          const data = doc.data();
          if (data?.status === 'ready') {
            setProcessingStatus('complete');
            unsubscribe();
            Alert.alert(
              'Success',
              'Script uploaded and processed successfully!',
              [
                {
                  text: 'OK',
                  onPress: () => navigation.goBack(),
                },
              ]
            );
          } else if (data?.status === 'error') {
            setProcessingStatus('error');
            setError(data.error || 'Failed to process script');
            unsubscribe();
          }
        });

      // Clean up listener after 5 minutes
      setTimeout(() => {
        unsubscribe();
        if (processingStatus === 'processing') {
          setProcessingStatus('error');
          setError('Script processing timed out. Please try again.');
        }
      }, 5 * 60 * 1000);

    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        // User cancelled the picker
        return;
      }
      setError('Failed to upload script. Please try again.');
      setProcessingStatus('error');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [navigation]);

  const getStatusMessage = () => {
    switch (processingStatus) {
      case 'processing':
        return 'Processing Script...';
      case 'complete':
        return 'Script Processed Successfully!';
      case 'error':
        return error || 'An error occurred';
      default:
        return 'Select PDF Script';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Upload Script</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {uploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.uploadingText}>
              {progress < 100 ? 'Uploading Script...' : getStatusMessage()}
            </Text>
            {progress < 100 && (
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            )}
          </View>
        ) : (
          <TouchableOpacity 
            style={[
              styles.uploadButton,
              processingStatus === 'error' && styles.uploadButtonError
            ]} 
            onPress={handleUpload}
          >
            <Icon 
              name={processingStatus === 'error' ? 'error' : 'upload-file'} 
              size={48} 
              color={processingStatus === 'error' ? theme.colors.error : theme.colors.primary} 
            />
            <Text style={[
              styles.uploadText,
              processingStatus === 'error' && styles.uploadTextError
            ]}>
              {getStatusMessage()}
            </Text>
            {processingStatus === 'idle' && (
              <Text style={styles.supportedText}>Supported format: PDF</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  uploadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    width: '100%',
    aspectRatio: 1,
  },
  uploadButtonError: {
    borderColor: theme.colors.error,
  },
  uploadText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  uploadTextError: {
    color: theme.colors.error,
  },
  supportedText: {
    marginTop: 8,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  uploadingContainer: {
    alignItems: 'center',
  },
  uploadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  progressText: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.primary,
  },
}); 