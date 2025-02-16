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
import { useForm } from 'react-hook-form';
import { emailPattern, validationMessages } from '../../utils/validation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Header } from '../../components/common/Header';
import { colors, shadows, typography } from '../../theme';
import { FormInput } from '../../components/common/FormComponents';
import { haptics } from '../../utils/interaction';
import { createFormAnimation } from '../../utils/animations';

type SignUpScreenNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'SignUp'
>;

type FormData = {
  email: string;
  password: string;
  confirmPassword: string;
};

const { width } = Dimensions.get('window');

export const SignUpScreen = () => {
  const navigation = useNavigation<SignUpScreenNavigationProp>();
  const { signUp, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [secureConfirmTextEntry, setSecureConfirmTextEntry] = useState(true);

  const passwordInputRef = useRef<RNTextInput>(null);
  const confirmPasswordInputRef = useRef<RNTextInput>(null);

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
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password');

  const onSubmit = async (data: FormData) => {
    try {
      haptics.medium();
      setError(null);
      const result = await signUp(data.email.trim(), data.password);
      
      if (result.success) {
        haptics.success();
        navigation.reset({
          index: 0,
          routes: [{ name: 'SignIn' }],
        });
      } else if (result.error) {
        haptics.error();
        setError(result.error);
      }
    } catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : 'Failed to create account');
    }
  };

  const validateConfirmPassword = (value: string) => {
    return value === password || validationMessages.password.match;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <Header 
        title="Create Account" 
        subtitle="Join ScriptCue today"
        onBackPress={() => {
          haptics.light();
          navigation.goBack();
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}>
        <Animated.View style={[styles.form, animation.formStyle]}>
          <View style={styles.iconContainer}>
            <Icon name="account-plus" size={80} color={colors.primary} />
          </View>

          <FormInput
            control={control}
            name="email"
            label="Email"
            rules={{
              required: validationMessages.required,
              pattern: {
                value: emailPattern,
                message: validationMessages.email,
              },
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            icon="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
          />

          <FormInput
            control={control}
            name="password"
            label="Password"
            rules={{
              required: validationMessages.required,
              minLength: {
                value: 6,
                message: validationMessages.password.minLength,
              },
            }}
            secureTextEntry={secureTextEntry}
            icon="lock"
            rightIcon={secureTextEntry ? 'eye' : 'eye-off'}
            onRightIconPress={() => {
              haptics.light();
              setSecureTextEntry(!secureTextEntry);
            }}
            ref={passwordInputRef}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
          />

          <FormInput
            control={control}
            name="confirmPassword"
            label="Confirm Password"
            rules={{
              required: validationMessages.required,
              validate: validateConfirmPassword,
            }}
            secureTextEntry={secureConfirmTextEntry}
            icon="lock-check"
            rightIcon={secureConfirmTextEntry ? 'eye' : 'eye-off'}
            onRightIconPress={() => {
              haptics.light();
              setSecureConfirmTextEntry(!secureConfirmTextEntry);
            }}
            ref={confirmPasswordInputRef}
            returnKeyType="done"
            onSubmitEditing={handleSubmit(onSubmit)}
          />

          {error && (
            <Animated.View 
              style={[styles.errorContainer, { opacity: animation.formOpacity }]}>
              <Icon name="alert-circle" size={20} color={colors.error} />
              <Text style={styles.error}>{error}</Text>
            </Animated.View>
          )}

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            style={styles.button}
            contentStyle={styles.buttonContent}
            loading={loading}
            disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </Button>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                navigation.navigate('SignIn');
              }}
              style={styles.signInButton}>
              <Text style={styles.signInText}>Sign In</Text>
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
  form: {
    flex: 1,
    width: '100%',
    maxWidth: Math.min(400, width - 48),
    alignSelf: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    alignSelf: 'center',
    ...shadows.medium,
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
  signInButton: {
    marginLeft: 8,
    padding: 4,
  },
  signInText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
}); 