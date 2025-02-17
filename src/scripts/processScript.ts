import { onObjectFinalized } from "firebase-functions/v2/storage";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Storage } from "@google-cloud/storage";
import pdfParse from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import * as fs from "fs";

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface StorageObjectMetadata {
  bucket: string;
  name: string;
  metadata?: {
    uploadedBy?: string;
    originalName?: string;
    scriptId?: string;
  };
}

/**
 * Processes an uploaded script file
 */
export const processUploadedScript = async (
  event: StorageObjectMetadata
): Promise<void> => {
  const secretManager = new SecretManagerServiceClient();
  const storage = new Storage();

  try {
    const [openAIKey] = await secretManager.accessSecretVersion({
      name: "projects/scriptcue-7ff0a/secrets/openai-api-key/versions/latest",
    });

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant.",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${openAIKey.payload?.data?.toString()}`,
        },
      }
    );

    const bucket = storage.bucket(event.bucket);
    const file = bucket.file(event.name);

    const tempFilePath = `/tmp/${uuidv4()}.pdf`;
    await file.download({ destination: tempFilePath });

    const dataBuffer = fs.readFileSync(tempFilePath);
    const pdfData = await pdfParse(dataBuffer);

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    return;
  } catch (error) {
    console.error("Error processing script:", error);
    throw error;
  }
};

export const processScript = onObjectFinalized(
  { timeoutSeconds: 540 },
  processUploadedScript
); 