import firebase from '@react-native-firebase/app';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

class FirebaseService {
  private static instance: FirebaseService;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Enable Firestore offline persistence
      await firestore().settings({
        cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
        persistence: true
      });

      this.initialized = true;
      console.log('Firebase initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase:', error);
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
  async createScript(data: any): Promise<string> {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('User not authenticated');

      const docRef = await firestore()
        .collection('scripts')
        .add({
          ...data,
          userId: user.uid,
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp()
        });

      return docRef.id;
    } catch (error: any) {
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