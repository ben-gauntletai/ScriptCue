import * as admin from "firebase-admin";
import * as pdfParse from "pdf-parse";
import { CloudEvent } from "firebase-functions/v2";
import { OpenAI } from 'openai';
import { defineSecret } from 'firebase-functions/params';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

interface ScriptAnalysis {
  characters: Array<{
    name: string;
    lines: number;
    firstAppearance: number;
    dialogue: Array<{
      text: string;
      lineNumber: number;
    }>;
  }>;
  scenes: Scene[];
  metadata: {
    totalLines: number;
    estimatedDuration: number;
    genre?: string;
    tone?: string;
  };
}

type Scene = {
  name: string;
  startLine: number;
  endLine: number;
  location?: string;
  timeOfDay?: string;
};

type StorageObjectMetadata = CloudEvent<{
  bucket: string;
  name: string;
  metadata?: {
    uploadedBy?: string;
    originalName?: string;
    scriptId?: string;
  };
}>;

interface ValidationState {
  isValidated: boolean;
  results: Record<string, boolean> | null;
  timestamp: Date;
}

interface ProcessingState {
  status: 'initializing' | 'processing' | 'validating' | 'completed' | 'error';
  progress: number;
  error?: string;
  characterCount?: number;
  validatedCharacters?: number;
  timestamp: admin.firestore.FieldValue;
  scriptId: string;
  batchesProcessed?: number;
  totalBatches?: number;
}

interface CharacterBatch {
  batchId: string;
  characters: Array<{
    name: string;
    lines: number;
    firstAppearance: number;
    dialogue: Array<{ text: string; lineNumber: number }>;
  }>;
  processed: boolean;
  chunkIndex: number;
  totalChunks: number;
}

const validationStates = new Map<string, ValidationState>();

async function updateProcessingState(
  scriptId: string,
  update: Partial<Omit<ProcessingState, 'status' | 'timestamp' | 'scriptId' | 'progress'>> & { 
    status: ProcessingState['status'];
    progress: number;
  }
): Promise<void> {
  const stateRef = admin.firestore().collection("scriptProcessing").doc(scriptId);
  const scriptRef = admin.firestore().collection("scripts").doc(scriptId);
  
  await admin.firestore().runTransaction(async (transaction) => {
    const stateDoc = await transaction.get(stateRef);
    const currentState = stateDoc.data() as ProcessingState | undefined;
    
    const newState: ProcessingState = {
      ...currentState,
      ...update,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      scriptId,
      status: update.status,
      progress: update.progress,
    };

    transaction.set(stateRef, newState);
    
    // Update script status if needed
    transaction.update(scriptRef, {
      uploadStatus: update.status === 'completed' ? 'completed' : 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(update.error ? { error: update.error } : {}),
    });
  });
}

const validatePDF = async (buffer: Buffer): Promise<void> => {
  let debugInfo = {
    bufferSize: buffer.length,
    parseSuccess: false,
    textExtracted: false,
    textLength: 0,
    lineCount: 0,
    nonEmptyLineCount: 0,
    contentAnalysis: null as Record<string, unknown> | null,
    error: null as string | null,
  };

  try {
    console.log("Starting PDF validation with buffer size:", buffer.length, "bytes");
    let data;
    try {
      data = await pdfParse(buffer);
      debugInfo.parseSuccess = true;
      
      const parseInfo = {
        version: data.version,
        numpages: data.numpages,
        info: data.info,
        metadata: data.metadata,
        textLength: data.text?.length || 0,
        firstFewChars: data.text?.substring(0, 100).replace(/\n/g, "\\n"),
      };
      
      console.log("PDF parse results:", parseInfo);
      debugInfo = { ...debugInfo, ...parseInfo };
      
    } catch (parseError) {
      debugInfo.error = parseError instanceof Error ? parseError.message : String(parseError);
      console.error("PDF parsing failed:", {
        error: debugInfo.error,
        bufferSize: buffer.length,
      });
      throw new Error(`PDF parsing failed: ${debugInfo.error}`);
    }

    if (!data.text) {
      debugInfo.error = "No text content found in PDF";
      console.error(debugInfo.error, {
        info: data.info,
        metadata: data.metadata,
      });
      throw new Error(debugInfo.error);
    }

    debugInfo.textExtracted = true;
    debugInfo.textLength = data.text.length;
    
    console.log("Text extraction results:", {
      length: data.text.length,
      sample: data.text.substring(0, 500).replace(/\n/g, "\\n"),
    });

    const lines = data.text.split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    
    debugInfo.lineCount = lines.length;
    debugInfo.nonEmptyLineCount = nonEmptyLines.length;

    let hasCharacterDialogue = false;
    let characterCount = 0;
    let dialogueCount = 0;
    const characters: string[] = [];
    let currentCharacter: string | null = null;
    
    // Process each line - look for characters and their dialogue
    for (const line of nonEmptyLines) {
      const trimmedLine = line.trim();
      const upperLine = trimmedLine.toUpperCase();
      
      // Character detection
      const characterMatch = (
        upperLine === trimmedLine && 
        trimmedLine.length > 0 &&
        trimmedLine.length < 50 &&
        !/^[0-9\s]*$/.test(trimmedLine) &&
        !upperLine.includes("FADE") &&
        !upperLine.includes("CUT")
      );

      if (characterMatch) {
        currentCharacter = trimmedLine;
        hasCharacterDialogue = true;
        characterCount++;
        if (characters.length < 10) {
          characters.push(trimmedLine);
        }
      } else if (currentCharacter && trimmedLine.length > 0) {
        dialogueCount++;
        currentCharacter = null;
      }
    }

    const contentAnalysis = {
      nonEmptyLines: nonEmptyLines.length,
      characterCount,
      dialogueCount,
      hasCharacterDialogue,
      characterSamples: characters,
    };

    debugInfo.contentAnalysis = contentAnalysis;
    console.log("Content analysis:", contentAnalysis);

    if (!hasCharacterDialogue || dialogueCount === 0) {
      debugInfo.error = "No character dialogue detected";
      console.error("Validation failed:", {
        error: debugInfo.error,
        analysis: contentAnalysis,
      });
      throw new Error(`Invalid script format: ${JSON.stringify(debugInfo, null, 2)}`);
    }

    return;
  } catch (error) {
    console.error("PDF Validation failed. Complete debug info:", {
      ...debugInfo,
      finalError: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

const chunkText = (text: string, maxChunkSize = 5000): string[] => {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxChunkSize;
    
    // If we're not at the end, find the last newline before maxChunkSize
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      if (lastNewline > start) {
        end = lastNewline;
      }
    }
    
    chunks.push(text.slice(start, end));
    start = end + 1;
  }
  
  return chunks;
};

const mergeCharacters = (
  existing: ScriptAnalysis["characters"],
  newChars: ScriptAnalysis["characters"],
): ScriptAnalysis["characters"] => {
  const charMap = new Map();
  
  // Add existing characters
  existing.forEach((char) => {
    charMap.set(char.name.toLowerCase(), char);
  });
  
  // Merge new characters
  newChars.forEach((char) => {
    const key = char.name.toLowerCase();
    if (charMap.has(key)) {
      const existing = charMap.get(key);
      // Merge dialogue arrays and remove duplicates based on lineNumber
      const mergedDialogue = [...existing.dialogue, ...char.dialogue]
        .sort((a, b) => a.lineNumber - b.lineNumber)
        // Remove duplicates based on lineNumber
        .filter((line, index, array) => 
          index === 0 || line.lineNumber !== array[index - 1].lineNumber
        );
      
      charMap.set(key, {
        ...existing,
        // Count lines based on unique dialogue entries
        lines: mergedDialogue.length,
        firstAppearance: Math.min(existing.firstAppearance, char.firstAppearance),
        dialogue: mergedDialogue,
      });
    } else {
      charMap.set(key, char);
    }
  });
  
  return Array.from(charMap.values());
};

const mergeScenes = (
  existing: Scene[],
  newScenes: Scene[],
): Scene[] => {
  return [...existing, ...newScenes].sort((a, b) => a.startLine - b.startLine);
};

const analyzeChunk = (text: string, startLine: number): ScriptAnalysis => {
  const lines = text.split("\n");
  const characters: { 
    [key: string]: { 
      lines: number; 
      firstAppearance: number;
      dialogue: Array<{
        text: string;
        lineNumber: number;
      }>;
    } 
  } = {};
  const scenes: Scene[] = [];
  let currentScene = null as Scene | null;
  let totalDialogueLines = 0;
  let currentCharacter: string | null = null;

  lines.forEach((line, index) => {
    const absoluteLineNumber = startLine + index;
    const trimmedLine = line.trim();
    const upperLine = trimmedLine.toUpperCase();

    // Character detection - this is our primary focus
    if (upperLine === trimmedLine && trimmedLine.length > 0 && 
        !upperLine.startsWith("INT.") && !upperLine.startsWith("EXT.") &&
        !upperLine.includes("CUT TO:") && !upperLine.includes("FADE")) {
      const characterName = trimmedLine;
      currentCharacter = characterName;
      
      if (!characters[characterName]) {
        characters[characterName] = {
          lines: 0,
          firstAppearance: absoluteLineNumber,
          dialogue: [],
        };
      }
    } 
    // Dialogue detection - capture the line after a character name
    else if (currentCharacter && trimmedLine.length > 0 && 
             !upperLine.startsWith("INT.") && !upperLine.startsWith("EXT.")) {
      if (!characters[currentCharacter].dialogue) {
        characters[currentCharacter].dialogue = [];
      }
      characters[currentCharacter].dialogue.push({
        text: trimmedLine,
        lineNumber: absoluteLineNumber,
      });
      characters[currentCharacter].lines++;
      totalDialogueLines++;
      currentCharacter = null; // Reset current character after capturing dialogue
    }

    // Scene detection (optional) - only create scenes with required fields
    const isSceneHeading = (upperLine.startsWith("INT.") || upperLine.startsWith("EXT.")) && 
        (upperLine.includes("DAY") || 
         upperLine.includes("NIGHT") || 
         upperLine.includes("EVENING") || 
         upperLine.includes("MORNING"));

    if (isSceneHeading) {
      currentCharacter = null; // Reset current character at scene breaks
      // If we have a current scene, close it
      if (currentScene) {
        const scene: Scene = {
          name: currentScene.name,
          startLine: currentScene.startLine,
          endLine: absoluteLineNumber - 1,
        };
        
        // Only add optional fields if they have values
        if (currentScene.location) scene.location = currentScene.location;
        if (currentScene.timeOfDay) scene.timeOfDay = currentScene.timeOfDay;
        
        scenes.push(scene);
      }

      // Extract location and time of day if present
      let location = undefined;
      let timeOfDay = undefined;
      
      if (trimmedLine.includes("-")) {
        location = trimmedLine.split("-")[0].trim();
        const timeMatch = trimmedLine.match(/(DAY|NIGHT|EVENING|MORNING)/i);
        if (timeMatch) timeOfDay = timeMatch[0];
      }

      // Create new scene with only required fields
      currentScene = {
        name: trimmedLine,
        startLine: absoluteLineNumber,
        endLine: absoluteLineNumber,
      } as Scene;

      // Add optional fields only if they have values
      if (location) currentScene.location = location;
      if (timeOfDay) currentScene.timeOfDay = timeOfDay;
    }
  });

  // Close the last scene if there is one
  if (currentScene) {
    const finalScene: Scene = {
      name: currentScene.name,
      startLine: currentScene.startLine,
      endLine: startLine + lines.length - 1,
    };
    
    // Add optional fields only if they have values
    if (currentScene.location) finalScene.location = currentScene.location;
    if (currentScene.timeOfDay) finalScene.timeOfDay = currentScene.timeOfDay;
    
    scenes.push(finalScene);
  }

  // Convert characters object to array format, now including dialogue
  const characterArray = Object.entries(characters).map(([name, data]) => ({
    name,
    lines: data.lines,
    firstAppearance: data.firstAppearance,
    dialogue: data.dialogue,
  }));

  return {
    characters: characterArray,
    scenes: scenes.length > 0 ? scenes : [],
    metadata: {
      totalLines: totalDialogueLines,
      estimatedDuration: Math.ceil(totalDialogueLines / 60),
    },
  };
};

async function saveValidatedResults(
  scriptId: string,
  uploadedBy: string | undefined,
  fileName: string,
  text: string,
  analysis: ScriptAnalysis,
  validatedCharacters: Array<any>,
  originalCharacterCount: number
): Promise<void> {
  // Use transaction for atomic saves
  await admin.firestore().runTransaction(async (transaction) => {
    const analysisRef = admin.firestore().collection("scriptAnalysis").doc(scriptId);
    const scriptRef = admin.firestore().collection("scripts").doc(scriptId);
    const statusRef = admin.firestore().collection("scriptProcessing").doc(scriptId);

    // Perform all updates in single transaction
    transaction.set(analysisRef, {
      scriptId,
      uploadedBy: uploadedBy || "unknown",
      originalName: fileName,
      content: text,
      analysis: analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.update(scriptRef, {
      analysis: analysis,
      uploadStatus: "completed",
      status: "ready",
      userId: uploadedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(statusRef, {
      status: "completed",
      progress: 100,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log(`[${scriptId}] Processing completed successfully with ${validatedCharacters.length} valid characters out of ${originalCharacterCount} detected characters`);
}

async function getValidationState(scriptId: string): Promise<ValidationState | null> {
  const doc = await admin.firestore()
    .collection('scriptValidation')
    .doc(scriptId)
    .get();
  
  if (!doc.exists) return null;
  return doc.data() as ValidationState;
}

async function clearValidationState(scriptId: string): Promise<void> {
  await admin.firestore()
    .collection('scriptValidation')
    .doc(scriptId)
    .delete();
}

async function saveBatch(
  scriptId: string,
  batch: CharacterBatch
): Promise<void> {
  const batchRef = admin.firestore()
    .collection("scriptProcessing")
    .doc(scriptId)
    .collection("batches")
    .doc(batch.batchId);

  await batchRef.set({
    ...batch,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function processBatches(
  scriptId: string,
  openai: OpenAI
): Promise<Record<string, boolean>> {
  const batchesRef = admin.firestore()
    .collection("scriptProcessing")
    .doc(scriptId)
    .collection("batches");
  
  console.log(`[${scriptId}] Fetching unprocessed batches...`);
  const batches = await batchesRef.where("processed", "==", false).get();
  
  if (batches.empty) {
    console.log(`[${scriptId}] No unprocessed batches found`);
    return {};
  }

  console.log(`[${scriptId}] Found ${batches.docs.length} unprocessed batches`);

  const allCharacters = new Map<string, {
    name: string;
    firstLine: string;
    totalLines: number;
    firstAppearance: number;
  }>();

  // Collect all unique characters
  batches.docs.forEach(doc => {
    const batch = doc.data() as CharacterBatch;
    console.log(`[${scriptId}] Processing batch ${batch.batchId} (${batch.chunkIndex + 1}/${batch.totalChunks}):`, {
      characters: batch.characters.length,
      processed: batch.processed,
    });

    batch.characters.forEach(char => {
      if (!allCharacters.has(char.name)) {
        allCharacters.set(char.name, {
          name: char.name,
          firstLine: char.dialogue[0]?.text || '',
          totalLines: char.lines,
          firstAppearance: char.firstAppearance,
        });
      }
    });
  });

  // Validate all characters at once
  const characterList = Array.from(allCharacters.values());
  
  console.log(`[${scriptId}] Collected unique characters:`, characterList.map(char => ({
    name: char.name,
    totalLines: char.totalLines,
    firstAppearance: char.firstAppearance,
    firstLine: char.firstLine.substring(0, 50) + (char.firstLine.length > 50 ? '...' : ''),
  })));
  
  console.log(`[${scriptId}] Making OpenAI API call for ${characterList.length} characters`);
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a script analysis expert. Your task is to determine if given names from a script represent actual characters (people) or not. For each name, consider the context from their first line of dialogue if provided. Respond with a JSON object where keys are character names and values are boolean (true if it's a character, false if it's not a character like stage directions, scene headings, etc.). IMPORTANT: Respond with ONLY the JSON object, no markdown formatting or additional text."
      },
      {
        role: "user",
        content: JSON.stringify(characterList, null, 2)
      }
    ],
    temperature: 0,
    max_tokens: 1000
  });

  if (!response.choices[0]?.message?.content) {
    throw new Error('Empty response from OpenAI');
  }

  console.log(`[${scriptId}] Raw OpenAI response:`, response.choices[0].message.content);

  let validationResults: Record<string, boolean>;
  try {
    // Clean the response to ensure it's valid JSON
    const cleanedResponse = response.choices[0].message.content
      .replace(/^```json\s*/, '') // Remove leading ```json
      .replace(/\s*```$/, '')     // Remove trailing ```
      .trim();                    // Remove any extra whitespace

    validationResults = JSON.parse(cleanedResponse);
    
    console.log(`[${scriptId}] Parsed validation results:`, validationResults);
    
    // Verify the response format
    const isValidFormat = Object.entries(validationResults).every(
      ([key, value]) => typeof key === 'string' && typeof value === 'boolean'
    );
    
    if (!isValidFormat) {
      throw new Error('Invalid validation results format');
    }
  } catch (parseError) {
    console.error(`[${scriptId}] Failed to parse OpenAI response:`, {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      rawResponse: response.choices[0].message.content,
    });
    throw new Error(`Failed to parse character validation results: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  // Mark all batches as processed
  console.log(`[${scriptId}] Marking ${batches.docs.length} batches as processed`);
  await Promise.all(
    batches.docs.map(doc => doc.ref.update({ processed: true }))
  );

  return validationResults;
}

/**
 * Processes an uploaded script file from Cloud Storage.
 * Analyzes the content and stores the results in Firestore.
 * @param event The storage event containing file metadata.
 */
export async function processUploadedScript(event: StorageObjectMetadata): Promise<void> {
  const { data } = event;
  const scriptId = data.metadata?.scriptId;
  const uploadedBy = data.metadata?.uploadedBy;

  if (!scriptId) {
    console.error("No scriptId provided in metadata");
    return;
  }

  try {
    await updateProcessingState(scriptId, {
      status: 'initializing',
      progress: 0,
    });

    console.log("Starting script processing:", {
      scriptId,
      uploadedBy,
      fileName: data.name,
      bucket: data.bucket,
    });

    const bucket = admin.storage().bucket(data.bucket);
    const file = bucket.file(data.name);
    
    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 10,
    });
    console.log(`[${scriptId}] Downloading PDF file: ${data.name}`);
    const [fileContent] = await file.download();
    console.log(`[${scriptId}] PDF downloaded successfully, size: ${fileContent.length} bytes`);

    await updateProcessingState(scriptId, {
      status: 'validating',
      progress: 20,
    });
    console.log(`[${scriptId}] Starting PDF validation...`);
    
    try {
      await validatePDF(fileContent);
      console.log(`[${scriptId}] PDF validation successful`);
    } catch (validationError) {
      console.error(`[${scriptId}] PDF validation failed with details:`, {
        error: validationError instanceof Error ? validationError.message : String(validationError),
        stack: validationError instanceof Error ? validationError.stack : undefined,
      });
      throw validationError;
    }

    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 30,
    });
    console.log(`[${scriptId}] Starting text extraction`);
    const pdfData = await pdfParse(fileContent);
    const text = pdfData.text;
    console.log(`[${scriptId}] Text extracted successfully, length: ${text.length} characters`);

    const chunks = chunkText(text);
    const totalChunks = chunks.length;
    const totalLines = text.split("\n").length;
    
    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 30,
      totalBatches: totalChunks,
      batchesProcessed: 0,
    });

    const analysis: ScriptAnalysis = {
      characters: [],
      scenes: [],
      metadata: {
        totalLines: 0,
        estimatedDuration: 0,
      },
    };

    // Process chunks and save batches
    for (let i = 0; i < chunks.length; i++) {
      const chunkAnalysis = analyzeChunk(chunks[i], i * Math.ceil(totalLines / chunks.length));
      
      const batch: CharacterBatch = {
        batchId: `batch_${i}`,
        characters: chunkAnalysis.characters,
        processed: false,
        chunkIndex: i,
        totalChunks,
      };

      await saveBatch(scriptId, batch);
      
      // Merge chunk analysis into combined analysis
      analysis.characters = mergeCharacters(analysis.characters, chunkAnalysis.characters);
      analysis.scenes = mergeScenes(analysis.scenes, chunkAnalysis.scenes);
      analysis.metadata.totalLines += chunkAnalysis.metadata.totalLines;
      analysis.metadata.estimatedDuration += chunkAnalysis.metadata.estimatedDuration;
      
      await updateProcessingState(scriptId, {
        status: 'processing',
        progress: 30 + Math.floor((i / chunks.length) * 40),
        batchesProcessed: i + 1,
      });
    }

    // Initialize OpenAI client
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    await updateProcessingState(scriptId, {
      status: 'validating',
      progress: 70,
    });

    // Process all batches
    const validationResults = await processBatches(scriptId, openai);

    // After character analysis, perform validation
    if (!analysis.characters || analysis.characters.length === 0) {
      throw new Error('No characters detected for validation');
    }

    console.log(`[${scriptId}] Starting character validation for ${analysis.characters.length} characters`);
    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 85,
    });

    // Filter characters based on validation results
    console.log(`[${scriptId}] Filtering characters based on validation results`);
    const validatedCharacters = analysis.characters.filter((char) => {
      const isValid = validationResults?.[char.name];
      if (!isValid) {
        console.log(`[${scriptId}] Removed invalid character: ${char.name}`);
        analysis.metadata.totalLines -= char.lines;
      }
      return isValid;
    });

    // Update the characters array with only valid characters
    analysis.characters = validatedCharacters;
    console.log(`[${scriptId}] Updated analysis with ${validatedCharacters.length} valid characters`);

    // Recalculate duration
    analysis.metadata.estimatedDuration = Math.ceil(analysis.metadata.totalLines / 60);

    // Save the results
    console.log(`[${scriptId}] Saving validated results`);
    await saveValidatedResults(
      scriptId,
      uploadedBy,
      data.metadata?.originalName || data.name,
      text,
      analysis,
      validatedCharacters,
      analysis.characters.length
    );

  } catch (error) {
    console.error(`[${scriptId}] Processing Error:`, {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      phase: 'script processing'
    });
    
    await updateProcessingState(scriptId, {
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}
