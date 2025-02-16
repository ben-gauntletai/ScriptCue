import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import storage, { FirebaseStorageTypes } from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';
import DocumentPicker from 'react-native-document-picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type UploadScriptScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'UploadScript'
>;

export const UploadScriptScreen: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigation = useNavigation<UploadScriptScreenNavigationProp>();

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
      const userId = auth().currentUser?.uid;
      if (!userId) {
        Alert.alert('Error', 'Please sign in to upload scripts');
        return;
      }

      const fileName = `scripts/${userId}/${Date.now()}_${file.name}`;
      const reference = storage().ref(fileName);

      // Upload file with metadata
      const task = reference.putFile(file.uri, {
        contentType: 'application/pdf',
        customMetadata: {
          uploadedBy: userId,
          originalName: file.name,
        },
      });

      // Track upload progress
      task.on('state_changed', 
        (snapshot: FirebaseStorageTypes.TaskSnapshot) => {
          const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(currentProgress);
        },
        (error) => {
          console.error('Upload error:', error);
          Alert.alert('Error', 'Failed to upload script. Please try again.');
          setUploading(false);
          setProgress(0);
        }
      );

      await task;
      Alert.alert(
        'Success',
        'Script uploaded successfully! It will be processed shortly.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        // User cancelled the picker
        return;
      }
      Alert.alert('Error', 'Failed to upload script. Please try again.');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Upload Script</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {uploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.uploadingText}>Uploading Script...</Text>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
            <Icon name="upload-file" size={48} color="#007AFF" />
            <Text style={styles.uploadText}>Select PDF Script</Text>
            <Text style={styles.supportedText}>Supported format: PDF</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
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
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 12,
    width: '100%',
    aspectRatio: 1,
  },
  uploadText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
  supportedText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  uploadingContainer: {
    alignItems: 'center',
  },
  uploadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  progressText: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: '600',
    color: '#007AFF',
  },
}); 