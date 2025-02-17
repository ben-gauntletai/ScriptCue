import * as admin from "firebase-admin";
import * as pdfParse from "pdf-parse";
import { CloudEvent } from "firebase-functions/v2";

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

const updateProcessingStatus = async (
  scriptId: string,
  status: string,
  progress: number | null = null,
  error: string | null = null,
): Promise<void> => {
  const statusRef = admin.firestore().collection("scriptProcessing").doc(scriptId);
  const scriptRef = admin.firestore().collection("scripts").doc(scriptId);
  
  const updateData: {
    status: string;
    progress?: number;
    error?: string;
    updatedAt: admin.firestore.FieldValue;
  } = {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Only add progress and error if they are not null
  if (progress !== null) {
    updateData.progress = progress;
  }
  if (error !== null) {
    updateData.error = error;
  }

  // Update both the processing status and the script document
  await Promise.all([
    statusRef.set(updateData, { merge: true }),
    scriptRef.update({
      uploadStatus: status.toLowerCase() === "completed" ? "completed" : "processing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(error ? { error } : {}),
    }),
  ]);
};

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
      charMap.set(key, {
        ...existing,
        lines: existing.lines + char.lines,
        firstAppearance: Math.min(existing.firstAppearance, char.firstAppearance),
        dialogue: [...existing.dialogue, ...char.dialogue].sort((a, b) => a.lineNumber - b.lineNumber),
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
  let lineCount = 0;
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
      characters[characterName].lines++;
    } 
    // Dialogue detection - capture the line after a character name
    else if (currentCharacter && trimmedLine.length > 0 && 
             !upperLine.startsWith("INT.") && !upperLine.startsWith("EXT.")) {
      characters[currentCharacter].dialogue.push({
        text: trimmedLine,
        lineNumber: absoluteLineNumber,
      });
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

    lineCount++;
  });

  // Close the last scene if there is one
  if (currentScene) {
    const finalScene: Scene = {
      name: currentScene.name,
      startLine: currentScene.startLine,
      endLine: startLine + lineCount - 1,
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

  // Estimate duration (roughly 1 minute per page, assuming ~60 lines per page)
  const estimatedDuration = Math.ceil(lineCount / 60);

  return {
    characters: characterArray,
    scenes: scenes.length > 0 ? scenes : [],
    metadata: {
      totalLines: lineCount,
      estimatedDuration,
    },
  };
};

/**
 * Processes an uploaded script file from Cloud Storage.
 * Analyzes the content and stores the results in Firestore.
 * @param event The storage event containing file metadata.
 */
export async function processUploadedScript(event: StorageObjectMetadata): Promise<void> {
  const { data } = event;
  const scriptId = data.metadata?.scriptId;
  const uploadedBy = data.metadata?.uploadedBy;

  console.log("Starting script processing:", {
    scriptId,
    uploadedBy,
    fileName: data.name,
    bucket: data.bucket,
  });

  if (!scriptId) {
    console.error("No scriptId provided in metadata");
    return;
  }

  try {
    await updateProcessingStatus(scriptId, "Initializing", 0);
    console.log(`[${scriptId}] Processing status updated: Initializing`);
    
    const bucket = admin.storage().bucket(data.bucket);
    const file = bucket.file(data.name);
    
    await updateProcessingStatus(scriptId, "Downloading PDF", 10);
    console.log(`[${scriptId}] Downloading PDF file: ${data.name}`);
    const [fileContent] = await file.download();
    console.log(`[${scriptId}] PDF downloaded successfully, size: ${fileContent.length} bytes`);

    await updateProcessingStatus(scriptId, "Validating PDF", 20);
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

    await updateProcessingStatus(scriptId, "Extracting text", 30);
    console.log(`[${scriptId}] Starting text extraction`);
    const pdfData = await pdfParse(fileContent);
    const text = pdfData.text;
    console.log(`[${scriptId}] Text extracted successfully, length: ${text.length} characters`);

    await updateProcessingStatus(scriptId, "Analyzing script", 40);
    const chunks = chunkText(text);
    console.log(`[${scriptId}] Text chunked into ${chunks.length} parts for analysis`);
    
    const analysis: ScriptAnalysis = {
      characters: [],
      scenes: [],
      metadata: {
        totalLines: 0,
        estimatedDuration: 0,
      },
    };
    
    // Calculate total lines in the script
    const totalLines = text.split("\n").length;
    console.log(`[${scriptId}] Total lines in script: ${totalLines}`);
    
    const linesPerChunk = Math.ceil(totalLines / chunks.length);
    
    for (let i = 0; i < chunks.length; i++) {
      const startLine = i * linesPerChunk;
      const endLine = Math.min((i + 1) * linesPerChunk, totalLines);
      
      await updateProcessingStatus(
        scriptId,
        `Analyzing chunk ${i + 1} of ${chunks.length}`,
        40 + Math.floor((i / chunks.length) * 50),
      );

      console.log(`[${scriptId}] Processing chunk ${i + 1}/${chunks.length}, lines ${startLine}-${endLine}`);

      const chunkAnalysis = analyzeChunk(chunks[i], startLine);
      
      console.log(`[${scriptId}] Chunk ${i + 1} analysis:`, {
        characters: chunkAnalysis.characters.length,
        scenes: chunkAnalysis.scenes.length,
        lines: chunkAnalysis.metadata.totalLines,
      });
      
      // Merge chunk analysis into combined analysis
      analysis.characters = mergeCharacters(analysis.characters, chunkAnalysis.characters);
      analysis.scenes = mergeScenes(analysis.scenes, chunkAnalysis.scenes);
      analysis.metadata.totalLines += chunkAnalysis.metadata.totalLines;
      analysis.metadata.estimatedDuration += chunkAnalysis.metadata.estimatedDuration;
    }

    console.log(`[${scriptId}] Final analysis:`, {
      characters: analysis.characters.length,
      scenes: analysis.scenes.length,
      totalLines: analysis.metadata.totalLines,
      estimatedDuration: analysis.metadata.estimatedDuration,
    });

    await updateProcessingStatus(scriptId, "Saving results", 90);
    console.log(`[${scriptId}] Saving analysis results to Firestore`);

    // Save analysis to scriptAnalysis collection
    const analysisRef = admin.firestore().collection("scriptAnalysis").doc(scriptId);
    await analysisRef.set({
      scriptId,
      uploadedBy: uploadedBy || "unknown",
      originalName: data.metadata?.originalName || data.name,
      content: text,
      analysis: analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[${scriptId}] Analysis saved to scriptAnalysis collection`);

    // Update the script document with the analysis results and mark as completed
    const scriptRef = admin.firestore().collection("scripts").doc(scriptId);
    await scriptRef.update({
      analysis: analysis,
      uploadStatus: "completed",
      status: "ready",
      userId: uploadedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[${scriptId}] Script document updated with analysis results`);

    // Mark processing as completed
    await updateProcessingStatus(scriptId, "completed", 100);
    console.log(`[${scriptId}] Processing completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error(`[${scriptId}] Error processing script:`, {
      message: errorMessage,
      stack: errorStack,
      phase: "script processing",
      timestamp: new Date().toISOString(),
    });
    
    await updateProcessingStatus(
      scriptId,
      "error",
      null,
      `Processing failed: ${errorMessage}`
    );
    throw error;
  }
}
