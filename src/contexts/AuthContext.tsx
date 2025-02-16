import React, {createContext, useState, useContext, useEffect, useRef} from 'react';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';

interface AuthResult {
  success?: string;
  error?: string;
}

interface AuthContextData {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  sendEmailVerification: () => Promise<AuthResult>;
  deleteAccount: () => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lastLoginAttempt, setLastLoginAttempt] = useState(0);
  
  // Use ref to track authentication state to prevent unwanted updates
  const authStateRef = useRef<{
    isAuthenticating: boolean;
    pendingUser: FirebaseAuthTypes.User | null;
  }>({
    isAuthenticating: false,
    pendingUser: null,
  });

  // Initialize auth state
  useEffect(() => {
    let unsubscribe: () => void;

    const initializeAuth = async () => {
      try {
        setLoading(true);
        
        // Set up auth state listener
        unsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
          if (authStateRef.current.isAuthenticating) {
            authStateRef.current.pendingUser = firebaseUser;
            return;
          }

          if (firebaseUser) {
            await AsyncStorage.setItem(
              'user',
              JSON.stringify({
                email: firebaseUser.email,
                uid: firebaseUser.uid,
              })
            );
            setUser(firebaseUser);
          } else {
            setUser(null);
            await AsyncStorage.removeItem('user');
            await AsyncStorage.removeItem('rememberMe');
          }
          
          setLoading(false);
        });

        // Check stored user data
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          const currentUser = auth().currentUser;
          
          if (!currentUser || currentUser.uid !== userData.uid) {
            await AsyncStorage.removeItem('user');
            await AsyncStorage.removeItem('rememberMe');
          }
        }

        setInitialized(true);
        setLoading(false);
      } catch (error) {
        console.error('Error initializing auth:', error);
        setLoading(false);
        setInitialized(true);
      }
    };

    initializeAuth();
    return () => unsubscribe?.();
  }, []);

  const checkLoginAttempts = () => {
    const now = Date.now();
    if (now - lastLoginAttempt > LOCKOUT_DURATION) {
      setLoginAttempts(0);
      return true;
    }
    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      return false;
    }
    return true;
  };

  const signIn = async (email: string, password: string, rememberMe?: boolean): Promise<AuthResult> => {
    if (!initialized) {
      return { error: 'Authentication is not initialized' };
    }

    // Rate limiting check
    const now = Date.now();
    if (loginAttempts >= 5 && now - lastLoginAttempt < 300000) { // 5 minutes
      return { error: 'Too many login attempts. Please try again in a few minutes.' };
    }

    try {
      console.log('=== Auth Context: Starting Sign In ===');
      authStateRef.current.isAuthenticating = true;
      setLoginAttempts((prev) => prev + 1);
      setLastLoginAttempt(now);
      
      console.log('Attempting to sign in with Firebase...');
      const userCredential = await auth().signInWithEmailAndPassword(email, password);
      console.log('Firebase response:', userCredential);

      if (rememberMe) {
        await AsyncStorage.setItem('rememberMe', 'true');
      }

      setUser(userCredential.user);
      await AsyncStorage.setItem(
        'user',
        JSON.stringify({
          email: userCredential.user.email,
          uid: userCredential.user.uid,
        })
      );

      setLoginAttempts(0);
      return { success: 'Signed in successfully' };
    } catch (error) {
      console.log('=== Auth Context: Error in Sign In ===');
      console.log('Raw error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in';
      console.log('Extracted error message:', errorMessage);
      return { error: getReadableErrorMessage(errorMessage) };
    } finally {
      authStateRef.current.isAuthenticating = false;
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string): Promise<AuthResult> => {
    if (!initialized) {
      return { error: 'Authentication is not initialized' };
    }

    try {
      setLoading(true);
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      
      await AsyncStorage.setItem(
        'user',
        JSON.stringify({
          email: userCredential.user.email,
          uid: userCredential.user.uid,
        })
      );
      
      setUser(userCredential.user);
      return { success: 'Account created successfully!' };
    } catch (error) {
      return { error: getReadableErrorMessage(error instanceof Error ? error.message : 'Failed to create account') };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<AuthResult> => {
    if (!initialized) {
      return { error: 'Authentication is not initialized' };
    }

    try {
      setLoading(true);
      await Promise.all([
        AsyncStorage.removeItem('rememberMe'),
        AsyncStorage.removeItem('user'),
        auth().signOut()
      ]);
      return { success: 'Signed out successfully' };
    } catch (error) {
      return { error: 'Error signing out. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<AuthResult> => {
    try {
      await auth().sendPasswordResetEmail(email);
      return { success: 'Password reset email sent. Please check your inbox.' };
    } catch (error) {
      return { error: getReadableErrorMessage(error instanceof Error ? error.message : 'Failed to reset password') };
    }
  };

  const updateEmail = async (email: string): Promise<AuthResult> => {
    try {
      if (!user) return { error: 'No user logged in' };
      await user.verifyBeforeUpdateEmail(email);
      return { success: 'Please check your email to verify the new address.' };
    } catch (error) {
      return { error: getReadableErrorMessage(error instanceof Error ? error.message : 'Failed to update email') };
    }
  };

  const updatePassword = async (password: string): Promise<AuthResult> => {
    try {
      if (!user) return { error: 'No user logged in' };
      await user.updatePassword(password);
      return { success: 'Password updated successfully' };
    } catch (error) {
      return { error: getReadableErrorMessage(error instanceof Error ? error.message : 'Failed to update password') };
    }
  };

  const sendEmailVerification = async (): Promise<AuthResult> => {
    try {
      if (!user) return { error: 'No user logged in' };
      await user.sendEmailVerification();
      return { success: 'Verification email sent successfully' };
    } catch (error) {
      return { error: getReadableErrorMessage(error instanceof Error ? error.message : 'Failed to send verification email') };
    }
  };

  const deleteAccount = async (): Promise<AuthResult> => {
    try {
      if (!user) return { error: 'No user logged in' };
      await user.delete();
      return { success: 'Account deleted successfully' };
    } catch (error) {
      return { error: getReadableErrorMessage(error instanceof Error ? error.message : 'Failed to delete account') };
    }
  };

  const getReadableErrorMessage = (errorMessage: string): string => {
    console.log('Getting readable error message for:', errorMessage);
    // Convert Firebase error messages to user-friendly messages
    const errorMap: {[key: string]: string} = {
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/email-already-in-use': 'An account already exists with this email.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/operation-not-allowed': 'This operation is not allowed.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/requires-recent-login': 'Please sign in again to continue.',
      'auth/invalid-action-code': 'The verification link is invalid or has expired. Please request a new one.',
      'auth/expired-action-code': 'The verification link has expired. Please request a new one.',
      'auth/email-not-verified': 'Please verify your email before signing in.',
      'auth/invalid-login': 'Invalid email or password.',
      'auth/invalid-login-credentials': 'Invalid email or password.',
      'INVALID_LOGIN_CREDENTIALS': 'Invalid email or password.',
    };

    // First check for exact error code matches
    for (const [errorCode, message] of Object.entries(errorMap)) {
      if (errorMessage.includes(errorCode)) {
        console.log('Found exact error code match:', errorCode, 'with message:', message);
        return message;
      }
    }

    // Then check for error message content
    const errorLower = errorMessage.toLowerCase();
    if (errorLower.includes('invalid login') || 
        errorLower.includes('invalid_login_credentials') || 
        errorLower.includes('invalid-login-credentials')) {
      console.log('Found invalid login error');
      return 'Invalid email or password.';
    }

    // If no specific error is found, return a generic message
    console.log('No matching error code found, returning generic message');
    return 'An unexpected error occurred. Please try again.';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        initialized,
        signIn,
        signOut,
        signUp,
        resetPassword,
        updateEmail,
        updatePassword,
        sendEmailVerification,
        deleteAccount,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 