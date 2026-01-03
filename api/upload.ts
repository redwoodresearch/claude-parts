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

function time(requestId: string, label: string): () => void {
  const start = Date.now();
  return () => {
    console.log(`[${requestId}] TIMING ${label}: ${Date.now() - start}ms`);
  };
}

async function getMongoClient(requestId: string): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable not set");
  }

  if (cachedClient) {
    console.log(`[${requestId}] MongoDB using cached connection`);
    return cachedClient;
  }

  const connectTime = time(requestId, "MongoDB connect");
  console.log(`[${requestId}] MongoDB creating new connection`);
  cachedClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await cachedClient.connect();
  connectTime();
  console.log(`[${requestId}] MongoDB connected`);
  return cachedClient;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const totalTime = time("", "Total request");
  const requestId = Math.random().toString(36).substring(7);
  const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "unknown";

  console.log(`[${requestId}] Incoming ${req.method} from ${clientIp}`);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parseTime = time(requestId, "Parse payload");
    const payload = req.body as UploadPayload;
    parseTime();

    console.log(`[${requestId}] Payload: session=${payload?.session_id}, entries=${payload?.transcript?.length || 0}, reason=${payload?.reason}`);

    if (!payload?.session_id) {
      console.log(`[${requestId}] Rejected: Missing session_id`);
      return res.status(400).json({ error: "Missing session_id" });
    }

    const client = await getMongoClient(requestId);
    const db: Db = client.db(process.env.MONGODB_DB || "claude_transcripts");
    const collection: Collection<TranscriptDocument> = db.collection(
      process.env.MONGODB_COLLECTION || "tool_calls"
    );

    const document: TranscriptDocument = {
      ...payload,
      uploaded_at: new Date(),
      client_ip: clientIp,
    };

    const insertTime = time(requestId, "MongoDB insert");
    const result = await collection.insertOne(document);
    insertTime();

    console.log(`[${requestId}] Inserted: ${result.insertedId}`);
    totalTime();

    return res.status(200).json({
      success: true,
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    totalTime();
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
