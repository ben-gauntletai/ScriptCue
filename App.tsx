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
import { Provider as PaperProvider, Button } from 'react-native-paper';
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
import firebaseService from './src/services/firebase';
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
} from '@env';
import firestore from '@react-native-firebase/firestore';

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
  <MainStack.Navigator 
    screenOptions={{ 
      headerShown: true,
      headerBackTitleVisible: false,
      headerStyle: {
        backgroundColor: theme.colors.background,
      },
      headerTintColor: theme.colors.primary,
    }}
  >
    <MainStack.Screen 
      name="Scripts" 
      component={ScriptsOverview}
      options={{ headerShown: false }}
    />
    <MainStack.Screen 
      name="NewScript" 
      component={NewScript}
      options={{ title: 'New Script' }}
    />
    <MainStack.Screen 
      name="UploadScript" 
      component={UploadScriptScreen}
      options={{ title: 'Upload Script' }}
    />
    <MainStack.Screen 
      name="ScriptDetail" 
      component={ScriptDetail}
      options={{ title: 'Script Details' }}
    />
    <MainStack.Screen 
      name="CharacterSelection" 
      component={CharacterSelectionScreen}
      options={{ title: 'Select Character' }}
    />
    <MainStack.Screen 
      name="ScriptReader" 
      component={ScriptReaderScreen}
      options={{ title: 'Script Reader' }}
    />
    <MainStack.Screen 
      name="EditScript" 
      component={EditScript}
      options={{ title: 'Edit Script' }}
    />
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

  const initializeFirebase = async () => {
    console.log('Starting Firebase initialization...');
    console.log('Firebase Config:', {
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
    });
    try {
      // Initialize Firebase app first
      if (!firebase.apps.length) {
        console.log('Initializing Firebase app...');
        await firebase.initializeApp(firebaseConfig);
        console.log('Firebase app initialized successfully');
      } else {
        console.log('Firebase app already initialized');
      }

      // Create a timeout promise
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('App initialization timed out')), 30000);
      });

      // Create the initialization promise
      const initPromise = (async () => {
        console.log('Initializing Firebase service...');
        try {
          await firebaseService.initialize();
          console.log('Firebase service initialized successfully');
          return true;
        } catch (error) {
          console.error('Firebase service initialization error:', error);
          throw error;
        }
      })();

      // Race between timeout and initialization
      await Promise.race([initPromise, timeout]);
      setFirebaseInitialized(true);
      console.log('App initialization completed');
    } catch (error) {
      console.error('Error in app initialization:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize app';
      setError(`${errorMessage}. Please check your connection and try again.`);
      // Reset initialization state
      setFirebaseInitialized(false);
    }
  };

  useEffect(() => {
    initializeFirebase();

    // Cleanup function
    return () => {
      setFirebaseInitialized(false);
      setError(null);
    };
  }, []);

  if (!firebaseInitialized) {
    return (
      <PaperProvider theme={theme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background, padding: 20 }}>
          {error ? (
            <>
              <Text style={{ color: theme.colors.error, textAlign: 'center', marginBottom: 16 }}>{error}</Text>
              <Button 
                mode="contained"
                onPress={() => {
                  setError(null);
                  setFirebaseInitialized(false);
                  initializeFirebase();
                }}
              >
                Retry
              </Button>
            </>
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
