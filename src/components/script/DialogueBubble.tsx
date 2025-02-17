import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { DialogueLine } from '../../types/script';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../../theme';

interface DialogueBubbleProps {
  line: DialogueLine;
  lineNumber: number;
  onOptionsPress?: () => void;
  isActive?: boolean;
}

export const DialogueBubble: React.FC<DialogueBubbleProps> = ({ 
  line, 
  lineNumber,
  onOptionsPress,
  isActive = false,
}) => {
  const isUser = line.character === 'MYSELF';
  const bubbleStyle = isUser ? styles.userBubble : styles.readerBubble;
  const textStyle = isUser ? styles.userText : styles.readerText;

  const getStatusColor = () => {
    switch (line.status) {
      case 'completed':
        return theme.colors.success;
      case 'active':
        return theme.colors.primary;
      default:
        return theme.colors.textSecondary;
    }
  };

  return (
    <View style={[
      styles.container,
      isActive && styles.activeContainer
    ]}>
      <View style={styles.lineNumberContainer}>
        <Text style={[
          styles.lineNumber,
          { color: getStatusColor() }
        ]}>{lineNumber}</Text>
      </View>
      <View style={styles.contentContainer}>
        <View style={[styles.bubble, bubbleStyle]}>
          <View style={styles.headerContainer}>
            <Text style={styles.character}>{line.character}</Text>
            <Text style={styles.timing}>{line.duration.toFixed(1)}s</Text>
          </View>
          <Text style={[styles.text, textStyle]}>{line.text}</Text>
        </View>
      </View>
      {onOptionsPress && (
        <TouchableOpacity style={styles.optionsButton} onPress={onOptionsPress}>
          <Icon name="more-vert" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  activeContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginHorizontal: 8,
    paddingHorizontal: 8,
  },
  lineNumberContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  lineNumber: {
    fontSize: 12,
    opacity: 0.7,
  },
  contentContainer: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bubble: {
    borderRadius: 8,
    padding: 12,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
  },
  readerBubble: {
    backgroundColor: theme.colors.surface,
  },
  character: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: theme.colors.onPrimary,
  },
  readerText: {
    color: theme.colors.text,
  },
  timing: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  optionsButton: {
    padding: 8,
    marginLeft: 8,
  },
}); 