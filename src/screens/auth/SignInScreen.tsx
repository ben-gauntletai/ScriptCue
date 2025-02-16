import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  TouchableOpacity,
  Animated,
  StatusBar,
  TextInput as RNTextInput,
} from 'react-native';
import { Button, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { AuthNavigationProp } from '../../navigation/types';
import { useForm } from 'react-hook-form';
import { emailPattern, validationMessages, passwordMinLength } from '../../utils/validation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, typography, shadows } from '../../theme';
import { haptics } from '../../utils/interaction';
import { createFormAnimation } from '../../utils/animations';
import { FormInput } from '../../components/common/FormComponents';
import { RouteProp } from '@react-navigation/native';

type FormData = {
  email: string;
  password: string;
};

const { width } = Dimensions.get('window');

export const SignInScreen = () => {
  const navigation = useNavigation<AuthNavigationProp>();
  const { signIn, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [secureTextEntry, setSecureTextEntry] = useState(true);

  const passwordInputRef = useRef<RNTextInput>(null);
  const animation = createFormAnimation();

  useEffect(() => {
    StatusBar.setBarStyle('dark-content');
    animation.animate();
    return () => {
      StatusBar.setBarStyle('default');
    };
  }, []);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError: setFormError,
    clearErrors,
  } = useForm<FormData>({
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onChange',
  });

  // Clear error messages when inputs change
  useEffect(() => {
    if (error) {
      setError(null);
    }
    if (success) {
      setSuccess(null);
    }
  }, [errors]);

  const onSubmit = async (data: FormData) => {
    try {
      setError(null);
      setSuccess(null);
      clearErrors();

      const result = await signIn(data.email.trim(), data.password, rememberMe);
      
      if (result.error) {
        haptics.error();
        
        // Set specific field errors if we can identify them
        if (result.error.toLowerCase().includes('email')) {
          setFormError('email', { message: result.error });
        } else if (result.error.toLowerCase().includes('password')) {
          setFormError('password', { message: result.error });
        } else {
          setError(result.error);
        }

        // Don't reset form on error
      } else if (result.success) {
        haptics.success();
        setSuccess(result.success);
        // Only reset form on success
        reset();
      }
    } catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    }
  };

  const toggleSecureEntry = () => {
    haptics.light();
    setSecureTextEntry(!secureTextEntry);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}>
        <Animated.View 
          style={[
            styles.header, 
            animation.headerStyle
          ]}>
          <View style={styles.iconContainer}>
            <Icon name="script-text" size={80} color={colors.primary} />
          </View>
          <Text variant="headlineMedium" style={styles.title}>
            Welcome to ScriptCue
          </Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </Animated.View>

        <Animated.View 
          style={[
            styles.form,
            animation.formStyle
          ]}>
          <FormInput
            control={control}
            name="email"
            label="Email"
            rules={{
              required: validationMessages.required,
              pattern: {
                value: emailPattern,
                message: validationMessages.email.pattern,
              },
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            icon="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            disabled={isSubmitting}
          />

          <FormInput
            control={control}
            name="password"
            label="Password"
            rules={{
              required: validationMessages.required,
              minLength: {
                value: passwordMinLength,
                message: validationMessages.password.minLength,
              },
            }}
            secureTextEntry={secureTextEntry}
            icon="lock"
            rightIcon={secureTextEntry ? 'eye' : 'eye-off'}
            onRightIconPress={toggleSecureEntry}
            returnKeyType="done"
            onSubmitEditing={handleSubmit(onSubmit)}
            ref={passwordInputRef}
            disabled={isSubmitting}
          />

          <View style={styles.rememberMe}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => {
                haptics.light();
                setRememberMe(!rememberMe);
              }}
              disabled={isSubmitting}>
              <Icon
                name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={rememberMe ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.checkboxLabel}>Remember me</Text>
            </TouchableOpacity>
          </View>

          {error && (
            <Animated.View 
              style={[styles.errorContainer, { opacity: animation.formOpacity }]}>
              <Icon name="alert-circle" size={20} color={colors.error} />
              <Text style={styles.error}>{error}</Text>
            </Animated.View>
          )}

          {success && (
            <Animated.View 
              style={[styles.successContainer, { opacity: animation.formOpacity }]}>
              <Icon name="check-circle" size={20} color={colors.success} />
              <Text style={styles.success}>{success}</Text>
            </Animated.View>
          )}

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            style={styles.button}
            contentStyle={styles.buttonContent}
            loading={loading || isSubmitting}
            disabled={loading || isSubmitting}>
            {loading || isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                navigation.navigate('SignUp');
              }}
              style={styles.signUpButton}
              disabled={isSubmitting}>
              <Text style={styles.signUpText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    ...shadows.medium,
  },
  title: {
    color: colors.primary,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: Math.min(400, width - 48),
    alignSelf: 'center',
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.error}10`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  error: {
    ...typography.bodyMedium,
    color: colors.error,
    marginLeft: 8,
    flex: 1,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.success}10`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  success: {
    ...typography.bodyMedium,
    color: colors.success,
    marginLeft: 8,
    flex: 1,
  },
  button: {
    marginBottom: 24,
    borderRadius: 12,
    ...shadows.small,
    backgroundColor: colors.primary,
  },
  buttonContent: {
    paddingVertical: 8,
    height: 56,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
  },
  footerText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  signUpButton: {
    marginLeft: 8,
    padding: 4,
  },
  signUpText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
}); 