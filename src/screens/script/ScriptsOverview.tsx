import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Text, Button, Card, useTheme, IconButton, Menu, Divider, Portal, Dialog, Snackbar, FAB } from 'react-native-paper';
import firestore from '@react-native-firebase/firestore';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { MainNavigationProp } from '../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Script } from '../../types/script';
import firebaseService from '../../services/firebase';

const ScriptsOverview = () => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error'>('success');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation<MainNavigationProp>();
  const { user, signOut } = useAuth();
  const theme = useTheme();

  const loadScripts = useCallback(async () => {
    if (!user) {
      console.log('No authenticated user found in ScriptsOverview');
      setLoading(false);
      setError('Please sign in to view your scripts');
      return;
    }

    try {
      console.log('Loading scripts for user:', user.uid);
      const scriptsSnapshot = await firestore()
        .collection('scripts')
        .where('userId', '==', user.uid)
        .orderBy('updatedAt', 'desc')
        .get();

      console.log('Received scripts, document count:', scriptsSnapshot.docs.length);
      const scriptsData = scriptsSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Convert timestamps
        let createdAt = null;
        let updatedAt = null;

        try {
          if (data.createdAt?.toDate) {
            createdAt = data.createdAt.toDate();
          } else if (data.createdAt) {
            createdAt = new Date(data.createdAt);
          }
          
          if (data.updatedAt?.toDate) {
            updatedAt = data.updatedAt.toDate();
          } else if (data.updatedAt) {
            updatedAt = new Date(data.updatedAt);
          }
        } catch (err) {
          console.error('Error converting timestamps:', err);
        }

        return {
          ...data,
          id: doc.id,
          createdAt,
          updatedAt,
          title: data.title || 'Untitled',
          description: data.description || null,
          status: data.status || 'draft',
          scenes: Array.isArray(data.scenes) ? data.scenes : [],
          characters: Array.isArray(data.characters) ? data.characters : [],
          settings: Array.isArray(data.settings) ? data.settings : []
        } as Script;
      });

      setScripts(scriptsData);
      setError(null);
    } catch (err) {
      console.error('Error loading scripts:', err);
      setError('Failed to load scripts. Please try again.');
      setSnackbarMessage('Failed to load scripts');
      setSnackbarType('error');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadScripts();
  }, [loadScripts]);

  const handleCreateScript = () => {
    setShowCreateDialog(true);
  };

  const handleNewScript = () => {
    setShowCreateDialog(false);
    navigation.navigate('NewScript');
  };

  const handleUploadScript = () => {
    setShowCreateDialog(false);
    navigation.navigate('UploadScript');
  };

  const handleDeletePress = (script: Script) => {
    setSelectedScript(script);
    setMenuVisible(null);
    setDeleteDialogVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedScript) return;
    
    setDeleteLoading(true);
    try {
      await firestore()
        .collection('scripts')
        .doc(selectedScript.id)
        .delete();
      
      setSnackbarMessage('Script deleted successfully');
      setSnackbarType('success');
    } catch (error) {
      console.error('Error deleting script:', error);
      setSnackbarMessage('Failed to delete script. Please try again.');
      setSnackbarType('error');
    } finally {
      setDeleteLoading(false);
      setDeleteDialogVisible(false);
      setSnackbarVisible(true);
    }
  };

  const handleEdit = (script: Script) => {
    setMenuVisible(null);
    navigation.navigate('ScriptDetail', { scriptId: script.id });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft':
        return theme.colors.primary;
      case 'completed':
        return '#4CAF50';
      default:
        return theme.colors.secondary;
    }
  };

  const handleLogout = async () => {
    try {
      const result = await signOut();
      if (result.success) {
        setSnackbarMessage('Logged out successfully');
        setSnackbarType('success');
      } else if (result.error) {
        setSnackbarMessage('Failed to log out. Please try again.');
        setSnackbarType('error');
      }
      setSnackbarVisible(true);
    } catch (error) {
      setSnackbarMessage('Failed to log out. Please try again.');
      setSnackbarType('error');
      setSnackbarVisible(true);
    }
  };

  const renderScript = ({ item }: { item: Script }) => {
    const formatDate = (date: Date | null | undefined) => {
      if (!date) return 'No date';
      try {
        return date.toLocaleDateString();
      } catch (err) {
        console.error('Error formatting date:', err);
        return 'Invalid date';
      }
    };

    return (
      <Card 
        style={[styles.card, { backgroundColor: theme.colors.elevation.level2 }]}
        onPress={() => navigation.navigate('ScriptDetail', { scriptId: item.id })}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleContainer}>
              <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
                {item.title}
              </Text>
              {item.analysis && (
                <View style={styles.statsContainer}>
                  <Text variant="bodySmall" style={styles.statsText}>
                    {item.analysis.characters.length} Characters · {item.analysis.scenes.length} Scenes
                  </Text>
                  <Text variant="bodySmall" style={styles.statsText}>
                    Duration: {Math.round(item.analysis.metadata.estimatedDuration)}min
                  </Text>
                </View>
              )}
            </View>
            <Menu
              visible={menuVisible === item.id}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  iconColor={theme.colors.onSurface}
                  onPress={() => setMenuVisible(item.id)}
                />
              }
            >
              <Menu.Item 
                onPress={() => handleEdit(item)} 
                title="Edit" 
                leadingIcon="pencil"
              />
              <Menu.Item 
                onPress={() => handleDeletePress(item)}
                title="Delete"
                leadingIcon="delete"
                titleStyle={{ color: theme.colors.error }}
              />
            </Menu>
          </View>
          {item.processingStatus && (
            <View style={styles.processingContainer}>
              <Text variant="bodySmall" style={styles.processingText}>
                {item.processingStatus.status}
                {item.processingStatus.progress !== undefined && 
                  ` - ${Math.round(item.processingStatus.progress)}%`}
              </Text>
              {item.processingStatus.status.toLowerCase() !== 'completed' && (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              )}
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 16, color: theme.colors.onBackground }}>Loading your scripts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: theme.colors.error, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
          <Button mode="contained" onPress={loadScripts}>
            Try Again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const renderEmptyState = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ color: theme.colors.onBackground, marginBottom: 16, textAlign: 'center' }}>
        You don't have any scripts yet.
      </Text>
      <Button mode="contained" onPress={handleCreateScript}>
        Create Your First Script
      </Button>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.surfaceVariant }]}>
        <View style={styles.headerLeft}>
          <Text 
            variant="headlineMedium" 
            style={[styles.headerTitle, { color: theme.colors.onBackground }]}
          >
            My Scripts
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Button
            mode="contained"
            onPress={handleCreateScript}
            icon="plus"
            disabled={loading}
            style={styles.newButton}
          >
            New Script
          </Button>
          <IconButton
            icon="logout"
            mode="contained-tonal"
            onPress={handleLogout}
            disabled={loading}
          />
        </View>
      </View>

      <FlatList
        data={scripts}
        renderItem={renderScript}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          scripts.length === 0 && styles.emptyListContent
        ]}
        ListEmptyComponent={renderEmptyState}
      />

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Script</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to delete "{selectedScript?.title}"? This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleDeleteConfirm}
              loading={deleteLoading}
              disabled={deleteLoading}
              textColor={theme.colors.error}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={showCreateDialog} onDismiss={() => setShowCreateDialog(false)}>
          <Dialog.Title>Create New Script</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Choose how you want to create your script:</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onPress={handleNewScript}>Create Empty</Button>
            <Button mode="contained" onPress={handleUploadScript}>Upload PDF</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={[
          styles.snackbar,
          { backgroundColor: snackbarType === 'success' ? '#4CAF50' : '#DC2626' }
        ]}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={handleCreateScript}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    marginBottom: 0,
  },
  newButton: {
    marginRight: 8,
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flex: 1,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    marginBottom: 4,
  },
  statsContainer: {
    marginTop: 4,
  },
  statsText: {
    opacity: 0.7,
    fontSize: 12,
    marginTop: 2,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  processingText: {
    opacity: 0.7,
    textTransform: 'capitalize',
  },
  snackbar: {
    marginBottom: 16,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default ScriptsOverview; 