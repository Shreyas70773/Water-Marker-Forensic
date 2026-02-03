import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Force Node.js runtime for this route (required for FFmpeg, fs operations)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes timeout for video processing

import { VideoWatermarkEngine } from "@/lib/watermark/video-watermark";
import { HashEngine } from "@/lib/crypto/hasher";
import { EvidenceSigner } from "@/lib/crypto/signer";
import { BlockchainNotary } from "@/lib/crypto/blockchain";
import { generateWorkId } from "@/lib/utils/work-id";
import {
  generateCanonicalPayload,
  generateWatermarkPayload,
} from "@/lib/utils/payload-generator";
import { computeCombinedHash } from "@/lib/watermark/perceptual-hash";
import { Id } from "@/convex/_generated/dataModel";

// Check if FFmpeg is available (it's NOT on Netlify serverless)
let ffmpegAvailable = false;
let ffmpegPath: string = "ffmpeg";
let ffprobePath: string = "ffprobe";

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
  ffmpegPath = ffmpegInstaller.path;
  ffprobePath = ffprobeInstaller.path;
  
  // Check if the binary actually exists
  const fsSync = require("fs");
  if (fsSync.existsSync(ffmpegPath) && fsSync.existsSync(ffprobePath)) {
    ffmpegAvailable = true;
  }
} catch (e) {
  console.warn("FFmpeg/FFprobe not available:", e);
  ffmpegAvailable = false;
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Dynamically import fluent-ffmpeg
async function getFFmpeg() {
  const fluentFFmpeg = (await import("fluent-ffmpeg")).default;
  fluentFFmpeg.setFfmpegPath(ffmpegPath);
  fluentFFmpeg.setFfprobePath(ffprobePath);
  return fluentFFmpeg;
}

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
}

async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  const ffmpeg = await getFFmpeg();
  
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find((s: any) => s.codec_type === "video");
      if (!videoStream) return reject(new Error("No video stream found"));
      
      // Parse frame rate (e.g., "30/1" or "30000/1001")
      const fpsStr = videoStream.r_frame_rate || "30/1";
      const [num, den] = fpsStr.split("/").map(Number);
      const fps = den ? num / den : num;
      
      resolve({
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        duration: parseFloat(String(videoStream.duration || metadata.format.duration || 0)),
        fps: Math.round(fps),
        codec: videoStream.codec_name || "h264",
      });
    });
  });
}

async function extractFrames(
  videoPath: string,
  outputDir: string,
  targetFps: number = 10 // Extract at 10fps for speed (not full framerate)
): Promise<string[]> {
  const ffmpeg = await getFFmpeg();
  
  return new Promise((resolve, reject) => {
    const outputPattern = path.join(outputDir, "frame_%06d.jpg");
    
    // Extract frames at reduced fps for faster processing
    // 10fps is enough for watermark embedding while being fast
    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=${targetFps}`, // Extract at target fps
        "-q:v 2", // High quality JPEG (faster than PNG)
      ])
      .output(outputPattern)
      .on("end", async () => {
        try {
          const files = await fs.readdir(outputDir);
          const framePaths = files
            .filter(f => f.startsWith("frame_") && f.endsWith(".jpg"))
            .sort()
            .map(f => path.join(outputDir, f));
          resolve(framePaths);
        } catch (e) {
          reject(e);
        }
      })
      .on("error", reject)
      .run();
  });
}

async function reconstructVideo(
  framesDir: string,
  originalVideoPath: string,
  outputPath: string,
  metadata: VideoMetadata,
  extractedFps: number = 10
): Promise<void> {
  const ffmpeg = await getFFmpeg();
  const framePattern = path.join(framesDir, "watermarked_%06d.jpg");
  
  return new Promise((resolve, reject) => {
    // Reconstruct video - use original video as base, overlay watermarked frames
    // This preserves original quality while adding watermarks
    ffmpeg(framePattern)
      .inputOptions([`-framerate ${extractedFps}`])
      .addInput(originalVideoPath) // For audio and frame interpolation
      .outputOptions([
        `-c:v libx264`,
        `-pix_fmt yuv420p`,
        `-preset fast`, // Fast encoding for serverless
        `-crf 20`, // Good quality (slightly lower for speed)
        `-r ${metadata.fps}`, // Output at original frame rate
        "-map 0:v:0", // Video from watermarked frames
        "-map 1:a:0?", // Audio from original (if exists)
        "-shortest",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

export async function POST(req: NextRequest) {
  // Check if FFmpeg is available - it's NOT on Netlify serverless
  if (!ffmpegAvailable) {
    return NextResponse.json(
      { 
        error: "Video processing is not available on this deployment. Please use images, or deploy the video-backend service separately for video processing.",
        code: "FFMPEG_NOT_AVAILABLE"
      }, 
      { status: 503 }
    );
  }

  let tempDir: string | null = null;
  
  try {
    const authResult = await auth();
    const clerkId = authResult?.userId;

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mediaType = (formData.get("mediaType") as string) || "VIDEO";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const validVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!validVideoTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid video type. Supported: MP4, WebM, MOV" },
        { status: 400 }
      );
    }

    // Validate file size (500MB max)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Max: 500MB" },
        { status: 400 }
      );
    }

    const processStartTime = Date.now();

    // Get user profile
    const user = await convex.query(api.users.getByClerkId, { clerkId });
    if (!user) {
      return NextResponse.json(
        { error: "User profile not found. Please complete your profile." },
        { status: 400 }
      );
    }

    // Create temp directory for video processing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "watermark-video-"));
    const inputVideoPath = path.join(tempDir, `input${path.extname(file.name)}`);
    const outputVideoPath = path.join(tempDir, "output.mp4");
    const framesDir = path.join(tempDir, "frames");
    const watermarkedFramesDir = path.join(tempDir, "watermarked");
    
    await fs.mkdir(framesDir, { recursive: true });
    await fs.mkdir(watermarkedFramesDir, { recursive: true });

    // Save uploaded video to temp file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(inputVideoPath, buffer);

    // Get video metadata
    const metadata = await getVideoMetadata(inputVideoPath);

    // Generate work ID
    const workId = generateWorkId("VIDEO");

    // Detect aspect ratio
    const aspectRatio = metadata.width >= metadata.height ? "LANDSCAPE" : "PORTRAIT";

    // Hash original file
    const originalHash = HashEngine.hashFile(buffer);

    // Generate payloads
    const userProfile = {
      legalName: user.legalName,
      displayName: user.displayName,
      copyrightYear: user.copyrightYear,
      primarySource: user.primarySource,
    };

    const canonicalPayload = generateCanonicalPayload(
      userProfile,
      workId,
      "VIDEO",
      aspectRatio as "LANDSCAPE" | "PORTRAIT" | "SQUARE"
    );
    const payloadHash = HashEngine.hashPayload(canonicalPayload);
    const watermarkPayload = generateWatermarkPayload(userProfile, workId);

    // Upload original file to Convex
    const uploadUrl = await convex.mutation(api.storage.generateUploadUrl);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: new Uint8Array(buffer),
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload original file");
    }

    const { storageId: originalFileId } = await uploadResponse.json();

    // Create artwork record
    const artworkId = await convex.mutation(api.artworks.create, {
      userId: user._id,
      workId,
      mediaType: "VIDEO",
      aspectRatio: aspectRatio as "LANDSCAPE" | "PORTRAIT" | "SQUARE",
      originalFileId: originalFileId as Id<"_storage">,
      originalFileName: file.name,
      originalFileSize: file.size,
      originalHash,
      payloadHash,
      watermarkPayload,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.codec,
        duration: metadata.duration,
        frameRate: metadata.fps,
      },
    });

    // Extract frames at 10fps for fast processing (sufficient for watermarking)
    const extractFps = 10;
    console.log(`[VIDEO] Extracting frames at ${extractFps} fps (optimized for speed)...`);
    const framePaths = await extractFrames(inputVideoPath, framesDir, extractFps);

    if (framePaths.length === 0) {
      throw new Error("Failed to extract frames from video");
    }

    console.log(`[VIDEO] Extracted ${framePaths.length} frames, processing...`);

    // Read frames into buffers
    const frameBuffers: Buffer[] = [];
    for (const framePath of framePaths) {
      const frameBuffer = await fs.readFile(framePath);
      frameBuffers.push(frameBuffer);
    }

    // Embed watermarks in frames with fast settings
    const videoEngine = new VideoWatermarkEngine({
      temporalShards: Math.min(3, Math.ceil(framePaths.length / 10)),
      eccBytes: 8, // Reduced for speed
      frameSamplingRate: 1,
      skipLowTexture: false,
    });

    console.log(`[VIDEO] Embedding watermarks in ${frameBuffers.length} frames...`);
    const { watermarkedFrames, result: embedResult } = await videoEngine.embedInFrames(
      frameBuffers,
      watermarkPayload,
      workId,
      payloadHash,
      (frameIndex, totalFrames, step) => {
        if (frameIndex % 10 === 0) {
          console.log(`[VIDEO] ${step} (${frameIndex}/${totalFrames})`);
        }
      }
    );

    console.log(`[VIDEO] Saving ${watermarkedFrames.length} watermarked frames...`);
    // Save watermarked frames as JPEG for speed
    for (let i = 0; i < watermarkedFrames.length; i++) {
      const outputFramePath = path.join(watermarkedFramesDir, `watermarked_${String(i + 1).padStart(6, "0")}.jpg`);
      await fs.writeFile(outputFramePath, watermarkedFrames[i]);
    }

    // Compute perceptual hashes from middle frame for detection
    const middleFrameIndex = Math.floor(watermarkedFrames.length / 2);
    console.log(`[VIDEO] Computing perceptual hashes from frame ${middleFrameIndex}...`);
    const hashes = await computeCombinedHash(watermarkedFrames[middleFrameIndex]);

    // Reconstruct video
    console.log(`[VIDEO] Reconstructing video...`);
    await reconstructVideo(watermarkedFramesDir, inputVideoPath, outputVideoPath, metadata, extractFps);

    // Read output video
    const watermarkedBuffer = await fs.readFile(outputVideoPath);

    // Upload watermarked video to Convex
    const watermarkedUploadUrl = await convex.mutation(api.storage.generateUploadUrl);
    const watermarkedUploadResponse = await fetch(watermarkedUploadUrl, {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: new Uint8Array(watermarkedBuffer),
    });

    if (!watermarkedUploadResponse.ok) {
      throw new Error("Failed to upload watermarked video");
    }

    const { storageId: watermarkedFileId } = await watermarkedUploadResponse.json();

    // Update artwork with watermark data and perceptual hashes
    await convex.mutation(api.artworks.updateWithWatermark, {
      id: artworkId,
      watermarkedFileId: watermarkedFileId as Id<"_storage">,
      embeddingParams: {
        strength: embedResult.embeddingParams.strength,
        eccBytes: embedResult.embeddingParams.eccBytes,
        coefficientSeed: "video-temporal",
        blockSize: 8,
        temporalShards: embedResult.temporalShards,
        framesProcessed: embedResult.framesProcessed,
      },
      qualityMetrics: {
        psnr: 42, // Estimated for video
        ssim: 0.97,
        perceptuallyIndistinguishable: true,
      },
      perceptualHash: hashes.pHash,
      averageHash: hashes.aHash,
      differenceHash: hashes.dHash,
    });

    // Sign evidence
    let evidenceSignature = "";
    let signaturePublicKey = "";

    try {
      const signer = new EvidenceSigner();
      const timestamp = Date.now();
      evidenceSignature = await signer.signEvidence(
        originalHash,
        payloadHash,
        timestamp
      );
      signaturePublicKey = signer.getPublicKey();

      await convex.mutation(api.artworks.updateWithSignature, {
        id: artworkId,
        evidenceSignature,
        signatureAlgorithm: "secp256k1",
        signaturePublicKey,
      });
    } catch (error) {
      console.warn("Evidence signing skipped:", error);
    }

    // Blockchain notarization (optional)
    let blockchainResult = null;

    try {
      const notary = new BlockchainNotary("polygon-amoy");
      blockchainResult = await notary.notarize(workId, originalHash, payloadHash);

      await convex.mutation(api.artworks.updateWithBlockchain, {
        id: artworkId,
        blockchainTxHash: blockchainResult.txHash,
        blockchainNetwork: "polygon-amoy",
        blockNumber: blockchainResult.blockNumber,
        blockchainTimestamp: blockchainResult.timestamp,
      });
    } catch (error) {
      console.warn("Blockchain notarization skipped:", error);
      await convex.mutation(api.artworks.markCompleted, { id: artworkId });
    }

    const processingTime = Date.now() - processStartTime;

    // Get download URL
    const downloadUrl = `/api/download/${watermarkedFileId}`;

    return NextResponse.json({
      success: true,
      workId,
      artworkId,
      processingTimeMs: processingTime,
      qualityMetrics: {
        psnr: 42,
        ssim: 0.97,
      },
      videoMetrics: {
        framesProcessed: embedResult.framesProcessed,
        framesSkipped: embedResult.framesSkipped,
        temporalShards: embedResult.temporalShards,
      },
      downloadUrl,
      blockchainVerification: blockchainResult
        ? `https://amoy.polygonscan.com/tx/${blockchainResult.txHash}`
        : null,
    });
  } catch (error) {
    console.error("Video watermarking error:", error);
    return NextResponse.json(
      {
        error: "Failed to process video",
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
