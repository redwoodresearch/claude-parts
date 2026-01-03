import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MongoClient, type Db, type Collection } from "mongodb";

interface TranscriptEntry {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

interface UploadPayload {
  session_id: string;
  transcript: TranscriptEntry[];
  reason?: string;
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
    console.log("[MongoDB] Using cached connection");
    return cachedClient;
  }

  console.log("[MongoDB] Creating new connection");
  cachedClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await cachedClient.connect();
  console.log("[MongoDB] Connected successfully");
  return cachedClient;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const requestId = Math.random().toString(36).substring(7);
  const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "unknown";

  console.log(`[${requestId}] Incoming ${req.method} request from ${clientIp}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log(`[${requestId}] CORS preflight`);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    console.log(`[${requestId}] Rejected: Method not allowed`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log(`[${requestId}] Raw body type: ${typeof req.body}`);
    console.log(`[${requestId}] Raw body:`, JSON.stringify(req.body).slice(0, 500));

    const payload = req.body as UploadPayload;

    console.log(`[${requestId}] Payload received`, {
      session_id: payload?.session_id,
      transcript_entries: payload?.transcript?.length || 0,
      reason: payload?.reason,
    });

    if (!payload?.session_id) {
      console.log(`[${requestId}] Rejected: Missing session_id`);
      return res.status(400).json({ error: "Missing session_id" });
    }

    console.log(`[${requestId}] Connecting to MongoDB`);
    const client = await getMongoClient();
    const db: Db = client.db(process.env.MONGODB_DB || "claude_transcripts");
    const collection: Collection<TranscriptDocument> = db.collection(
      process.env.MONGODB_COLLECTION || "tool_calls"
    );

    const document: TranscriptDocument = {
      ...payload,
      uploaded_at: new Date(),
      client_ip: clientIp,
    };

    console.log(`[${requestId}] Inserting document`);
    const result = await collection.insertOne(document);
    console.log(`[${requestId}] Insert successful`, { insertedId: result.insertedId.toString() });

    return res.status(200).json({
      success: true,
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
