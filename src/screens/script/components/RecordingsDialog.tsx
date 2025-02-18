import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Dialog, Button, Text, IconButton, useTheme, MD3Theme } from 'react-native-paper';
import RNFS from 'react-native-fs';

interface RecordingsDialogProps {
  visible: boolean;
  onDismiss: () => void;
  scriptId: string;
}

interface Recording {
  path: string;
  fileName: string;
  characterId: string;
  timestamp: number;
}

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  scrollContent: {
    paddingVertical: 8,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
  },
  recordingInfo: {
    flex: 1,
    marginRight: 16,
  },
  characterName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyState: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 8,
  },
});

const RecordingsDialog: React.FC<RecordingsDialogProps> = ({ visible, onDismiss, scriptId }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    if (visible) {
      loadRecordings();
    }
  }, [visible]);

  const loadRecordings = async () => {
    try {
      const practiceDir = `${RNFS.DocumentDirectoryPath}/practice_videos/${scriptId}`;
      
      // Check if directory exists
      const dirExists = await RNFS.exists(practiceDir);
      if (!dirExists) {
        setRecordings([]);
        setLoading(false);
        return;
      }

      // Read directory contents
      const files = await RNFS.readDir(practiceDir);
      
      // Parse recording information from filenames
      const recordingsList = files
        .filter(file => file.name.endsWith('.mp4'))
        .map(file => {
          const match = file.name.match(/practice_(.+)_(\d+)\.mp4/);
          if (match) {
            return {
              path: file.path,
              fileName: file.name,
              characterId: match[1],
              timestamp: parseInt(match[2], 10),
            };
          }
          return null;
        })
        .filter((recording): recording is Recording => recording !== null)
        .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first

      setRecordings(recordingsList);
    } catch (error) {
      console.error('Error loading recordings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecording = async (recording: Recording) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await RNFS.unlink(recording.path);
              await loadRecordings(); // Reload the list
            } catch (error) {
              console.error('Error deleting recording:', error);
              Alert.alert('Error', 'Failed to delete recording');
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: '80%' }}>
      <Dialog.Title>Practice Recordings</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <View style={styles.emptyState}>
              <Text>Loading recordings...</Text>
            </View>
          ) : recordings.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No recordings found</Text>
              <Text style={styles.emptyText}>
                Practice with a character to create your first recording
              </Text>
            </View>
          ) : (
            recordings.map((recording) => (
              <View key={recording.path} style={styles.recordingItem}>
                <View style={styles.recordingInfo}>
                  <Text style={styles.characterName}>{recording.characterId}</Text>
                  <Text style={styles.timestamp}>{formatDate(recording.timestamp)}</Text>
                </View>
                <View style={styles.actions}>
                  <IconButton
                    icon="play"
                    mode="contained-tonal"
                    size={20}
                    onPress={() => {
                      // TODO: Implement video playback
                      Alert.alert('Coming Soon', 'Video playback will be implemented soon!');
                    }}
                  />
                  <IconButton
                    icon="delete"
                    mode="contained-tonal"
                    size={20}
                    onPress={() => handleDeleteRecording(recording)}
                  />
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Close</Button>
      </Dialog.Actions>
    </Dialog>
  );
};

export default RecordingsDialog; 