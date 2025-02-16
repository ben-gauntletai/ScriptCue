import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DialogueLine } from '../../types/script';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface DialogueBubbleProps {
  line: DialogueLine;
  onOptionsPress?: () => void;
}

export const DialogueBubble: React.FC<DialogueBubbleProps> = ({ line, onOptionsPress }) => {
  const isUser = line.isUser;
  const bubbleStyle = isUser ? styles.userBubble : styles.readerBubble;
  const textStyle = isUser ? styles.userText : styles.readerText;
  const containerStyle = isUser ? styles.userContainer : styles.readerContainer;

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}s`;
  };

  return (
    <View style={containerStyle}>
      <View style={styles.headerContainer}>
        <Text style={styles.character}>{line.character}</Text>
        <Text style={styles.timestamp}>{formatTimestamp(line.timestamp)}</Text>
      </View>
      <View style={[styles.bubble, bubbleStyle]}>
        <Text style={[styles.text, textStyle]}>{line.text}</Text>
      </View>
      {onOptionsPress && (
        <TouchableOpacity style={styles.optionsButton} onPress={onOptionsPress}>
          <Icon name="more-vert" size={20} color="#666" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  userContainer: {
    alignItems: 'flex-end',
    marginVertical: 4,
    marginHorizontal: 8,
  },
  readerContainer: {
    alignItems: 'flex-start',
    marginVertical: 4,
    marginHorizontal: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'center',
  },
  character: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: '#007AFF',
    marginLeft: 48,
  },
  readerBubble: {
    backgroundColor: '#E5E5EA',
    marginRight: 48,
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  readerText: {
    color: '#000000',
  },
  optionsButton: {
    position: 'absolute',
    right: -24,
    top: '50%',
    marginTop: -12,
    padding: 4,
  },
}); 