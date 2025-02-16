import React, { useEffect, useRef } from 'react';
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

  // Extract params
  const { scriptId, character } = route.params as { scriptId: string; character: string };

  useEffect(() => {
    startSession(scriptId, character);
  }, [scriptId, character, startSession]);

  useEffect(() => {
    if (lines.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [lines]);

  const handleOptionsPress = (lineId: string) => {
    // TODO: Implement options menu (repeat line, adjust timing, etc.)
    console.log('Options pressed for line:', lineId);
  };

  const handlePauseResume = () => {
    if (currentSession?.status === 'active') {
      pauseSession();
    } else {
      resumeSession();
    }
  };

  if (isLoading && lines.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Script Reading</Text>
        <TouchableOpacity onPress={handlePauseResume}>
          <Icon
            name={currentSession?.status === 'active' ? 'pause' : 'play-arrow'}
            size={24}
            color="#000"
          />
        </TouchableOpacity>
      </View>
      
      <FlatList
        ref={flatListRef}
        data={lines}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DialogueBubble
            line={item}
            onOptionsPress={() => handleOptionsPress(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
      />

      {currentSession?.status === 'active' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.completeButton}
            onPress={completeCurrentLine}
          >
            <Text style={styles.completeButtonText}>Complete Line</Text>
          </TouchableOpacity>
        </View>
      )}
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
  listContent: {
    paddingVertical: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  completeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
    padding: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
}); 