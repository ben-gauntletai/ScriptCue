import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Text, Button, Card, useTheme, IconButton, Menu, Divider, Portal, Dialog, Snackbar } from 'react-native-paper';
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
  const navigation = useNavigation<MainNavigationProp>();
  const { user, signOut } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (!user) {
      console.log('No authenticated user found in ScriptsOverview');
      setLoading(false);
      return;
    }

    console.log('Setting up scripts listener for user:', user.uid, 'Email:', user.email);
    let isFirstLoad = true;

    // Set up real-time listener
    const unsubscribe = firestore()
      .collection('scripts')
      .where('userId', '==', user.uid)
      .orderBy('updatedAt', 'desc')
      .onSnapshot(
        snapshot => {
          try {
            console.log('Received scripts update, document count:', snapshot.docs.length);
            const scriptsData = snapshot.docs.map(doc => {
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
                console.error('Error converting timestamps:', err, data);
              }

              const scriptData = {
                ...data,
                id: doc.id,
                createdAt,
                updatedAt,
                // Ensure all required fields have default values
                title: data.title || 'Untitled',
                description: data.description || null,
                status: data.status || 'draft',
                scenes: Array.isArray(data.scenes) ? data.scenes : [],
                characters: Array.isArray(data.characters) ? data.characters : [],
                settings: Array.isArray(data.settings) ? data.settings : []
              } as Script;

              return scriptData;
            });
            
            setScripts(scriptsData);
            
            // Only set loading to false on first load
            if (isFirstLoad) {
              setLoading(false);
              isFirstLoad = false;
            }
            
            // Always clear refreshing state
            setRefreshing(false);
          } catch (err) {
            console.error('Error processing scripts snapshot:', err);
            setSnackbarMessage('Error processing scripts data');
            setSnackbarType('error');
            setSnackbarVisible(true);
            setLoading(false);
            setRefreshing(false);
          }
        },
        error => {
          console.error('Error fetching scripts:', error);
          setSnackbarMessage('Failed to load scripts');
          setSnackbarType('error');
          setSnackbarVisible(true);
          setLoading(false);
          setRefreshing(false);
        }
      );

    // Clean up listener on unmount
    return () => {
      console.log('Cleaning up scripts listener for user:', user.uid);
      unsubscribe();
    };
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // The real-time listener will automatically update the data
    // and set refreshing to false
  }, []);

  const handleCreateNew = () => {
    navigation.navigate('NewScript');
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
    // Safely format the date
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
        style={styles.card} 
        onPress={() => navigation.navigate('ScriptDetail', { scriptId: item.id })}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleLarge" style={styles.title}>{item.title}</Text>
            <Menu
              visible={menuVisible === item.id}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  onPress={() => setMenuVisible(item.id)}
                />
              }
            >
              <Menu.Item 
                onPress={() => handleEdit(item)} 
                title="Edit" 
                leadingIcon="pencil"
              />
              <Divider />
              <Menu.Item 
                onPress={() => handleDeletePress(item)}
                title="Delete"
                leadingIcon="delete"
                titleStyle={{ color: theme.colors.error }}
              />
            </Menu>
          </View>
          {item.description && (
            <Text variant="bodyMedium" numberOfLines={2} style={styles.description}>
              {item.description}
            </Text>
          )}
          <View style={styles.cardFooter}>
            <Text variant="bodySmall" style={styles.date}>
              Updated: {formatDate(item.updatedAt)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (!user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="headlineMedium" style={styles.headerTitle}>My Scripts</Text>
        </View>
        <View style={styles.headerRight}>
          <Button
            mode="contained"
            onPress={handleCreateNew}
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

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : scripts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text variant="bodyLarge" style={styles.emptyText}>
            No scripts yet. Create your first script to get started!
          </Text>
          <Button
            mode="contained"
            onPress={handleCreateNew}
            icon="plus"
            style={styles.emptyButton}
          >
            Create Script
          </Button>
        </View>
      ) : (
        <FlatList
          data={scripts}
          renderItem={renderScript}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
        />
      )}

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    marginRight: 8,
  },
  description: {
    marginTop: 8,
    color: '#666',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  date: {
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 16,
    color: '#666',
  },
  emptyButton: {
    minWidth: 200,
  },
  snackbar: {
    marginBottom: 16,
  },
});

export default ScriptsOverview; 