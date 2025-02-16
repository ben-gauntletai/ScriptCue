/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ScriptProvider } from './src/contexts/ScriptContext';
import { AuthProvider } from './src/contexts/AuthContext';
import firebase from '@react-native-firebase/app';
import { ActivityIndicator, View, Text } from 'react-native';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { theme, navigationTheme } from './src/theme';

const App = () => {
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        if (!firebase.apps.length) {
          // Firebase will automatically read config from google-services.json
          await firebase.initializeApp();
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
    <PaperProvider theme={theme}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navigationTheme}>
            <ScriptProvider>
              <RootNavigator />
            </ScriptProvider>
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </PaperProvider>
  );
};

export default App;
