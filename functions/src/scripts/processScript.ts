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
      voices?: Record<string, string>;
      sequentialNumber?: number;
    }>;
  }>;
  scenes: Scene[];
  actionLines: Array<{
    text: string;
    lineNumber: number;
    sequentialNumber?: number;
  }>;
  processedLines: Array<{
    characterId: string;
    characterName: string;
    text: string;
    originalLineNumber: number;
    sequentialNumber: number;
    isUser?: boolean;
    isAction?: boolean;
    voices?: Record<string, string>;
  }>;
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
    dialogue: Array<{
      text: string;
      lineNumber: number;
    }>;
  }>;
  actionLines: Array<{
    text: string;
    lineNumber: number;
  }>;
  processed: boolean;
  chunkIndex: number;
  totalChunks: number;
}

type VoiceOption = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

interface VoiceInfo {
  description: string;
  gender: 'Male' | 'Female';
}

const VOICE_INFO: Record<VoiceOption, VoiceInfo> = {
  alloy: { description: 'Warm, steady', gender: 'Male' },
  ash: { description: 'Deep, authoritative', gender: 'Male' },
  coral: { description: 'Bright, expressive', gender: 'Female' },
  echo: { description: 'Smooth, refined', gender: 'Male' },
  fable: { description: 'Soft, lyrical', gender: 'Male' },
  onyx: { description: 'Bold, resonant', gender: 'Male' },
  nova: { description: 'Youthful, energetic', gender: 'Female' },
  sage: { description: 'Calm, wise', gender: 'Female' },
  shimmer: { description: 'Airy, melodic', gender: 'Female' }
};

interface CharacterVoiceSettings {
  voice: VoiceOption;
  testText: string;
}

interface ActionLineAnalysis {
  text: string;
  lineNumber: number;
}

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
        .sort((a, b) => a.lineNumber - b.lineNumber);
      
      // Validate dialogue line numbers
      for (let i = 1; i < mergedDialogue.length; i++) {
        if (mergedDialogue[i].lineNumber <= mergedDialogue[i-1].lineNumber && 
            !mergedDialogue[i].isMultiLine) {
          console.error('Non-sequential line numbers detected in dialogue:', {
            character: char.name,
            previous: mergedDialogue[i-1],
            current: mergedDialogue[i]
          });
          throw new Error(`Non-sequential line numbers detected in dialogue for character ${char.name}`);
        }
      }

      // Remove duplicates while preserving multi-line dialogue relationships
      const uniqueDialogue = mergedDialogue.filter((line, index, array) => {
        if (index === 0) return true;
        return line.lineNumber !== array[index - 1].lineNumber || line.isMultiLine;
      });
      
      charMap.set(key, {
        ...existing,
        lines: uniqueDialogue.length,
        firstAppearance: Math.min(existing.firstAppearance, char.firstAppearance),
        dialogue: uniqueDialogue,
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

const mergeActionLines = (
  existing: Array<{ text: string; lineNumber: number }>,
  newLines: Array<{ text: string; lineNumber: number }>,
): Array<{ text: string; lineNumber: number }> => {
  // Validate line numbers are unique
  const lineNumbers = new Set([...existing, ...newLines].map(line => line.lineNumber));
  if (lineNumbers.size !== existing.length + newLines.length) {
    console.error('Duplicate line numbers detected in action lines:', {
      existingLines: existing.map(l => l.lineNumber),
      newLines: newLines.map(l => l.lineNumber)
    });
    throw new Error('Duplicate line numbers detected in action lines');
  }

  const merged = [...existing, ...newLines].sort((a, b) => a.lineNumber - b.lineNumber);
  
  // Validate line numbers are sequential
  for (let i = 1; i < merged.length; i++) {
    if (merged[i].lineNumber <= merged[i-1].lineNumber) {
      console.error('Non-sequential line numbers detected in action lines:', {
        previous: merged[i-1],
        current: merged[i]
      });
      throw new Error('Non-sequential line numbers detected in action lines');
    }
  }

  console.log(`Merged action lines: ${merged.length} total lines`);
  return merged;
};

async function analyzeScriptContent(
  text: string,
  startLine: number,
  openai: OpenAI
): Promise<ActionLineAnalysis[]> {
  try {
    console.log(`Starting script content analysis for chunk starting at line ${startLine}`);
    
    if (!text || text.trim().length === 0) {
      throw new Error('Empty text provided for analysis');
    }

    // Prepare numbered text
    const lines = text.split('\n');
    const numberedText = lines.map((line, index) => 
      `${startLine + index}: ${line}`
    ).join('\n');

    console.log(`Sending chunk to OpenAI (length: ${text.length} characters)`);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a script analysis expert. Analyze the following script content and identify which lines are action descriptions.
          Each line is prefixed with its line number (e.g., "1: Some text").
          
          Return a JSON array where each element has:
          {
            "text": "the action description ("Tyler doesn't respond" or "She slaps him" or "He runs away")",
            "lineNumber": line number from the start of the line
          }

          Example:
          [
            {
              "text": "Tyler throws daggers at her.",
              "lineNumber": 11
            }
          ]

          Only include action descriptions, not dialogue, character names, or scene headings.
          DO NOT include markdown formatting or code blocks in your response.
          IMPORTANT: Return ONLY the JSON array.
          Use the exact line numbers from the input.`
        },
        {
          role: "user",
          content: numberedText
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    }).catch(error => {
      console.error('OpenAI API call failed:', {
        error: error instanceof Error ? error.message : String(error),
        chunk_start: startLine,
        text_length: text.length
      });
      throw new Error(`OpenAI API call failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    if (!response.choices[0]?.message?.content) {
      console.error('Empty response from OpenAI:', {
        response,
        chunk_start: startLine
      });
      throw new Error('Empty response from OpenAI');
    }

    try {
      // Clean the response by removing any markdown formatting
      const cleanedContent = response.choices[0].message.content
        .replace(/```json\n?/g, '')  // Remove ```json
        .replace(/```\n?/g, '')      // Remove closing ```
        .trim();                     // Remove any extra whitespace

      const analysis = JSON.parse(cleanedContent) as Array<{
        text: string;
        lineNumber: number;
      } | {
        line: number;
        action: string;
      }>;
      
      if (!Array.isArray(analysis)) {
        console.error('Invalid response format from OpenAI - not an array:', {
          content: cleanedContent,
          chunk_start: startLine
        });
        throw new Error('Invalid response format from OpenAI - not an array');
      }

      // Convert and validate each action line
      const convertedAnalysis = analysis.map((item, index) => {
        // Handle both possible formats
        const text = 'action' in item ? item.action : item.text;
        const lineNumber = 'line' in item ? item.line : item.lineNumber;

        if (!text || typeof text !== 'string') {
          console.error(`Invalid action line text at index ${index}:`, item);
          throw new Error(`Invalid action line text at index ${index}`);
        }
        if (typeof lineNumber !== 'number' || lineNumber < 0) {
          console.error(`Invalid line number at index ${index}:`, item);
          throw new Error(`Invalid line number at index ${index}`);
        }

        return {
          text,
          lineNumber
        };
      });

      console.log(`Successfully analyzed chunk. Found ${convertedAnalysis.length} action lines.`);
      
      // No need to adjust line numbers since they're now correct from the input
      return convertedAnalysis;
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        content: response.choices[0].message.content,
        chunk_start: startLine
      });
      throw new Error(`Failed to parse OpenAI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
  } catch (error) {
    console.error('Script content analysis failed:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : String(error),
      chunk_start: startLine,
      text_length: text.length
    });
    throw error;
  }
}

async function analyzeChunk(
  text: string,
  startLine: number,
  openai: OpenAI
): Promise<ScriptAnalysis> {
  try {
    console.log(`Starting chunk analysis at line ${startLine}`);
    
    if (!text || text.trim().length === 0) {
      throw new Error('Empty text chunk provided');
    }

    const lines = text.split('\n');
    console.log(`Processing chunk with ${lines.length} lines, starting at line ${startLine}`);

    const actionLineAnalysis = await analyzeScriptContent(text, startLine, openai);
    console.log(`Received ${actionLineAnalysis.length} action lines from analysis`);

    // Validate line numbers
    actionLineAnalysis.forEach((action, index) => {
      if (action.lineNumber < startLine || action.lineNumber >= startLine + lines.length) {
        console.error(`Invalid line number detected in action line:`, {
          actionLine: action,
          chunkStart: startLine,
          chunkEnd: startLine + lines.length - 1,
          index
        });
        throw new Error(`Action line number ${action.lineNumber} is outside chunk range ${startLine}-${startLine + lines.length - 1}`);
      }
      // Log the actual line content for verification
      console.log(`Action line ${action.lineNumber}: "${lines[action.lineNumber - startLine]}" -> "${action.text}"`);
    });
    
    const characters: { 
      [key: string]: { 
        lines: number; 
        firstAppearance: number;
        dialogue: Array<{
          text: string;
          lineNumber: number;
          voices?: Record<string, string>;
        }>;
      } 
    } = {};
    
    const scenes: Scene[] = [];
    const actionLines = actionLineAnalysis;
    let totalDialogueLines = 0;
    let currentScene: Scene = {
      name: '',
      startLine: 0,
      endLine: 0
    };
    let hasCurrentScene = false;
    let potentialCharacterLines: Array<{ line: string; lineNumber: number }> = [];
    let currentCharacter: string | null = null;
    let lineErrors: Array<{ line: number; error: string }> = [];
    let dialogueBuffer: string[] = [];
    let dialogueStartLine: number | null = null;

    console.log(`Processing ${lines.length} lines of text`);

    lines.forEach((line, index) => {
      try {
        const absoluteLineNumber = startLine + index;
        const trimmedLine = line.trim();
        
        // Skip if this is an action line
        if (actionLines.some(action => action.lineNumber === absoluteLineNumber)) {
          if (dialogueBuffer.length > 0 && currentCharacter && dialogueStartLine !== null) {
            // Save the buffered dialogue before moving on
            if (!characters[currentCharacter]) {
              characters[currentCharacter] = {
                lines: 0,
                firstAppearance: dialogueStartLine,
                dialogue: [],
              };
            }
            characters[currentCharacter].dialogue.push({
              text: dialogueBuffer.join(' '),
              lineNumber: dialogueStartLine,
            });
            characters[currentCharacter].lines++;
            totalDialogueLines++;
            dialogueBuffer = [];
            dialogueStartLine = null;
          }
          currentCharacter = null;
          return;
        }

        // Check if this is a scene heading
        if ((trimmedLine.startsWith('INT.') || trimmedLine.startsWith('EXT.')) &&
            (trimmedLine.includes('DAY') || trimmedLine.includes('NIGHT') || 
             trimmedLine.includes('EVENING') || trimmedLine.includes('MORNING'))) {
          if (dialogueBuffer.length > 0 && currentCharacter && dialogueStartLine !== null) {
            // Save any buffered dialogue before starting new scene
            if (!characters[currentCharacter]) {
              characters[currentCharacter] = {
                lines: 0,
                firstAppearance: dialogueStartLine,
                dialogue: [],
              };
            }
            characters[currentCharacter].dialogue.push({
              text: dialogueBuffer.join(' '),
              lineNumber: dialogueStartLine,
            });
            characters[currentCharacter].lines++;
            totalDialogueLines++;
            dialogueBuffer = [];
            dialogueStartLine = null;
          }

          if (hasCurrentScene) {
            const scene: Scene = {
              name: currentScene.name,
              startLine: currentScene.startLine,
              endLine: absoluteLineNumber - 1,
            };
            if (currentScene.location) scene.location = currentScene.location;
            if (currentScene.timeOfDay) scene.timeOfDay = currentScene.timeOfDay;
            scenes.push(scene);
          }

          let location = undefined;
          let timeOfDay = undefined;
          
          if (trimmedLine.includes("-")) {
            location = trimmedLine.split("-")[0].trim();
            const timeMatch = trimmedLine.match(/(DAY|NIGHT|EVENING|MORNING)/i);
            if (timeMatch) timeOfDay = timeMatch[0];
          }

          currentScene = {
            name: trimmedLine,
            startLine: absoluteLineNumber,
            endLine: absoluteLineNumber,
          };
          if (location) currentScene.location = location;
          if (timeOfDay) currentScene.timeOfDay = timeOfDay;
          hasCurrentScene = true;
          currentCharacter = null;
          return;
        }

        // Check if this is a character name
        if (trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length > 0 && 
            !trimmedLine.startsWith('(') && !trimmedLine.endsWith(')') &&
            trimmedLine.length >= 2) {
          if (dialogueBuffer.length > 0 && currentCharacter && dialogueStartLine !== null) {
            // Save any buffered dialogue before starting new character
            if (!characters[currentCharacter]) {
              characters[currentCharacter] = {
                lines: 0,
                firstAppearance: dialogueStartLine,
                dialogue: [],
              };
            }
            characters[currentCharacter].dialogue.push({
              text: dialogueBuffer.join(' '),
              lineNumber: dialogueStartLine,
            });
            characters[currentCharacter].lines++;
          }
          
          potentialCharacterLines.push({
            line: trimmedLine,
            lineNumber: absoluteLineNumber
          });
          currentCharacter = trimmedLine;
          dialogueBuffer = [];
          dialogueStartLine = null;
          return;
        }

        // Handle dialogue lines
        if (currentCharacter && trimmedLine.length > 0) {
          if (dialogueStartLine === null) {
            dialogueStartLine = absoluteLineNumber;
          }
          dialogueBuffer.push(trimmedLine);
        } else if (trimmedLine.length === 0 && dialogueBuffer.length > 0 && currentCharacter && dialogueStartLine !== null) {
          // Empty line ends the dialogue
          if (!characters[currentCharacter]) {
            characters[currentCharacter] = {
              lines: 0,
              firstAppearance: dialogueStartLine,
              dialogue: [],
            };
          }
          characters[currentCharacter].dialogue.push({
            text: dialogueBuffer.join(' '),
            lineNumber: dialogueStartLine,
          });
          characters[currentCharacter].lines++;
          totalDialogueLines++;
          dialogueBuffer = [];
          dialogueStartLine = null;
          currentCharacter = null;
        }

      } catch (lineError) {
        console.error(`Error processing line ${startLine + index}:`, lineError);
        lineErrors.push({
          line: startLine + index,
          error: lineError instanceof Error ? lineError.message : String(lineError)
        });
      }
    });

    // Handle any remaining dialogue buffer at the end of the chunk
    if (dialogueBuffer.length > 0 && currentCharacter && dialogueStartLine !== null) {
      if (!characters[currentCharacter]) {
        characters[currentCharacter] = {
          lines: 0,
          firstAppearance: dialogueStartLine,
          dialogue: [],
        };
      }
      characters[currentCharacter].dialogue.push({
        text: dialogueBuffer.join(' '),
        lineNumber: dialogueStartLine,
      });
      characters[currentCharacter].lines++;
      totalDialogueLines++;
    }

    if (lineErrors.length > 0) {
      console.warn(`Encountered ${lineErrors.length} errors while processing lines:`, lineErrors);
    }

    // Close the last scene if there is one
    if (hasCurrentScene) {
      const scene: Scene = {
        name: currentScene.name,
        startLine: currentScene.startLine,
        endLine: startLine + lines.length - 1,
      };
      if (currentScene.location) scene.location = currentScene.location;
      if (currentScene.timeOfDay) scene.timeOfDay = currentScene.timeOfDay;
      scenes.push(scene);
    }

    // Convert characters object to array format
    const characterArray = Object.entries(characters).map(([name, data]) => ({
      name,
      lines: data.lines,
      firstAppearance: data.firstAppearance,
      dialogue: data.dialogue,
    }));

    console.log(`Chunk analysis complete:`, {
      characters: characterArray.length,
      scenes: scenes.length,
      actionLines: actionLines.length,
      totalDialogueLines,
      errors: lineErrors.length,
      potential_character_lines: potentialCharacterLines.length
    });

    return {
      characters: characterArray,
      scenes,
      actionLines,
      processedLines: [],
      metadata: {
        totalLines: totalDialogueLines,
        estimatedDuration: Math.ceil(totalDialogueLines / 60),
      },
    };
  } catch (error) {
    console.error('Chunk analysis failed:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : String(error),
      chunk_start: startLine,
      text_length: text.length
    });
    throw error;
  }
}

async function assignVoicesToCharacters(
  characters: ScriptAnalysis['characters'],
  openai: OpenAI
): Promise<Record<string, CharacterVoiceSettings>> {
  // Get gender predictions for all characters
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a script analysis expert. Your task is to predict the gender (Male/Female) of character names. Respond with a JSON object where keys are character names and values are 'Male' or 'Female'. Base your prediction on common naming conventions and character context if provided. IMPORTANT: Respond with ONLY the JSON object, no markdown formatting or additional text."
      },
      {
        role: "user",
        content: JSON.stringify(characters.map(char => ({
          name: char.name,
          firstLine: char.dialogue[0]?.text || ''
        })))
      }
    ],
    temperature: 0,
    max_tokens: 1000
  });

  if (!response.choices[0]?.message?.content) {
    throw new Error('Empty response from OpenAI');
  }

  // Parse gender predictions
  const genderPredictions = JSON.parse(response.choices[0].message.content.trim()) as Record<string, 'Male' | 'Female'>;

  // Group voices by gender
  const maleVoices: VoiceOption[] = [];
  const femaleVoices: VoiceOption[] = [];
  
  Object.entries(VOICE_INFO).forEach(([voice, info]) => {
    if (info.gender === 'Male') {
      maleVoices.push(voice as VoiceOption);
    } else {
      femaleVoices.push(voice as VoiceOption);
    }
  });

  // Group characters by gender
  const maleCharacters: typeof characters = [];
  const femaleCharacters: typeof characters = [];

  // Sort characters by number of lines (descending) to prioritize main characters
  const sortedCharacters = [...characters].sort((a, b) => b.lines - a.lines);

  // Split characters into gender groups
  sortedCharacters.forEach(char => {
    const predictedGender = genderPredictions[char.name];
    if (predictedGender === 'Male') {
      maleCharacters.push(char);
    } else {
      femaleCharacters.push(char);
    }
  });

  // Assign voices to characters
  const voiceAssignments: Record<string, CharacterVoiceSettings> = {};

  // Helper function to assign voices for a gender group
  const assignVoicesForGender = (
    chars: typeof characters,
    voices: VoiceOption[]
  ) => {
    chars.forEach((char, index) => {
      // Use modulo to cycle through available voices of the same gender
      const voiceIndex = index % voices.length;
      const selectedVoice = voices[voiceIndex];

      voiceAssignments[char.name] = {
        voice: selectedVoice,
        testText: char.dialogue[0]?.text || `This is ${char.name}'s voice.`
      };
    });
  };

  // Assign voices for each gender group
  assignVoicesForGender(maleCharacters, maleVoices);
  assignVoicesForGender(femaleCharacters, femaleVoices);

  return voiceAssignments;
}

async function filterDuplicateDialogue(
  characters: ScriptAnalysis['characters'],
  actionLines: ScriptAnalysis['actionLines']
): Promise<ScriptAnalysis['characters']> {
  // Create a map of line numbers to action lines for quick lookup
  const actionLineMap = new Map(
    actionLines.map(action => [action.lineNumber, action.text])
  );

  console.log(`Checking for dialogue-action duplicates against ${actionLineMap.size} action lines`);

  return characters.map(character => {
    // Filter out dialogue entries that match action lines
    const filteredDialogue = character.dialogue.filter(dialogue => {
      const actionText = actionLineMap.get(dialogue.lineNumber);
      if (actionText) {
        // Log when we find a match for debugging
        console.log(`Found matching action line at ${dialogue.lineNumber}:`, {
          dialogueText: dialogue.text,
          actionText: actionText,
          character: character.name
        });
        return false; // Remove this dialogue entry
      }
      return true;
    });

    // Update the character's line count
    return {
      ...character,
      lines: filteredDialogue.length,
      dialogue: filteredDialogue
    };
  });
}

async function preprocessScriptLines(
  characters: ScriptAnalysis['characters'],
  actionLines: ScriptAnalysis['actionLines']
): Promise<ScriptAnalysis['processedLines']> {
  const allLines: ScriptAnalysis['processedLines'] = [];

  // Add action lines
  actionLines.forEach((action) => {
    allLines.push({
      characterId: 'ACTION',
      characterName: 'ACTION',
      text: action.text,
      originalLineNumber: action.lineNumber,
      sequentialNumber: 0, // Will be set after sorting
      isAction: true,
    });
  });

  // Add dialogue lines
  characters.forEach((char) => {
    if (char.dialogue && char.dialogue.length > 0) {
      char.dialogue.forEach((line) => {
        const processedLine: ScriptAnalysis['processedLines'][0] = {
          characterId: char.name,
          characterName: char.name,
          text: line.text,
          originalLineNumber: line.lineNumber,
          sequentialNumber: 0, // Will be set after sorting
          isUser: false,
        };

        // Only add voices field if it exists and has values
        if (line.voices && Object.keys(line.voices).length > 0) {
          processedLine.voices = line.voices;
        }

        allLines.push(processedLine);
      });
    }
  });

  // Sort by original line number
  allLines.sort((a, b) => a.originalLineNumber - b.originalLineNumber);

  // Assign sequential numbers
  return allLines.map((line, index) => ({
    ...line,
    sequentialNumber: index + 1,
  }));
}

async function saveValidatedResults(
  scriptId: string,
  uploadedBy: string | undefined,
  fileName: string,
  text: string,
  analysis: ScriptAnalysis,
  validatedCharacters: Array<any>,
  originalCharacterCount: number,
  voiceAssignments: Record<string, CharacterVoiceSettings>
): Promise<void> {
  try {
    // Filter out dialogue entries that match action lines
    console.log(`[${scriptId}] Filtering duplicate dialogue entries...`);
    const filteredCharacters = await filterDuplicateDialogue(analysis.characters, analysis.actionLines);
    
    // Update the analysis with filtered characters
    analysis.characters = filteredCharacters;

    // Process and combine all lines
    console.log(`[${scriptId}] Processing and combining script lines...`);
    analysis.processedLines = await preprocessScriptLines(analysis.characters, analysis.actionLines);

    // Update sequential numbers in original arrays to match
    analysis.characters.forEach(char => {
      char.dialogue.forEach(line => {
        const processedLine = analysis.processedLines.find(
          pl => pl.characterId === char.name && pl.originalLineNumber === line.lineNumber
        );
        if (processedLine) {
          line.sequentialNumber = processedLine.sequentialNumber;
        }
      });
    });

    analysis.actionLines.forEach(action => {
      const processedLine = analysis.processedLines.find(
        pl => pl.isAction && pl.originalLineNumber === action.lineNumber
      );
      if (processedLine) {
        action.sequentialNumber = processedLine.sequentialNumber;
      }
    });

    // Recalculate total lines
    analysis.metadata.totalLines = analysis.processedLines.length;
    analysis.metadata.estimatedDuration = Math.ceil(analysis.metadata.totalLines / 60);

    console.log(`[${scriptId}] Analysis updated after processing:`, {
      totalCharacters: filteredCharacters.length,
      totalLines: analysis.metadata.totalLines,
      processedLines: analysis.processedLines.length,
      actionLines: analysis.actionLines.length
    });

    // Use transaction for atomic saves
    await admin.firestore().runTransaction(async (transaction) => {
      const analysisRef = admin.firestore().collection("scriptAnalysis").doc(scriptId);
      const scriptRef = admin.firestore().collection("scripts").doc(scriptId);
      const statusRef = admin.firestore().collection("scriptProcessing").doc(scriptId);
      const voicesRef = admin.firestore().collection("scripts").doc(scriptId).collection("settings").doc("voices");

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

      // Save voice assignments
      transaction.set(voicesRef, voiceAssignments);
    });

    console.log(`[${scriptId}] Processing completed successfully with ${validatedCharacters.length} valid characters out of ${originalCharacterCount} detected characters`);
  } catch (error) {
    console.error(`[${scriptId}] Processing Error:`, {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      phase: 'script processing',
      metadata: {
        scriptId,
        uploadedBy,
        fileName,
        text
      }
    });
    
    await updateProcessingState(scriptId, {
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
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
    console.error("No scriptId provided in metadata:", data);
    throw new Error("No scriptId provided in metadata");
  }

  try {
    console.log("Starting script processing:", {
      scriptId,
      uploadedBy,
      fileName: data.name,
      bucket: data.bucket,
      metadata: data.metadata
    });

    await updateProcessingState(scriptId, {
      status: 'initializing',
      progress: 0,
    });

    if (!data.name || !data.bucket) {
      throw new Error('Invalid storage event: missing file name or bucket');
    }

    const bucket = admin.storage().bucket(data.bucket);
    const file = bucket.file(data.name);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File ${data.name} does not exist in bucket ${data.bucket}`);
    }
    
    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 10,
    });

    console.log(`[${scriptId}] Downloading PDF file: ${data.name}`);
    let fileContent: Buffer;
    try {
      [fileContent] = await file.download();
    console.log(`[${scriptId}] PDF downloaded successfully, size: ${fileContent.length} bytes`);
    } catch (downloadError) {
      console.error(`[${scriptId}] Failed to download PDF:`, {
        error: downloadError instanceof Error ? downloadError.message : String(downloadError),
        file: data.name,
        bucket: data.bucket
      });
      throw new Error(`Failed to download PDF: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`);
    }

    await updateProcessingState(scriptId, {
      status: 'validating',
      progress: 20,
    });
    
    console.log(`[${scriptId}] Starting PDF validation...`);
    try {
      await validatePDF(fileContent);
      console.log(`[${scriptId}] PDF validation successful`);
    } catch (validationError) {
      console.error(`[${scriptId}] PDF validation failed:`, {
        error: validationError instanceof Error ? validationError.message : String(validationError),
        stack: validationError instanceof Error ? validationError.stack : undefined,
        fileSize: fileContent.length
      });
      throw validationError;
    }

    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 30,
    });

    console.log(`[${scriptId}] Starting text extraction`);
    let text: string;
    try {
    const pdfData = await pdfParse(fileContent);
      text = pdfData.text;
      console.log("The text: ", text);
      if (!text || text.trim().length === 0) {
        throw new Error('Extracted text is empty');
      }
    console.log(`[${scriptId}] Text extracted successfully, length: ${text.length} characters`);
    } catch (extractError) {
      console.error(`[${scriptId}] Text extraction failed:`, {
        error: extractError instanceof Error ? extractError.message : String(extractError),
        stack: extractError instanceof Error ? extractError.stack : undefined,
        fileSize: fileContent.length
      });
      throw new Error(`Failed to extract text from PDF: ${extractError instanceof Error ? extractError.message : String(extractError)}`);
    }

    const chunks = chunkText(text);
    const totalChunks = chunks.length;
    const totalLines = text.split("\n").length;
    
    console.log(`[${scriptId}] Text chunking complete:`, {
      chunks: totalChunks,
      totalLines,
      averageChunkSize: Math.floor(text.length / totalChunks)
    });
    
    await updateProcessingState(scriptId, {
      status: 'processing',
      progress: 30,
      totalBatches: totalChunks,
      batchesProcessed: 0,
    });

    const analysis: ScriptAnalysis = {
      characters: [],
      scenes: [],
      actionLines: [],
      processedLines: [],
      metadata: {
        totalLines: 0,
        estimatedDuration: 0,
      },
    };

    // Initialize OpenAI client
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    const chunkErrors: Array<{ chunk: number; error: string }> = [];

    // Process chunks and save batches
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`[${scriptId}] Processing chunk ${i + 1}/${chunks.length}`);
        
        const chunkAnalysis = await analyzeChunk(
          chunks[i], 
          i * Math.ceil(totalLines / chunks.length),
          openai
        );
      
      const batch: CharacterBatch = {
        batchId: `batch_${i}`,
        characters: chunkAnalysis.characters,
          actionLines: chunkAnalysis.actionLines,
        processed: false,
        chunkIndex: i,
        totalChunks,
      };

      await saveBatch(scriptId, batch);
      
      // Merge chunk analysis into combined analysis
      analysis.characters = mergeCharacters(analysis.characters, chunkAnalysis.characters);
      analysis.scenes = mergeScenes(analysis.scenes, chunkAnalysis.scenes);
        analysis.actionLines = mergeActionLines(analysis.actionLines, chunkAnalysis.actionLines);
      analysis.metadata.totalLines += chunkAnalysis.metadata.totalLines;
      analysis.metadata.estimatedDuration += chunkAnalysis.metadata.estimatedDuration;
      
      await updateProcessingState(scriptId, {
        status: 'processing',
        progress: 30 + Math.floor((i / chunks.length) * 40),
        batchesProcessed: i + 1,
      });

        console.log(`[${scriptId}] Chunk ${i + 1}/${chunks.length} processed successfully`);
      } catch (chunkError) {
        console.error(`[${scriptId}] Error processing chunk ${i + 1}/${chunks.length}:`, {
          error: chunkError instanceof Error ? chunkError.message : String(chunkError),
          stack: chunkError instanceof Error ? chunkError.stack : undefined,
          chunkSize: chunks[i].length
        });
        chunkErrors.push({
          chunk: i,
          error: chunkError instanceof Error ? chunkError.message : String(chunkError)
        });
      }
    }

    if (chunkErrors.length > 0) {
      console.warn(`[${scriptId}] Encountered ${chunkErrors.length} errors while processing chunks:`, chunkErrors);
    }

    await updateProcessingState(scriptId, {
      status: 'validating',
      progress: 70,
    });

    // Process all batches
    console.log(`[${scriptId}] Starting batch validation`);
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

    // After character validation, perform voice assignment
    console.log(`[${scriptId}] Starting voice assignment for ${validatedCharacters.length} characters`);
    const voiceAssignments = await assignVoicesToCharacters(validatedCharacters, openai);
    console.log(`[${scriptId}] Voice assignment completed:`, voiceAssignments);

    // Save the results with voice assignments
    console.log(`[${scriptId}] Saving validated results with voice assignments`);
    await saveValidatedResults(
      scriptId,
      uploadedBy,
      data.metadata?.originalName || data.name,
      text,
      analysis,
      validatedCharacters,
      analysis.characters.length,
      voiceAssignments
    );

    console.log(`[${scriptId}] Script processing completed successfully`);

  } catch (error) {
    console.error(`[${scriptId}] Processing Error:`, {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      phase: 'script processing',
      metadata: {
        scriptId,
        uploadedBy,
        fileName: data.name,
        bucket: data.bucket
      }
    });
    
    await updateProcessingState(scriptId, {
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}
