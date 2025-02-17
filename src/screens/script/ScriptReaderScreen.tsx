import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useScript } from '../../contexts/ScriptContext';
import { DialogueBubble } from '../../components/script/DialogueBubble';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../theme';

export const ScriptReaderScreen: React.FC = () => {
  const {
    currentSession,
    lines,
    isLoading,
    error,
    actions: { startSession, pauseSession, resumeSession, completeCurrentLine },
  } = useScript();
  
  const navigation = useNavigation();
  const route = useRoute();
  const flatListRef = useRef<FlatList>(null);
  const [autoProgress, setAutoProgress] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();

  // Extract params
  const { scriptId, character } = route.params as { scriptId: string; character: string };

  useEffect(() => {
    startSession(scriptId, character);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [scriptId, character, startSession]);

  useEffect(() => {
    if (lines.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [lines]);

  useEffect(() => {
    if (autoProgress && currentSession?.status === 'active') {
      const currentLine = lines[currentSession.currentLineIndex];
      if (currentLine && currentLine.status === 'active') {
        timerRef.current = setTimeout(() => {
          completeCurrentLine();
        }, currentLine.duration * 1000);
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoProgress, currentSession?.status, currentSession?.currentLineIndex, lines, completeCurrentLine]);

  const toggleAutoProgress = () => {
    setAutoProgress(prev => !prev);
  };

  const handlePlayPause = () => {
    if (currentSession?.status === 'active') {
      pauseSession();
    } else {
      resumeSession();
    }
  };

  const handleAddNote = () => {
    // TODO: Implement note adding functionality
    console.log('Add note for current line');
  };

  if (isLoading && lines.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => startSession(scriptId, character)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stats = currentSession?.stats || { readerLines: 0, userLines: 0, totalDuration: 0 };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleAddNote} style={styles.addButton}>
          <Icon name="add" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        ref={flatListRef}
        data={lines}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <DialogueBubble
            line={item}
            lineNumber={index + 1}
            isActive={currentSession?.currentLineIndex === index}
          />
        )}
        contentContainerStyle={styles.listContent}
      />

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>{stats.readerLines} Reader Lines</Text>
          <Text style={styles.statsText}>{stats.userLines} Myself Lines</Text>
          <Text style={styles.statsText}>Scene Duration: {stats.totalDuration.toFixed(1)}s</Text>
        </View>
        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={styles.autoButton}
            onPress={toggleAutoProgress}
          >
            <Icon 
              name={autoProgress ? "timer-off" : "timer"} 
              size={24} 
              color={autoProgress ? theme.colors.primary : theme.colors.text} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.playButton,
              currentSession?.status === 'active' && styles.playButtonActive
            ]}
            onPress={handlePlayPause}
          >
            <Icon 
              name={currentSession?.status === 'active' ? 'pause' : 'play-arrow'} 
              size={32} 
              color={theme.colors.onPrimary} 
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  addButton: {
    padding: 8,
  },
  listContent: {
    paddingVertical: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surface,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statsText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoButton: {
    padding: 8,
    position: 'absolute',
    left: 0,
  },
  playButton: {
    backgroundColor: theme.colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonActive: {
    backgroundColor: theme.colors.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.colors.background,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: 12,
  },
  retryText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
}); 