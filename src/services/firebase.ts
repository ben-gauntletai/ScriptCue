import firebase from '@react-native-firebase/app';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { Platform } from 'react-native';
import { NewScriptData } from '../types/script';

class FirebaseService {
  private static instance: FirebaseService;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    console.log('FirebaseService constructor called');
    try {
      // Set Firestore settings immediately in constructor
      firestore().settings({
        cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
        persistence: true
      });
      console.log('Firestore settings applied successfully');
    } catch (error) {
      console.error('Error applying Firestore settings:', error);
    }
  }

  static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      console.log('Creating new FirebaseService instance');
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('FirebaseService already initialized');
      return;
    }

    if (this.initializationPromise) {
      console.log('Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('Starting Firebase service initialization');

      // Check if Firebase is initialized
      if (!firebase.apps.length) {
        console.error('Firebase app not initialized');
        throw new Error('Firebase must be initialized before FirebaseService');
      }

      // Log the current app configuration
      const app = firebase.app();
      console.log('Using Firebase app:', {
        name: app.name,
        options: {
          projectId: app.options.projectId,
          storageBucket: app.options.storageBucket,
          messagingSenderId: app.options.messagingSenderId,
        }
      });

      // Log Firestore instance details
      const db = firestore();
      console.log('Firestore instance:', {
        app: db.app.name,
        projectId: db.app.options.projectId
      });

      // Basic connection test with timeout
      try {
        console.log('Testing Firestore connection...');
        
        // Create a timeout promise
        const timeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection test timed out')), 15000);
        });

        // Create the test operation promise
        const connectionTest = (async () => {
          try {
            console.log('Attempting to access Firestore...');
            // Instead of trying to read data, just check if Firestore is available
            await firestore().app.options;
            console.log('Firestore connection test successful');
            return true;
          } catch (error: any) {
            console.error('Error in Firestore access:', error);
            throw error;
          }
        })();

        // Race between timeout and connection test
        await Promise.race([connectionTest, timeout]);
        console.log('Connection test completed successfully');
      } catch (error) {
        console.error('Error in connection test:', error);
        throw new Error('Failed to establish Firestore connection. Please check your internet connection and try again.');
      }

      this.initialized = true;
      this.initializationPromise = null;
      console.log('Firebase service initialization completed successfully');
    } catch (error) {
      this.initializationPromise = null;
      this.initialized = false;
      console.error('Firebase service initialization failed:', error);
      throw error;
    }
  }

  // Auth methods
  async signIn(email: string, password: string): Promise<FirebaseAuthTypes.UserCredential> {
    try {
      return await auth().signInWithEmailAndPassword(email, password);
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await auth().signOut();
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  // Firestore methods
  async createScript(scriptData: NewScriptData): Promise<string> {
    try {
      console.log('=== Starting createScript process ===');
      
      if (!this.initialized) {
        console.log('Service not initialized, initializing...');
        await this.initialize();
        console.log('Service initialization complete');
      }

      const user = auth().currentUser;
      console.log('Current user ID:', user?.uid);
      if (!user) throw new Error('User not authenticated');

      // Validate required fields
      if (!scriptData.title?.trim()) {
        throw new Error('Title is required');
      }

      const now = firestore.Timestamp.now();
      console.log('Generated timestamp:', now.toDate());

      // Create the document data
      const firestoreData = {
        title: scriptData.title.trim(),
        description: scriptData.description?.trim() || null,
        userId: user.uid,
        status: scriptData.status || 'draft',
        scenes: Array.isArray(scriptData.scenes) ? scriptData.scenes : [],
        characters: Array.isArray(scriptData.characters) ? scriptData.characters : [],
        settings: Array.isArray(scriptData.settings) ? scriptData.settings : [],
        createdAt: now,
        updatedAt: now
      };

      console.log('Prepared document data:', JSON.stringify(firestoreData, null, 2));

      try {
        console.log('Attempting to write to Firestore...');
        // Direct write instead of batch for simplicity in debugging
        const docRef = await firestore()
          .collection('scripts')
          .add(firestoreData);

        console.log('Write successful, document ID:', docRef.id);

        // Immediate verification
        console.log('Verifying document...');
        const doc = await docRef.get();
        console.log('Document exists:', doc.exists);
        console.log('Document data:', doc.data());

        if (!doc.exists) {
          throw new Error('Script document was not created properly');
        }

        console.log('=== Script creation completed successfully ===');
        return docRef.id;
      } catch (writeError: any) {
        console.error('Firestore write error:', writeError);
        console.error('Error code:', writeError.code);
        console.error('Error message:', writeError.message);
        if (writeError.details) {
          console.error('Error details:', writeError.details);
        }
        throw writeError;
      }
    } catch (error: any) {
      console.error('=== Script creation failed ===');
      console.error('Error in createScript:', error);
      console.error('Error type:', typeof error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      throw this.handleFirestoreError(error);
    }
  }

  async updateScript(scriptId: string, data: any): Promise<void> {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('User not authenticated');

      await firestore()
        .collection('scripts')
        .doc(scriptId)
        .update({
          ...data,
          updatedAt: firestore.FieldValue.serverTimestamp()
        });
    } catch (error: any) {
      throw this.handleFirestoreError(error);
    }
  }

  async deleteScript(scriptId: string): Promise<void> {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('User not authenticated');

      await firestore()
        .collection('scripts')
        .doc(scriptId)
        .delete();
    } catch (error: any) {
      throw this.handleFirestoreError(error);
    }
  }

  scriptListener(
    scriptId: string, 
    onSnapshot: (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => void,
    onError?: (error: Error) => void
  ): () => void {
    return firestore()
      .collection('scripts')
      .doc(scriptId)
      .onSnapshot(onSnapshot, onError);
  }

  async checkDuplicateTitle(userId: string | undefined, title: string): Promise<FirebaseFirestoreTypes.QuerySnapshot> {
    if (!userId) throw new Error('User ID is required');
    
    return firestore()
      .collection('scripts')
      .where('userId', '==', userId)
      .where('title', '==', title.trim())
      .get();
  }

  // Error handling
  private handleAuthError(error: any): Error {
    console.error('Auth error:', error);
    
    switch (error.code) {
      case 'auth/user-not-found':
        return new Error('No user found with this email');
      case 'auth/wrong-password':
        return new Error('Incorrect password');
      case 'auth/invalid-email':
        return new Error('Invalid email address');
      case 'auth/user-disabled':
        return new Error('This account has been disabled');
      case 'auth/email-already-in-use':
        return new Error('This email is already registered');
      case 'auth/operation-not-allowed':
        return new Error('Operation not allowed');
      case 'auth/weak-password':
        return new Error('Password is too weak');
      default:
        return new Error('Authentication failed. Please try again.');
    }
  }

  private handleFirestoreError(error: any): Error {
    console.error('Firestore error:', error);
    
    switch (error.code) {
      case 'permission-denied':
        return new Error('You do not have permission to perform this action');
      case 'not-found':
        return new Error('The requested document was not found');
      case 'already-exists':
        return new Error('A document with this ID already exists');
      case 'failed-precondition':
        return new Error('Operation failed due to a precondition');
      case 'aborted':
        return new Error('Operation was aborted');
      case 'out-of-range':
        return new Error('Operation was out of range');
      case 'unavailable':
        return new Error('Service is currently unavailable. Please try again later.');
      case 'data-loss':
        return new Error('Unrecoverable data loss or corruption');
      case 'unauthenticated':
        return new Error('User is not authenticated');
      default:
        return new Error('Operation failed. Please try again.');
    }
  }
}

export const firebaseService = FirebaseService.getInstance();
export default firebaseService; 