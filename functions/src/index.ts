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
    secrets: [OPENAI_API_KEY]
  },
  processUploadedScript
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
