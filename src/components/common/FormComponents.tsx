import React, { forwardRef } from 'react';
import { StyleSheet, View, AccessibilityInfo, Animated, Platform } from 'react-native';
import { TextInput, Text, HelperText } from 'react-native-paper';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, shadows, typography } from '../../theme';

interface FormInputProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  rules?: object;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  icon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  ref?: React.Ref<any>;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  testID?: string;
  disabled?: boolean;
}

export const FormInput = forwardRef<any, FormInputProps<any>>((
  {
    control,
    name,
    label,
    rules,
    secureTextEntry,
    keyboardType = 'default',
    autoCapitalize = 'none',
    icon,
    rightIcon,
    onRightIconPress,
    returnKeyType,
    onSubmitEditing,
    blurOnSubmit,
    accessibilityHint,
    accessibilityLabel,
    testID,
    disabled,
  },
  ref
) => {
  const handleRightIconPress = () => {
    if (onRightIconPress && !disabled) {
      onRightIconPress();
      if (secureTextEntry !== undefined) {
        AccessibilityInfo.announceForAccessibility(
          `Password is now ${secureTextEntry ? 'hidden' : 'shown'}`
        );
      }
    }
  };

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <View 
          style={styles.inputContainer}
          accessible={true}
          accessibilityRole="none"
          accessibilityLabel={`${label} input field`}
        >
          <TextInput
            ref={ref}
            label={label}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={!!error}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            style={[
              styles.input,
              disabled && styles.inputDisabled,
            ]}
            mode="outlined"
            left={icon ? (
              <TextInput.Icon 
                icon={icon}
                accessibilityLabel={`${label} icon`}
                color={error ? colors.error : colors.textSecondary}
                disabled={disabled}
              />
            ) : undefined}
            right={rightIcon ? (
              <TextInput.Icon 
                icon={rightIcon}
                onPress={handleRightIconPress}
                accessibilityLabel={secureTextEntry !== undefined
                  ? `Toggle password visibility, password is currently ${secureTextEntry ? 'hidden' : 'shown'}`
                  : `${label} right icon`
                }
                color={colors.textSecondary}
                disabled={disabled}
              />
            ) : undefined}
            outlineStyle={styles.inputOutline}
            contentStyle={styles.inputContent}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            blurOnSubmit={blurOnSubmit}
            accessibilityLabel={accessibilityLabel || label}
            accessibilityHint={accessibilityHint || `Enter ${label.toLowerCase()}`}
            testID={testID || `input-${name}`}
            importantForAccessibility="yes"
            theme={{
              colors: {
                primary: error ? colors.error : colors.primary,
                error: colors.error,
                onSurfaceVariant: colors.textSecondary,
                surfaceVariant: colors.surface,
              },
              roundness: 12,
            }}
            disabled={disabled}
          />
          {error && (
            <HelperText 
              type="error" 
              style={styles.errorText}
              accessible={true}
              accessibilityRole="alert"
              accessibilityLabel={`Error: ${error.message}`}
            >
              <Icon name="alert-circle-outline" size={14} /> {error.message}
            </HelperText>
          )}
        </View>
      )}
    />
  );
});

export const FormError = ({ message }: { message: string }) => (
  <View 
    style={styles.errorContainer}
    accessible={true}
    accessibilityRole="alert"
    accessibilityLabel={`Error: ${message}`}
  >
    <Text style={styles.errorMessage}>{message}</Text>
  </View>
);

export const FormDivider = () => (
  <View 
    style={styles.divider}
    accessible={true}
    accessibilityRole="none"
  />
);

const styles = StyleSheet.create({
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inputContent: {
    minHeight: 56,
    paddingHorizontal: 16,
  },
  inputOutline: {
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    ...typography.labelMedium,
    color: colors.error,
    marginTop: 4,
    marginLeft: 4,
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: `${colors.error}10`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorMessage: {
    ...typography.bodyMedium,
    color: colors.error,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 24,
  },
  inputDisabled: {
    opacity: 0.6,
  },
}); 