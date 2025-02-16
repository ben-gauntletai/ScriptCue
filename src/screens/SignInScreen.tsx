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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useForm, Controller } from 'react-hook-form';
import { emailPattern, validationMessages, passwordMinLength } from '../../utils/validation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, typography, shadows } from '../../theme';
import { haptics } from '../../utils/interaction';
import { createFormAnimation } from '../../utils/animations';
import { FormInput } from '../../components/common/FormComponents';

type SignInScreenNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'SignIn'
>;

type FormData = {
  email: string;
  password: string;
};

const { width } = Dimensions.get('window');

export const SignInScreen = () => {
  const navigation = useNavigation<SignInScreenNavigationProp>();
  const { signIn, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordInputRef = useRef<RNTextInput>(null);
  const animation = createFormAnimation();

  const {
    control,
    handleSubmit,
    formState: { errors },
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

  useEffect(() => {
    StatusBar.setBarStyle('dark-content');
    animation.animate();
    return () => {
      StatusBar.setBarStyle('default');
    };
  }, []);

  const onSubmit = async (data: FormData) => {
    try {
      console.log('=== Starting Sign In Process ===');
      console.log('1. Initial State:', { error, success, isSubmitting });
      console.log('2. Form Data:', data);
      
      setError(null);
      setSuccess(null);
      clearErrors();
      setIsSubmitting(true);
      
      console.log('3. State after reset:', { error, success, isSubmitting });

      const result = await signIn(data.email.trim(), data.password, rememberMe);
      console.log('4. Sign in result:', result);
      
      if (result.error) {
        console.log('5. Error path:', result.error);
        haptics.error();
        
        const errorLower = result.error.toLowerCase();
        console.log('6. Error (lowercase):', errorLower);
        console.log('7. Current form errors:', errors);

        // Set error message first
        console.log('8. Setting error state to:', result.error);
        setError(result.error);
        
        // Force a re-render to ensure state is updated
        await new Promise(resolve => setTimeout(resolve, 0));
        console.log('9. Error state after set:', error);

        // Then try to set field-specific errors
        if (errorLower.includes('no account') || errorLower.includes('user-not-found')) {
          console.log('10a. Setting email field error');
          setFormError('email', { message: result.error });
        } else if (errorLower.includes('password') || errorLower.includes('invalid')) {
          console.log('10b. Setting password field error');
          setFormError('password', { message: result.error });
        }
        
        console.log('11. Final form errors:', errors);
      } else if (result.success) {
        console.log('5. Success path:', result.success);
        haptics.success();
        setSuccess(result.success);
        reset();
      }
    } catch (err) {
      console.log('Error in submit handler:', err);
      haptics.error();
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
      console.log('=== Final State ===');
      console.log('Error:', error);
      console.log('Success:', success);
      console.log('Form Errors:', errors);
      console.log('Is Submitting:', isSubmitting);
      console.log('=== End Sign In Process ===');
    }
  };

  // Add effect to monitor error state changes
  useEffect(() => {
    console.log('Error state changed:', error);
  }, [error]);

  // Add effect to monitor form errors
  useEffect(() => {
    console.log('Form errors changed:', errors);
  }, [errors]);

  // Add logging to render
  console.log('Rendering SignInScreen:', {
    error,
    success,
    isSubmitting,
    formErrors: errors,
  });

  const isLoading = isSubmitting || authLoading;

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
            disabled={isLoading}
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
            disabled={isLoading}
          />

          <View style={styles.rememberMe}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => {
                haptics.light();
                setRememberMe(!rememberMe);
              }}
              disabled={isLoading}>
              <Icon
                name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={rememberMe ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.checkboxLabel}>Remember me</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                navigation.navigate('ForgotPassword');
              }}
              style={styles.forgotPasswordButton}
              disabled={isLoading}>
              <Text style={styles.forgotPassword}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {error && (
            <Animated.View 
              style={[styles.errorContainer, { opacity: animation.formOpacity }]}
              accessible={true}
              accessibilityRole="alert"
              accessibilityLabel={`Error: ${error}`}>
              <View style={styles.errorContent}>
                <Icon 
                  name="alert-circle" 
                  size={20} 
                  color={colors.error} 
                  style={styles.errorIcon}
                />
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {error}
                </Text>
              </View>
            </Animated.View>
          )}

          {success && (
            <Animated.View 
              style={[styles.successContainer, { opacity: animation.formOpacity }]}
              accessible={true}
              accessibilityRole="alert"
              accessibilityLabel={`Success: ${success}`}>
              <View style={styles.successContent}>
                <Icon name="check-circle" size={20} color={colors.success} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            </Animated.View>
          )}

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            style={styles.button}
            contentStyle={styles.buttonContent}
            loading={isLoading}
            disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                navigation.navigate('SignUp');
              }}
              style={styles.signUpButton}
              disabled={isLoading}>
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
    justifyContent: 'space-between',
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
  forgotPasswordButton: {
    padding: 4,
  },
  forgotPassword: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: `${colors.error}10`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    ...typography.bodyMedium,
    color: colors.error,
    flex: 1,
  },
  successContainer: {
    backgroundColor: `${colors.success}10`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  successContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successText: {
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