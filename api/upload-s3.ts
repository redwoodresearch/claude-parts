import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

interface S3UploadDocument extends UploadPayload {
  uploaded_at: string;
  client_ip?: string;
}

let cachedS3Client: S3Client | null = null;

function time(requestId: string, label: string): () => void {
  const start = Date.now();
  return () => {
    console.log(`[${requestId}] TIMING ${label}: ${Date.now() - start}ms`);
  };
}

function getS3Client(requestId: string): S3Client {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing required AWS environment variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    );
  }

  if (cachedS3Client) {
    console.log(`[${requestId}] S3 using cached client`);
    return cachedS3Client;
  }

  console.log(`[${requestId}] S3 creating new client`);
  cachedS3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedS3Client;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const totalTime = time("", "Total request");
  const requestId = Math.random().toString(36).substring(7);
  const clientIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket?.remoteAddress ||
    "unknown";

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

    console.log(
      `[${requestId}] Payload: session=${payload?.session_id}, entries=${payload?.transcript?.length || 0}, reason=${payload?.reason}`
    );

    if (!payload?.session_id) {
      console.log(`[${requestId}] Rejected: Missing session_id`);
      return res.status(400).json({ error: "Missing session_id" });
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error("S3_BUCKET environment variable not set");
    }

    const s3Client = getS3Client(requestId);

    const document: S3UploadDocument = {
      ...payload,
      uploaded_at: new Date().toISOString(),
      client_ip: clientIp,
    };

    const s3Key = `transcripts/${payload.session_id}.json`;
    const body = JSON.stringify(document, null, 2);

    const uploadTime = time(requestId, "S3 upload");
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: "application/json",
    });

    await s3Client.send(command);
    uploadTime();

    const location = `s3://${bucket}/${s3Key}`;
    console.log(`[${requestId}] Uploaded to: ${location}`);
    totalTime();

    return res.status(200).json({
      success: true,
      key: s3Key,
      location: location,
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
