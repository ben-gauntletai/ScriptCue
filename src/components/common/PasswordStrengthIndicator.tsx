import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, typography, shadows } from '../../theme';
import { calculatePasswordStrength, passwordPattern, passwordMinLength } from '../../utils/validation';

interface PasswordStrengthIndicatorProps {
  password: string;
}

const getStrengthLabel = (strength: number): string => {
  switch (strength) {
    case 0:
      return 'Too Short';
    case 1:
      return 'Almost There';
    case 2:
      return 'Good';
    default:
      return '';
  }
};

const getStrengthColor = (strength: number): string => {
  switch (strength) {
    case 0:
      return colors.error;
    case 1:
      return '#FFD700';
    case 2:
      return colors.success;
    default:
      return colors.border;
  }
};

const RequirementItem: React.FC<{ met: boolean; text: string }> = ({ met, text }) => (
  <View style={styles.requirementItem}>
    <Icon
      name={met ? 'check-circle' : 'circle-outline'}
      size={16}
      color={met ? colors.success : colors.textSecondary}
      style={styles.requirementIcon}
    />
    <Text style={[styles.requirementText, met && styles.requirementTextMet]}>
      {text}
    </Text>
  </View>
);

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password,
}) => {
  // Simplified strength calculation
  const strength = useMemo(() => {
    if (password.length < passwordMinLength) return 0;
    if (!passwordPattern.hasUpperCase.test(password)) return 1;
    return 2;
  }, [password]);

  const strengthLabel = useMemo(() => getStrengthLabel(strength), [strength]);
  const strengthColor = useMemo(() => getStrengthColor(strength), [strength]);

  const requirements = useMemo(
    () => [
      {
        met: password.length >= passwordMinLength,
        text: `At least ${passwordMinLength} characters`,
      },
      {
        met: passwordPattern.hasUpperCase.test(password),
        text: 'One uppercase letter',
      },
    ],
    [password]
  );

  if (!password) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.strengthContainer}>
        <View style={styles.barsContainer}>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  backgroundColor:
                    index <= strength ? strengthColor : colors.border + '20',
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.label, { color: strengthColor }]}>{strengthLabel}</Text>
      </View>

      <View style={styles.requirementsContainer}>
        {requirements.map((requirement, index) => (
          <RequirementItem
            key={index}
            met={requirement.met}
            text={requirement.text}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    marginBottom: 16,
    backgroundColor: colors.surfaceVariant + '80',
    borderRadius: 12,
    padding: 12,
    ...shadows.small,
  },
  strengthContainer: {
    marginBottom: 8,
  },
  barsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  bar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.labelMedium,
    textAlign: 'right',
    marginTop: 4,
  },
  requirementsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border + '40',
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  requirementIcon: {
    marginRight: 8,
  },
  requirementText: {
    ...typography.labelMedium,
    color: colors.textSecondary,
  },
  requirementTextMet: {
    color: colors.text,
  },
}); 