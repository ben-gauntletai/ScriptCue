import * as admin from "firebase-admin";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import * as pdfParse from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import * as fs from "fs";
import { CloudEvent } from "firebase-functions/v2";

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

type StorageObjectMetadata = CloudEvent<{
  bucket: string;
  name: string;
  metadata?: {
    uploadedBy?: string;
    originalName?: string;
    scriptId?: string;
  };
}>;

const secretManager = new SecretManagerServiceClient();

/**
 * Retrieves the OpenAI API key from Google Cloud Secret Manager.
 * @return The OpenAI API key.
 * @throws {Error} If unable to access the API key.
 */
const getOpenAIKey = async (): Promise<string> => {
  try {
    const [version] = await secretManager.accessSecretVersion({
      name: "projects/scriptcue/secrets/openai-api-key/versions/latest",
    });
    return version.payload?.data?.toString() || "";
  } catch (error) {
    console.error("Error accessing OpenAI API key:", error);
    throw new Error("Failed to access OpenAI API key");
  }
};

/**
 * Processes an uploaded script file from Cloud Storage.
 * Analyzes the content and stores the results in Firestore.
 * @param event The storage event containing file metadata.
 */
export async function processUploadedScript(event: StorageObjectMetadata): Promise<void> {
  try {
    const bucket = admin.storage().bucket(event.data.bucket);
    const tempFilePath = `/tmp/${uuidv4()}`;
    const file = bucket.file(event.data.name);

    await file.download({ destination: tempFilePath });

    const dataBuffer = fs.readFileSync(tempFilePath);
    const pdfData = await pdfParse(dataBuffer);

    await fs.promises.unlink(tempFilePath);

    const scriptContent = pdfData.text;
    const openaiApiKey = await getOpenAIKey();

    const response = await axios.post<OpenAIResponse>(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a script analysis assistant. " +
              "Analyze the provided script and extract key information.",
          },
          {
            role: "user",
            content: scriptContent,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const analysisRef = admin.firestore().collection("scriptAnalysis").doc();
    await analysisRef.set({
      scriptId: event.data.metadata?.scriptId || uuidv4(),
      uploadedBy: event.data.metadata?.uploadedBy || "unknown",
      originalName: event.data.metadata?.originalName || event.data.name,
      content: scriptContent,
      analysis: response.data.choices[0].message.content,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error processing script:", error);
    throw error;
  }
}
