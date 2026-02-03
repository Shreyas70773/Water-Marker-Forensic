import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { v4 as uuidv4 } from "uuid";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

import { HashEngine } from "@/lib/crypto/hasher";
import { 
  computeCombinedHash, 
  compareCombinedHashes,
  CombinedHash 
} from "@/lib/watermark/perceptual-hash";

// Use dynamic imports for FFmpeg
let ffmpegPath: string;
let ffprobePath: string;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
  ffmpegPath = ffmpegInstaller.path;
  ffprobePath = ffprobeInstaller.path;
} catch (e) {
  console.warn("FFmpeg/FFprobe installers not found, using system binaries:", e);
  ffmpegPath = "ffmpeg";
  ffprobePath = "ffprobe";
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Similarity threshold for detection
const SIMILARITY_THRESHOLD = 0.85;

async function getFFmpeg() {
  const fluentFFmpeg = (await import("fluent-ffmpeg")).default;
  fluentFFmpeg.setFfmpegPath(ffmpegPath);
  fluentFFmpeg.setFfprobePath(ffprobePath);
  return fluentFFmpeg;
}

async function extractSampleFrames(
  videoPath: string,
  outputDir: string,
  sampleCount: number = 5
): Promise<string[]> {
  const ffmpeg = await getFFmpeg();
  
  // Get video duration first
  const duration = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err: Error | null, metadata: { format: { duration?: number } }) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 10);
    });
  });

  // Calculate timestamps for evenly distributed samples
  const interval = duration / (sampleCount + 1);
  const timestamps = Array.from({ length: sampleCount }, (_, i) => (i + 1) * interval);

  const framePaths: string[] = [];

  // Extract frames at each timestamp
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const outputPath = path.join(outputDir, `sample_${i}.jpg`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .outputOptions(["-vframes 1", "-q:v 2"])
        .output(outputPath)
        .on("end", () => {
          framePaths.push(outputPath);
          resolve();
        })
        .on("error", reject)
        .run();
    });
  }

  return framePaths;
}

export async function POST(req: NextRequest) {
  const requestId = uuidv4();
  let tempDir: string | null = null;

  try {
    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Supported: MP4, WebM, MOV" },
        { status: 400 }
      );
    }

    // Get request metadata for logging
    const sourceIp =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "detect-video-"));
    const videoPath = path.join(tempDir, `input${path.extname(file.name) || ".mp4"}`);
    const framesDir = path.join(tempDir, "frames");
    await fs.mkdir(framesDir, { recursive: true });

    // Save video to temp file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(videoPath, buffer);

    const fileHash = HashEngine.hashFile(buffer);

    // Extract sample frames (5 frames distributed across the video)
    console.log("[DETECT-VIDEO] Extracting sample frames...");
    const framePaths = await extractSampleFrames(videoPath, framesDir, 5);
    console.log(`[DETECT-VIDEO] Extracted ${framePaths.length} frames`);

    if (framePaths.length === 0) {
      return NextResponse.json(
        { error: "Could not extract frames from video" },
        { status: 400 }
      );
    }

    // Compute perceptual hashes for each frame
    const frameHashes: CombinedHash[] = [];
    for (const framePath of framePaths) {
      const frameBuffer = await fs.readFile(framePath);
      const hashes = await computeCombinedHash(frameBuffer);
      frameHashes.push(hashes);
    }

    console.log(`[DETECT-VIDEO] Computed hashes for ${frameHashes.length} frames`);

    // Get recent artworks to match against
    const recentArtworks = await convex.query(api.artworks.getRecent, {
      limit: 100,
    });

    console.log(`[DETECT-VIDEO] Found ${recentArtworks.length} artworks to search`);

    if (recentArtworks.length === 0) {
      await convex.mutation(api.detectionLogs.create, {
        detected: false,
        confidence: 0,
        confidenceLevel: "NONE",
        framesAnalyzed: framePaths.length,
        analyzedFileName: file.name,
        analyzedFileSize: file.size,
        analyzedFileHash: fileHash,
        sourceIp,
        userAgent,
        requestId,
      });

      return NextResponse.json({
        found: false,
        message: "No registered artworks in the system",
        framesAnalyzed: framePaths.length,
      });
    }

    // Find best matching artwork across all frames
    let bestMatch: {
      artwork: (typeof recentArtworks)[0];
      similarity: number;
      frameIndex: number;
      details: { pHashSim: number; aHashSim: number; dHashSim: number };
    } | null = null;

    // Track matches per artwork (for multi-frame voting)
    const artworkMatches = new Map<string, { similarity: number; matchCount: number }>();

    for (const artwork of recentArtworks) {
      // Skip artworks without perceptual hashes
      if (!artwork.perceptualHash || !artwork.differenceHash) {
        continue;
      }

      const storedHashes: CombinedHash = {
        pHash: artwork.perceptualHash,
        aHash: artwork.averageHash || "",
        dHash: artwork.differenceHash,
      };

      // Compare against each frame
      for (let i = 0; i < frameHashes.length; i++) {
        const comparison = compareCombinedHashes(frameHashes[i], storedHashes);

        // Track this artwork's best match
        const current = artworkMatches.get(artwork.workId);
        if (!current || comparison.similarity > current.similarity) {
          artworkMatches.set(artwork.workId, {
            similarity: comparison.similarity,
            matchCount: (current?.matchCount || 0) + (comparison.similarity > 0.7 ? 1 : 0),
          });
        }

        // Track overall best match
        if (comparison.similarity > (bestMatch?.similarity ?? 0)) {
          bestMatch = {
            artwork,
            similarity: comparison.similarity,
            frameIndex: i,
            details: comparison,
          };
        }
      }
    }

    // Log matches for debugging
    if (bestMatch) {
      console.log(`[DETECT-VIDEO] Best match: ${bestMatch.artwork.workId} with ${(bestMatch.similarity * 100).toFixed(1)}% similarity at frame ${bestMatch.frameIndex}`);
    }

    // Determine confidence level
    const getConfidenceLevel = (
      similarity: number
    ): "EXCELLENT" | "GOOD" | "FAIR" | "MARGINAL" | "NONE" => {
      if (similarity >= 0.95) return "EXCELLENT";
      if (similarity >= 0.90) return "GOOD";
      if (similarity >= 0.85) return "FAIR";
      if (similarity >= 0.75) return "MARGINAL";
      return "NONE";
    };

    // No match found or low similarity
    if (!bestMatch || bestMatch.similarity < SIMILARITY_THRESHOLD) {
      await convex.mutation(api.detectionLogs.create, {
        detected: false,
        confidence: bestMatch?.similarity ?? 0,
        confidenceLevel: "NONE",
        framesAnalyzed: framePaths.length,
        analyzedFileName: file.name,
        analyzedFileSize: file.size,
        analyzedFileHash: fileHash,
        sourceIp,
        userAgent,
        requestId,
      });

      return NextResponse.json({
        found: false,
        message: "No matching watermarked content found",
        confidence: bestMatch?.similarity ?? 0,
        threshold: SIMILARITY_THRESHOLD,
        framesAnalyzed: framePaths.length,
      });
    }

    // Get user data for the matched artwork
    const artworkWithUser = await convex.query(api.artworks.getWithUser, {
      id: bestMatch.artwork._id,
    });

    const confidenceLevel = getConfidenceLevel(bestMatch.similarity);

    // Log successful detection
    await convex.mutation(api.detectionLogs.create, {
      artworkId: bestMatch.artwork._id,
      workId: bestMatch.artwork.workId,
      detected: true,
      confidence: bestMatch.similarity,
      confidenceLevel,
      framesAnalyzed: framePaths.length,
      analyzedFileName: file.name,
      analyzedFileSize: file.size,
      analyzedFileHash: fileHash,
      sourceIp,
      userAgent,
      requestId,
    });

    // Return forensic-quality response
    return NextResponse.json({
      found: true,
      verified: true,
      matchType: "perceptual_hash",
      forensicData: {
        similarity: bestMatch.similarity,
        confidenceLevel,
        matchedFrameIndex: bestMatch.frameIndex,
        framesAnalyzed: framePaths.length,
        hashDetails: {
          pHashSimilarity: bestMatch.details.pHashSim,
          aHashSimilarity: bestMatch.details.aHashSim,
          dHashSimilarity: bestMatch.details.dHashSim,
        },
      },
      artwork: {
        workId: bestMatch.artwork.workId,
        author: artworkWithUser?.user?.legalName ?? "Unknown",
        displayName: artworkWithUser?.user?.displayName ?? "Unknown",
        createdUtc: bestMatch.artwork.createdUtc,
        mediaType: bestMatch.artwork.mediaType,
        blockchainTxHash: bestMatch.artwork.blockchainTxHash,
        blockchainNetwork: bestMatch.artwork.blockchainNetwork,
        primarySource: artworkWithUser?.user?.primarySource,
      },
      evidenceBundle: {
        originalHash: bestMatch.artwork.originalHash,
        payloadHash: bestMatch.artwork.payloadHash,
        evidenceSignature: bestMatch.artwork.evidenceSignature,
        signaturePublicKey: bestMatch.artwork.signaturePublicKey,
        blockchainVerificationUrl: bestMatch.artwork.blockchainTxHash
          ? `https://amoy.polygonscan.com/tx/${bestMatch.artwork.blockchainTxHash}`
          : null,
      },
    });
  } catch (error) {
    console.error("Video detection error:", error);
    return NextResponse.json(
      {
        error: "Failed to detect watermark in video",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        console.warn("Failed to cleanup temp directory:", tempDir);
      }
    }
  }
}
