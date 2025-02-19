/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as admin from "firebase-admin";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { processUploadedScript } from "./scripts/processScript";
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { OpenAI } from 'openai';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { writeFileSync } from 'fs';
import { defineSecret } from 'firebase-functions/params';

// Add these interfaces at the top of the file after imports
export interface DialogueLine {
  lineNumber: number;
  text: string;
  voices?: Record<string, string>;
}

export interface Character {
  name: string;
  dialogue: DialogueLine[];
  lines?: number;
  firstAppearance?: number;
}

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Initialize Firebase Admin
admin.initializeApp();

// Define secrets
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// Export functions
export const processScript = onObjectFinalized(
  { 
    timeoutSeconds: 540,
    secrets: [OPENAI_API_KEY],
    eventFilters: {
      contentType: 'application/pdf',
      pathPattern: 'scripts/{userId}/upload/*.pdf'
    }
  },
  async (event) => {
    // Multiple validation checks to ensure we only process PDF uploads
    const fileName = event.data.name;
    const contentType = event.data.contentType;

    // Log detailed information about the triggered file
    console.log('File trigger details:', {
      path: fileName,
      contentType: contentType,
      size: event.data.size,
      metadata: event.data.metadata,
      metageneration: event.data.metageneration // Log metageneration to see if this is a metadata update
    });

    // Check paths first (fastest checks)
    if (fileName.includes('/voices/') || 
        fileName.includes('/analysis/') || 
        fileName.includes('/voice-tests/')) {
      console.log('Skipping - File is in excluded directory:', fileName);
      return;
    }

    // Then check if it's in the required directory
    if (!fileName.includes('/upload/')) {
      console.log('Skipping - File not in upload directory:', fileName);
      return;
    }

    // Then check file type (these might involve more processing)
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      console.log('Skipping - File is not a PDF:', fileName);
      return;
    }

    if (contentType !== 'application/pdf') {
      console.log('Skipping - Content type is not PDF:', contentType);
      return;
    }

    // Check if this is a metadata update rather than a new file
    if (event.data.metageneration > 1) {
      console.log('Skipping - This is a metadata update:', event.data.metageneration);
      return;
    }

    // If all checks pass, process the script
    console.log('All validation checks passed, processing script:', fileName);
    return processUploadedScript(event);
  }
);

export const generateVoiceTest = onCall({ 
  maxInstances: 10,
  secrets: [OPENAI_API_KEY]
}, async (request) => {
  console.log("Starting voice test generation with params:", {
    text: request.data.text?.substring(0, 50) + "...",
    voice: request.data.voice,
    auth: request.auth?.uid || 'unauthenticated'
  });

  const { text, voice } = request.data;
  
  if (!text || !voice) {
    const error = "Missing required parameters: " + (!text ? "text" : "voice");
    console.error("Voice test validation error:", error);
    throw new HttpsError('invalid-argument', error);
  }

  const validVoices = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];
  if (!validVoices.includes(voice)) {
    const error = `Invalid voice option: ${voice}. Valid options are: ${validVoices.join(', ')}`;
    console.error("Voice test validation error:", error);
    throw new HttpsError('invalid-argument', error);
  }

  try {
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    console.log("Creating speech with OpenAI...");
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: text,
    });
    console.log("OpenAI speech creation successful");

    // Create a temporary file
    const tempFilePath = path.join(os.tmpdir(), `voice-test-${Date.now()}.mp3`);
    console.log("Temporary file path:", tempFilePath);
    
    // Get the audio data as an ArrayBuffer
    console.log("Getting audio data...");
    const audioData = await response.arrayBuffer();
    console.log("Audio data received, size:", audioData.byteLength);
    
    // Write the audio data to the temporary file
    console.log("Writing audio data to temporary file...");
    writeFileSync(tempFilePath, Buffer.from(audioData));

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const fileName = `voice-tests/${Date.now()}-${voice}-test.mp3`;
    console.log("Uploading to Firebase Storage:", fileName);
    
    await bucket.upload(tempFilePath, {
      destination: fileName,
      metadata: {
        contentType: 'audio/mpeg',
      },
    });
    console.log("Upload successful");

    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    console.log("Temporary file deleted");

    // Get the public URL
    console.log("Getting download URL...");
    const file = bucket.file(fileName);
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // URL expires in 24 hours
    });
    console.log("Download URL generated successfully");

    return { url: downloadUrl };
  } catch (error) {
    console.error("Error in voice test generation:", {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      params: {
        textLength: text?.length,
        voice,
      }
    });

    // Check for specific OpenAI errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new HttpsError('unauthenticated', 'Authentication failed with voice service. Please try again later.');
      }
      if (error.message.includes('rate limit')) {
        throw new HttpsError('resource-exhausted', 'Voice service is currently busy. Please try again in a few moments.');
      }
    }

    throw new HttpsError('internal', 'Failed to generate voice test. Please try again later.');
  }
});

export const generateVoiceLines = onCall({ 
  maxInstances: 10,
  secrets: [OPENAI_API_KEY]
}, async (request) => {
  console.log("Starting bulk voice line generation with params:", {
    scriptId: request.data.scriptId,
    practiceCharacter: request.data.practiceCharacter,
    auth: request.auth?.uid || 'unauthenticated'
  });

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { scriptId, practiceCharacter, characterVoices } = request.data;
  
  if (!scriptId || !practiceCharacter || !characterVoices) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }

  // Track success and failure counts
  const stats = {
    totalLines: 0,
    successfulLines: 0,
    failedLines: 0,
    errors: [] as string[]
  };

  try {
    console.log('Initializing OpenAI with API key...');
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    const bucket = admin.storage().bucket();
    const db = admin.firestore();

    console.log(`Attempting to fetch script document with ID: ${scriptId}`);
    const scriptDoc = await db.collection('scripts').doc(scriptId).get();
    if (!scriptDoc.exists) {
      console.error(`Script document not found. ID: ${scriptId}`);
      throw new HttpsError('not-found', `Script document not found. ID: ${scriptId}`);
    }

    console.log('Script document found, checking for analysis data...');
    const scriptData = scriptDoc.data();
    if (!scriptData?.analysis?.characters) {
      console.error('Script data invalid. Structure:', JSON.stringify({
        hasScriptData: !!scriptData,
        hasAnalysis: !!scriptData?.analysis,
        hasCharacters: !!scriptData?.analysis?.characters
      }));
      throw new HttpsError('failed-precondition', 'Script is missing analysis or character data');
    }

    console.log(`Found ${scriptData.analysis.characters.length} characters in script`);
    const characters = [...scriptData.analysis.characters]; // Create a copy to preserve original array
    const characterUpdates = [];

    // Process each character except the practicing one
    for (const character of characters) {
      if (character.name === practiceCharacter) {
        console.log(`Skipping practice character: ${character.name}`);
        continue;
      }

      const characterVoice = characterVoices[character.name];
      if (!characterVoice?.voice) {
        console.log(`Skipping character with no voice settings: ${character.name}`);
        continue;
      }

      if (!Array.isArray(character.dialogue)) {
        const error = `No dialogue array found for character: ${character.name}`;
        console.log(error);
        stats.errors.push(error);
        continue;
      }

      console.log(`Processing voice lines for character: ${character.name}`, {
        voice: characterVoice.voice,
        numberOfLines: character.dialogue.length
      });

      stats.totalLines += character.dialogue.length;

      // Process each line of dialogue
      for (let dialogueIndex = 0; dialogueIndex < character.dialogue.length; dialogueIndex++) {
        const line = character.dialogue[dialogueIndex];
        if (!line || !line.text || typeof line.lineNumber !== 'number') {
          const error = `Invalid dialogue line for ${character.name} at index ${dialogueIndex}`;
          console.log(error);
          stats.errors.push(error);
          stats.failedLines++;
          continue;
        }

        const fileName = `scripts/${scriptId}/analysis/${character.name}/voices/${characterVoice.voice}/${scriptId}_${character.name}_${line.lineNumber}_${characterVoice.voice}.mp3`;
        
        try {
          // Check if file already exists
          const fileExists = await bucket.file(fileName).exists();
          if (fileExists[0]) {
            console.log(`Audio file already exists for line ${line.lineNumber}, skipping generation`);
            stats.successfulLines++;
            continue;
          }

          // Generate speech using OpenAI
          const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: characterVoice.voice,
            input: line.text,
          });

          // Get the audio data
          const audioData = await response.arrayBuffer();
          console.log(`Generated audio data for line ${line.lineNumber}, size: ${audioData.byteLength} bytes`);

          // Upload to Firebase Storage with retry logic
          const file = bucket.file(fileName);
          let uploadSuccess = false;
          let uploadAttempts = 0;
          const maxUploadAttempts = 3;

          while (!uploadSuccess && uploadAttempts < maxUploadAttempts) {
            try {
              await file.save(Buffer.from(audioData), {
                metadata: {
                  contentType: 'audio/mpeg',
                  metadata: {
                    scriptId,
                    characterName: character.name,
                    lineNumber: line.lineNumber,
                    voice: characterVoice.voice
                  }
                }
              });
              uploadSuccess = true;
            } catch (uploadError) {
              uploadAttempts++;
              if (uploadAttempts === maxUploadAttempts) {
                throw uploadError;
              }
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
            }
          }

          // Get the download URL
          const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '3000-01-01'
          });

          // Update the dialogue line with the voice URL
          character.dialogue[dialogueIndex] = {
            ...line,
            voices: {
              ...(line.voices || {}),
              [characterVoice.voice]: url
            }
          };

          stats.successfulLines++;
          console.log(`Added voice URL for line ${line.lineNumber}, voice ${characterVoice.voice}`);
        } catch (error) {
          stats.failedLines++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error generating audio for line ${line.lineNumber}:`, error);
          
          // Handle specific error types
          if (error instanceof Error) {
            if (error.message.includes('rate limit')) {
              // Wait and retry for rate limits
              await new Promise(resolve => setTimeout(resolve, 2000));
              dialogueIndex--; // Retry this line
              continue;
            }
            if (error.message.includes('API key')) {
              throw new HttpsError('unauthenticated', 'Authentication failed with voice service. Please try again later.');
            }
          }
          
          stats.errors.push(`Failed to generate audio for ${character.name}, line ${line.lineNumber}: ${errorMessage}`);
          continue;
        }
      }

      // Prepare the update for this character
      const characterIndex = characters.findIndex((c: { name: string }) => c.name === character.name);
      if (characterIndex !== -1) {
        characterUpdates.push({
          [`analysis.characters`]: characters
        });
      }
    }

    // Update the entire characters array in a single update
    if (stats.successfulLines > 0) {
      let updateSuccess = false;
      let updateAttempts = 0;
      const maxUpdateAttempts = 3;

      while (!updateSuccess && updateAttempts < maxUpdateAttempts) {
        try {
          await scriptDoc.ref.update({
            'analysis.characters': characters
          });
          updateSuccess = true;
          console.log('Successfully updated all character dialogue with voice URLs while preserving all characters');
        } catch (updateError) {
          updateAttempts++;
          console.error(`Update attempt ${updateAttempts} failed:`, updateError);
          if (updateAttempts === maxUpdateAttempts) {
            throw new HttpsError('data-loss', 'Failed to save voice line updates after multiple attempts');
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * updateAttempts));
        }
      }
    }

    if (stats.successfulLines === 0) {
      throw new HttpsError('failed-precondition', 'No voice lines were generated. Please check character settings and try again.');
    }

    console.log('Voice line generation completed with stats:', stats);

    // Collect all generated audio URLs
    const audioFiles: Record<string, string[]> = {};
    characters.forEach((character: { name: string; dialogue?: Array<{ voices?: Record<string, string>; lineNumber: number }> }) => {
      if (character.name === practiceCharacter) return;
      character.dialogue?.forEach(line => {
        if (line.voices) {
          const lineId = `${scriptId}_${character.name}_${line.lineNumber}`;
          audioFiles[lineId] = Object.values(line.voices);
        }
      });
    });

    return {
      success: true,
      stats: {
        totalLines: stats.totalLines,
        successfulLines: stats.successfulLines,
        failedLines: stats.failedLines,
        errors: stats.errors
      },
      audioFiles
    };

  } catch (error) {
    console.error("Error in voice line generation:", {
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error,
      scriptId,
      practiceCharacter,
      stats
    });

    // If it's already a HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new HttpsError('unauthenticated', 'Authentication failed with voice service. Please try again later.');
      }
      if (error.message.includes('rate limit')) {
        throw new HttpsError('resource-exhausted', 'Voice service is currently busy. Please try again in a few moments.');
      }
      if (error.message.includes('quota')) {
        throw new HttpsError('resource-exhausted', 'Voice generation quota exceeded. Please try again later.');
      }
      if (error.message.includes('network')) {
        throw new HttpsError('unavailable', 'Network error occurred. Please check your connection and try again.');
      }
    }

    throw new HttpsError(
      'internal', 
      `Failed to generate voice lines: ${error instanceof Error ? error.message : 'Unknown error'}. ${stats.successfulLines} lines were successfully generated.`
    );
  }
});
