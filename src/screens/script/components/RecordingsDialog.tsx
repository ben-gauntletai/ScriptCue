import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, Share, Platform, Dimensions, StatusBar, Animated, TouchableWithoutFeedback } from 'react-native';
import { Dialog, Button, Text, IconButton, useTheme, MD3Theme, Portal, Surface } from 'react-native-paper';
import RNFS from 'react-native-fs';
import Video from 'react-native-video';

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

interface VideoPlayerDialogProps {
  visible: boolean;
  onDismiss: () => void;
  videoPath: string;
  characterId: string;
}

interface VideoProgress {
  currentTime: number;
  playableDuration: number;
  seekableDuration: number;
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

const VideoPlayerDialog: React.FC<VideoPlayerDialogProps> = ({
  visible,
  onDismiss,
  videoPath,
  characterId,
}) => {
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState<VideoProgress>({ currentTime: 0, playableDuration: 0, seekableDuration: 0 });
  const videoRef = useRef<Video>(null);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleProgress = (data: VideoProgress) => {
    setProgress(data);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const videoStyles = StyleSheet.create({
    modalContent: {
      flex: 1,
      margin: 0,
      backgroundColor: 'black',
    },
    container: {
      flex: 1,
      backgroundColor: 'black',
      flexDirection: 'column',
    },
    header: {
      backgroundColor: 'black',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      height: Platform.OS === 'ios' ? 60 : 50,
      paddingTop: Platform.OS === 'ios' ? 10 : 0,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    },
    title: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
      flex: 1,
      marginRight: 16,
    },
    videoWrapper: {
      flex: 1,
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    video: {
      width: '100%',
      height: '100%',
    },
    footer: {
      backgroundColor: 'black',
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.15)',
    },
    progressContainer: {
      marginBottom: 12,
    },
    progressBar: {
      height: 3,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 1.5,
      marginBottom: 6,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.primary,
      borderRadius: 1.5,
    },
    timeText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '500',
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    controlButtons: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 24,
      paddingVertical: 4,
    },
    iconButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: 24,
      margin: 0,
    },
    playPauseButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 32,
      margin: 0,
    },
    closeButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: 20,
      margin: 0,
    },
  });

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={videoStyles.modalContent}>
        <Surface style={videoStyles.container}>
          <StatusBar hidden={true} />
          <View style={videoStyles.header}>
            <Text style={videoStyles.title} numberOfLines={1}>
              {characterId}'s Recording
            </Text>
            <IconButton
              icon="close"
              iconColor="white"
              size={24}
              onPress={onDismiss}
              style={videoStyles.closeButton}
            />
          </View>

          <View style={videoStyles.videoWrapper}>
            <Video
              ref={videoRef}
              source={{ uri: Platform.OS === 'ios' ? videoPath : `file://${videoPath}` }}
              style={videoStyles.video}
              resizeMode="contain"
              paused={!isPlaying}
              repeat={true}
              onProgress={handleProgress}
            />
          </View>

          <View style={videoStyles.footer}>
            <View style={videoStyles.progressContainer}>
              <View style={videoStyles.progressBar}>
                <View 
                  style={[
                    videoStyles.progressFill,
                    { 
                      width: `${(progress.currentTime / progress.seekableDuration) * 100}%`
                    }
                  ]} 
                />
              </View>
              <View style={videoStyles.timeRow}>
                <Text style={videoStyles.timeText}>
                  {formatTime(progress.currentTime)}
                </Text>
                <Text style={videoStyles.timeText}>
                  {formatTime(progress.seekableDuration)}
                </Text>
              </View>
            </View>
            <View style={videoStyles.controlButtons}>
              <IconButton
                icon="skip-backward"
                iconColor="white"
                size={24}
                onPress={() => videoRef.current?.seek(0)}
                style={videoStyles.iconButton}
              />
              <IconButton
                icon={isPlaying ? "pause" : "play"}
                iconColor="white"
                size={40}
                onPress={handlePlayPause}
                style={videoStyles.playPauseButton}
              />
              <IconButton
                icon="skip-forward"
                iconColor="white"
                size={24}
                onPress={() => videoRef.current?.seek(progress.seekableDuration)}
                style={videoStyles.iconButton}
              />
            </View>
          </View>
        </Surface>
      </Dialog>
    </Portal>
  );
};

const RecordingsDialog: React.FC<RecordingsDialogProps> = ({ visible, onDismiss, scriptId }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
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

  const handlePlayVideo = async (recording: Recording) => {
    try {
      // Check if the file exists
      const exists = await RNFS.exists(recording.path);
      if (!exists) {
        Alert.alert('Error', 'Video file not found');
        return;
      }

      setSelectedRecording(recording);
    } catch (error) {
      console.error('Error playing video:', error);
      Alert.alert('Error', 'Failed to open video');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <>
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
                      onPress={() => handlePlayVideo(recording)}
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

      {selectedRecording && (
        <VideoPlayerDialog
          visible={!!selectedRecording}
          onDismiss={() => setSelectedRecording(null)}
          videoPath={selectedRecording.path}
          characterId={selectedRecording.characterId}
        />
      )}
    </>
  );
};

export default RecordingsDialog; 