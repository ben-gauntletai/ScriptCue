import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, typography } from '../../theme';
import { haptics } from '../../utils/interaction';

interface TermsCheckboxProps {
  checked: boolean;
  onPress: () => void;
  onTermsPress: () => void;
  onPrivacyPress: () => void;
}

export const TermsCheckbox: React.FC<TermsCheckboxProps> = ({
  checked,
  onPress,
  onTermsPress,
  onPrivacyPress,
}) => {
  const handlePress = () => {
    haptics.light();
    onPress();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handlePress}
        style={styles.checkbox}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon
          name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={24}
          color={checked ? colors.primary : colors.textSecondary}
        />
      </TouchableOpacity>
      <View style={styles.textContainer}>
        <Text style={styles.text}>I agree to the </Text>
        <TouchableOpacity onPress={onTermsPress}>
          <Text style={styles.link}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={styles.text}> and </Text>
        <TouchableOpacity onPress={onPrivacyPress}>
          <Text style={styles.link}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  checkbox: {
    marginRight: 8,
    marginTop: -2,
  },
  textContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  text: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  link: {
    ...typography.bodyMedium,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
}); 