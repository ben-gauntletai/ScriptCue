/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import firebase from '@react-native-firebase/app';
import { ActivityIndicator, View, Text } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { theme, navigationTheme } from './src/theme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScriptsOverview, NewScript, ScriptDetail, EditScript } from './src/screens';
import { SignInScreen } from './src/screens/auth/SignInScreen';
import { SignUpScreen } from './src/screens/auth/SignUpScreen';
import { UploadScriptScreen } from './src/screens/script/UploadScriptScreen';
import { CharacterSelectionScreen } from './src/screens/script/CharacterSelectionScreen';
import { ScriptReaderScreen } from './src/screens/script/ScriptReaderScreen';
import { RootStackParamList, AuthStackParamList, MainStackParamList } from './src/navigation/types';
import ErrorBoundary from './src/components/ErrorBoundary';
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
} from '@env';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID
};

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={SignInScreen} />
    <AuthStack.Screen name="SignUp" component={SignUpScreen} />
  </AuthStack.Navigator>
);

const MainNavigator = () => (
  <MainStack.Navigator screenOptions={{ headerShown: false }}>
    <MainStack.Screen name="Scripts" component={ScriptsOverview} />
    <MainStack.Screen name="NewScript" component={NewScript} />
    <MainStack.Screen name="UploadScript" component={UploadScriptScreen} />
    <MainStack.Screen name="ScriptDetail" component={ScriptDetail} />
    <MainStack.Screen name="CharacterSelection" component={CharacterSelectionScreen} />
    <MainStack.Screen name="ScriptReader" component={ScriptReaderScreen} />
    <MainStack.Screen name="EditScript" component={EditScript} />
  </MainStack.Navigator>
);

const NavigationContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <RootStack.Screen name="Main" component={MainNavigator} />
      )}
    </RootStack.Navigator>
  );
};

const App = () => {
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        if (!firebase.apps.length) {
          await firebase.initializeApp(firebaseConfig);
          console.log('Firebase initialized successfully');
        }
        setFirebaseInitialized(true);
      } catch (error) {
        console.error('Error initializing Firebase:', error);
        setError('Failed to initialize app. Please restart.');
      }
    };

    initializeFirebase();
  }, []);

  if (!firebaseInitialized) {
    return (
      <PaperProvider theme={theme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
          {error ? (
            <Text style={{ color: theme.colors.error, textAlign: 'center', padding: 20 }}>{error}</Text>
          ) : (
            <ActivityIndicator size="large" color={theme.colors.primary} />
          )}
        </View>
      </PaperProvider>
    );
  }

  return (
    <ErrorBoundary>
      <PaperProvider theme={theme}>
        <SafeAreaProvider>
          <AuthProvider>
            <NavigationContainer theme={navigationTheme}>
              <NavigationContent />
            </NavigationContainer>
          </AuthProvider>
        </SafeAreaProvider>
      </PaperProvider>
    </ErrorBoundary>
  );
};

export default App;
