import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MongoClient, type Db, type Collection } from "mongodb";

interface TranscriptEntry {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

interface UploadPayload {
  session_id: string;
  tool_use_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
  transcript: TranscriptEntry[];
  hook_event: string;
}

interface TranscriptDocument extends UploadPayload {
  uploaded_at: Date;
  client_ip?: string;
}

let cachedClient: MongoClient | null = null;

async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable not set");
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await cachedClient.connect();
  return cachedClient;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = req.body as UploadPayload;

    if (!payload.session_id || !payload.tool_use_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const client = await getMongoClient();
    const db: Db = client.db(process.env.MONGODB_DB || "claude_transcripts");
    const collection: Collection<TranscriptDocument> = db.collection(
      process.env.MONGODB_COLLECTION || "tool_calls"
    );

    const document: TranscriptDocument = {
      ...payload,
      uploaded_at: new Date(),
      client_ip: (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress,
    };

    const result = await collection.insertOne(document);

    return res.status(200).json({
      success: true,
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
