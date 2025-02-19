import firebase from '@react-native-firebase/app';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { Platform } from 'react-native';
import { NewScriptData, Script, ScriptProcessingStatus, ProcessingStatus } from '../types/script';
import functions from '@react-native-firebase/functions';
import RNFS from 'react-native-fs';

interface CharacterVoiceSettings {
  voice: string;
  testText: string;
}

class FirebaseService {
  private static instance: FirebaseService | null = null;
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

  public static getInstance(): FirebaseService {
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

      // Firebase should already be initialized by the native configuration
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

      // Initialize Firestore settings
      const db = firestore();
      db.settings({
        cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
        persistence: true
      });

      console.log('Firestore instance:', {
        app: db.app.name,
        projectId: db.app.options.projectId
      });

      // Basic connection test with timeout
      try {
        console.log('Testing Firestore connection...');
        
        const timeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection test timed out')), 15000);
        });

        const connectionTest = (async () => {
          try {
            await firestore().collection('scripts').limit(1).get();
            console.log('Firestore connection test successful');
            return true;
          } catch (error: any) {
            console.error('Error in Firestore access:', error);
            throw error;
          }
        })();

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
        updatedAt: now,
        uploadStatus: scriptData.uploadStatus || null,
        fileUrl: scriptData.fileUrl || null,
        originalFileName: scriptData.originalFileName || null
      };

      console.log('Prepared document data:', JSON.stringify(firestoreData, null, 2));

      try {
        console.log('Attempting to write to Firestore...');
        // Use set with merge option to handle both creation and updates
        const docRef = firestore()
          .collection('scripts')
          .doc(scriptData.id || firestore().collection('scripts').doc().id);

        await docRef.set(firestoreData, { merge: true });

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

  async uploadScript(
    filePath: string,
    fileName: string,
    userId: string,
    scriptId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    console.log('Starting uploadScript with:', { fileName, userId, scriptId });
    let uploadTask: any = null;
    let progressUnsubscribe: (() => void) | null = null;

    try {
      if (!this.initialized) {
        console.log('Firebase service not initialized, initializing...');
        await this.initialize();
      }

      const user = auth().currentUser;
      console.log('Current user:', user?.uid);
      if (!user || user.uid !== userId) {
        throw new Error('User not authenticated or ID mismatch');
      }

      // Create the initial document data
      const initialData = {
        id: scriptId,
        title: fileName.replace('.pdf', ''),
        userId: user.uid,
        status: 'draft',
        uploadStatus: 'uploading',
        createdAt: firestore.Timestamp.now(),
        updatedAt: firestore.Timestamp.now()
      };
      console.log('Creating initial script document:', initialData);

      // Create the script document first
      const scriptDocRef = firestore().collection('scripts').doc(scriptId);
      await scriptDocRef.set(initialData);
      console.log('Initial script document created');

      // Construct the storage path
      const storagePath = `scripts/${userId}/upload/${fileName}`;
      console.log('Storage path:', storagePath);
      const reference = storage().ref(storagePath);

      // Set the metadata
      const metadata = {
        contentType: 'application/pdf',
        customMetadata: {
          uploadedBy: userId,
          originalName: fileName,
          scriptId: scriptId
        }
      };
      console.log('Setting up upload with metadata:', metadata);

      try {
        // Check if file exists and is readable
        const stats = await RNFS.stat(filePath);
        if (!stats.size) {
          throw new Error('File is empty');
        }

        // Upload the file
        console.log('Starting file upload...');
        uploadTask = reference.putFile(filePath, metadata);

        // Monitor upload progress
        if (onProgress) {
          progressUnsubscribe = uploadTask.on('state_changed', 
            (snapshot: { bytesTransferred: number; totalBytes: number }) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              console.log('Upload progress:', progress.toFixed(2) + '%');
              onProgress(progress);
            },
            (error: Error) => {
              console.error('Upload state error:', error);
              throw error;
            }
          );
        }

        // Wait for the upload to complete
        console.log('Waiting for upload task to complete...');
        await uploadTask;
        console.log('Upload task completed successfully');

        // Get the download URL
        console.log('Getting download URL...');
        const url = await reference.getDownloadURL();
        console.log('Download URL obtained:', url);

        // Update the script document with the file URL
        console.log('Updating script document with URL...');
        await scriptDocRef.update({
          fileUrl: url,
          originalFileName: fileName,
          uploadStatus: 'processing',
          updatedAt: firestore.Timestamp.now()
        });
        console.log('Script document updated with file URL');

        // Initialize the processing status
        console.log('Initializing processing status...');
        await firestore()
          .collection('scriptProcessing')
          .doc(scriptId)
          .set({
            status: 'starting',
            progress: 0,
            updatedAt: firestore.Timestamp.now()
          }, { merge: true });
        console.log('Processing status initialized');

        return url;
      } catch (uploadError) {
        console.error('Upload error occurred:', uploadError);
        // If upload fails, update the script document
        await scriptDocRef.update({
          uploadStatus: 'error',
          error: uploadError instanceof Error ? uploadError.message : 'Upload failed',
          updatedAt: firestore.Timestamp.now()
        });
        throw uploadError;
      }
    } catch (error: any) {
      console.error('Error in uploadScript:', error);

      // If we created the script document but upload failed, update its status
      try {
        await firestore()
          .collection('scripts')
          .doc(scriptId)
          .update({
            uploadStatus: 'error',
            updatedAt: firestore.Timestamp.now(),
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          });
      } catch (updateError) {
        console.error('Error updating script status:', updateError);
      }

      throw this.handleStorageError(error);
    } finally {
      // Clean up the progress listener if it exists
      if (progressUnsubscribe) {
        try {
          progressUnsubscribe();
        } catch (cleanupError) {
          console.error('Error cleaning up progress listener:', cleanupError);
        }
      }
      
      // Clean up the upload task if it exists
      if (uploadTask && typeof uploadTask.cancel === 'function') {
        try {
          uploadTask.cancel();
        } catch (cleanupError) {
          console.error('Error cleaning up upload task:', cleanupError);
        }
      }
    }
  }

  listenToScriptProcessingStatus(
    scriptId: string,
    onUpdate: (status: { status: string; progress?: number; error?: string }) => void,
    onError: (error: Error) => void
  ): () => void {
    return firestore()
      .collection('scriptProcessing')
      .doc(scriptId)
      .onSnapshot(
        snapshot => {
          const data = snapshot.data();
          if (data) {
            onUpdate({
              status: data.status,
              progress: data.progress,
              error: data.error
            });
          }
        },
        error => onError(error)
      );
  }

  private handleStorageError(error: any): Error {
    console.error('Storage error:', error);
    
    if (error.code === 'storage/unauthorized') {
      return new Error('You are not authorized to access this resource');
    }
    
    if (error.code === 'storage/canceled') {
      return new Error('Upload was cancelled');
    }
    
    if (error.code === 'storage/unknown') {
      return new Error('An unknown error occurred during upload');
    }
    
    return error;
  }

  async getScripts(): Promise<Script[]> {
    const userId = auth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const snapshot = await firestore()
      .collection('scripts')
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Script));
  }

  async getProcessingStatus(scriptId: string): Promise<ProcessingStatus | null> {
    const doc = await firestore()
      .collection('scriptProcessing')
      .doc(scriptId)
      .get();

    if (!doc.exists) return null;

    const data = doc.data();
    return {
      status: data?.status || 'unknown',
      progress: data?.progress,
      error: data?.error,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
    };
  }

  subscribeToProcessingStatus(
    scriptId: string,
    callback: (status: ProcessingStatus) => void
  ): () => void {
    return firestore()
      .collection('scriptProcessing')
      .doc(scriptId)
      .onSnapshot(
        (doc) => {
          if (!doc.exists) return;
          const data = doc.data();
          callback({
            status: data?.status || 'unknown',
            progress: data?.progress,
            error: data?.error,
            updatedAt: data?.updatedAt?.toDate() || new Date(),
          });
        },
        (error) => {
          console.error('Error in processing status subscription:', error);
        }
      );
  }

  async getScriptAnalysis(scriptId: string): Promise<{ content: string; analysis: any } | null> {
    try {
      const doc = await firestore()
        .collection('scriptAnalysis')
        .doc(scriptId)
        .get();

      if (!doc.exists) {
        console.log('No analysis found for script:', scriptId);
        return null;
      }

      const data = doc.data();
      return {
        content: data?.content || '',
        analysis: data?.analysis || null
      };
    } catch (error) {
      console.error('Error fetching script analysis:', error);
      throw this.handleFirestoreError(error);
    }
  }

  async getScript(scriptId: string): Promise<Script | null> {
    try {
      const doc = await firestore()
        .collection('scripts')
        .doc(scriptId)
        .get();

      if (doc.exists) {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data?.createdAt?.toDate() || null,
          updatedAt: data?.updatedAt?.toDate() || null,
        } as Script;
      }
      return null;
    } catch (error) {
      console.error('Error getting script:', error);
      throw error;
    }
  }

  async testVoice(voice: string, text: string): Promise<string> {
    try {
      console.log('Testing voice with params:', {
        voice,
        textLength: text.length,
        textPreview: text.substring(0, 50) + (text.length > 50 ? '...' : '')
      });

      const generateVoice = functions().httpsCallable('generateVoiceTest');
      console.log('Calling generateVoiceTest function...');
      
      const result = await generateVoice({ voice, text });
      console.log('Voice test generation successful');
      
      if (!result.data?.url) {
        throw new Error('No URL returned from voice test generation');
      }
      
      return result.data.url;
    } catch (error) {
      console.error('Error testing voice:', {
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : error,
        params: {
          voice,
          textLength: text.length
        }
      });

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('Authentication failed')) {
          throw new Error('Voice service authentication failed. Please try again later.');
        }
        if (error.message.includes('busy')) {
          throw new Error('Voice service is currently busy. Please try again in a few moments.');
        }
        // Pass through specific error messages from the cloud function
        if (error.message.includes('Invalid voice option') || 
            error.message.includes('Missing required parameters')) {
          throw error;
        }
      }

      throw new Error('Failed to test voice. Please try again later.');
    }
  }

  async getCharacterVoices(scriptId: string): Promise<Record<string, CharacterVoiceSettings> | null> {
    try {
      const doc = await firestore()
        .collection('scripts')
        .doc(scriptId)
        .collection('settings')
        .doc('voices')
        .get();

      if (!doc.exists) {
        return null;
      }

      return doc.data() as Record<string, CharacterVoiceSettings>;
    } catch (error) {
      console.error('Error getting character voices:', error);
      throw this.handleFirestoreError(error);
    }
  }

  async saveCharacterVoices(
    scriptId: string, 
    voices: Record<string, CharacterVoiceSettings>
  ): Promise<void> {
    try {
      await firestore()
        .collection('scripts')
        .doc(scriptId)
        .collection('settings')
        .doc('voices')
        .set(voices, { merge: true });
    } catch (error) {
      console.error('Error saving character voices:', error);
      throw this.handleFirestoreError(error);
    }
  }

  async uploadPracticeVideo(
    scriptId: string,
    characterId: string,
    videoPath: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('User not authenticated');

      // Create a reference to the video file in Firebase Storage
      const timestamp = new Date().getTime();
      const videoFileName = `practice_${scriptId}_${characterId}_${timestamp}.mp4`;
      const storageRef = storage().ref(`practice-videos/${user.uid}/${scriptId}/${videoFileName}`);

      // Upload the video file with progress tracking
      const task = storageRef.putFile(videoPath);
      
      if (onProgress) {
        task.on('state_changed', (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        });
      }

      // Wait for the upload to complete
      await task;

      // Get the download URL
      const downloadUrl = await storageRef.getDownloadURL();

      // Update the script document with the video reference
      await firestore()
        .collection('scripts')
        .doc(scriptId)
        .collection('practiceVideos')
        .add({
          userId: user.uid,
          characterId,
          videoUrl: downloadUrl,
          createdAt: firestore.FieldValue.serverTimestamp(),
          fileName: videoFileName
        });

      return downloadUrl;
    } catch (error: any) {
      console.error('Error uploading practice video:', error);
      throw this.handleStorageError(error);
    }
  }

  async generateVoiceLines(
    scriptId: string,
    practiceCharacter: string,
    characterVoices: Record<string, CharacterVoiceSettings>
  ): Promise<Record<string, string[]>> {
    try {
      console.log('Starting voice line generation for script:', scriptId);
      
      const generateVoiceLinesFn = functions().httpsCallable('generateVoiceLines');
      const result = await generateVoiceLinesFn({
        scriptId,
        practiceCharacter,
        characterVoices
      });

      if (!result.data?.audioFiles) {
        throw new Error('No audio files generated');
      }

      return result.data.audioFiles;
    } catch (error) {
      console.error('Error generating voice lines:', error);
      throw this.handleFirestoreError(error);
    }
  }

  async getVoiceLines(scriptId: string): Promise<Record<string, string[]> | null> {
    try {
      const doc = await firestore()
        .collection('scripts')
        .doc(scriptId)
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      if (!data?.analysis?.characters) {
        return null;
      }

      // Collect all voice URLs from the characters' dialogue
      const audioFiles: Record<string, string[]> = {};
      data.analysis.characters.forEach((character: { name: string; dialogue?: Array<{ voices?: Record<string, string>; lineNumber: number }> }) => {
        character.dialogue?.forEach(line => {
          if (line.voices) {
            const lineId = `${scriptId}_${character.name}_${line.lineNumber}`;
            audioFiles[lineId] = Object.values(line.voices);
          }
        });
      });

      return audioFiles;
    } catch (error) {
      console.error('Error getting voice lines:', error);
      throw this.handleFirestoreError(error);
    }
  }
}

export default FirebaseService.getInstance();