import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';

export const HomeScreen = () => {
  const { user, signOut, loading: authLoading, initialized } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (!initialized) {
      setError('Please wait for authentication to initialize');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  if (!initialized || authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>
          Welcome to ScriptCue
        </Text>
        <Text style={styles.subtitle}>
          {user ? `Signed in as: ${user.email}` : 'Not signed in'}
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {user && (
          <Button
            mode="contained"
            onPress={handleSignOut}
            style={styles.button}
            disabled={loading}
            loading={loading}>
            {loading ? 'Signing Out...' : 'Sign Out'}
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginBottom: 16,
    color: '#1B365D',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#4A5568',
    marginBottom: 24,
    textAlign: 'center',
  },
  error: {
    color: '#DC2626',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    maxWidth: 300,
    marginTop: 8,
    backgroundColor: '#1B365D',
  },
}); 