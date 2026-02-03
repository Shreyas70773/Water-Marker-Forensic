import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import sharp from "sharp";

import { ImageWatermarkEngine } from "@/lib/watermark/image-watermark";
import { HashEngine } from "@/lib/crypto/hasher";
import { EvidenceSigner } from "@/lib/crypto/signer";
import { BlockchainNotary } from "@/lib/crypto/blockchain";
import { generateWorkId } from "@/lib/utils/work-id";
import {
  generateCanonicalPayload,
  generateWatermarkPayload,
  detectAspectRatio,
} from "@/lib/utils/payload-generator";
import { computeCombinedHash } from "@/lib/watermark/perceptual-hash";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const authResult = await auth();
    const clerkId = authResult?.userId;

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mediaType = (formData.get("mediaType") as string) || "IMAGE";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const validImageTypes = ["image/jpeg", "image/png", "image/webp"];
    if (mediaType === "IMAGE" && !validImageTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid image type. Supported: JPEG, PNG, WebP" },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = mediaType === "IMAGE" ? 10 * 1024 * 1024 : 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Max: ${maxSize / 1024 / 1024}MB` },
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

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: "Could not read image dimensions" },
        { status: 400 }
      );
    }

    // Generate work ID
    const workId = generateWorkId(mediaType as "IMAGE" | "VIDEO");

    // Detect aspect ratio
    const aspectRatio = detectAspectRatio(metadata.width, metadata.height);

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
      mediaType as "IMAGE" | "VIDEO",
      aspectRatio
    );
    const payloadHash = HashEngine.hashPayload(canonicalPayload);
    const watermarkPayload = generateWatermarkPayload(userProfile, workId);

    // Upload original file to Convex
    const uploadUrl = await convex.mutation(api.storage.generateUploadUrl);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload original file");
    }

    const { storageId: originalFileId } = await uploadResponse.json();

    // Create artwork record
    const artworkId = await convex.mutation(api.artworks.create, {
      userId: user._id,
      workId,
      mediaType: mediaType as "IMAGE" | "VIDEO",
      aspectRatio,
      originalFileId: originalFileId as Id<"_storage">,
      originalFileName: file.name,
      originalFileSize: file.size,
      originalHash,
      payloadHash,
      watermarkPayload,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || "unknown",
      },
    });

    // Embed watermark
    const engine = new ImageWatermarkEngine();
    const { watermarkedBuffer, embeddingParams, qualityMetrics } =
      await engine.embed(buffer, watermarkPayload, workId, payloadHash);

    // Upload watermarked file
    const watermarkedUploadUrl = await convex.mutation(
      api.storage.generateUploadUrl
    );
    const watermarkedUploadResponse = await fetch(watermarkedUploadUrl, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: watermarkedBuffer,
    });

    if (!watermarkedUploadResponse.ok) {
      throw new Error("Failed to upload watermarked file");
    }

    const { storageId: watermarkedFileId } =
      await watermarkedUploadResponse.json();

    // Compute perceptual hashes for robust detection
    const hashes = await computeCombinedHash(watermarkedBuffer);
    console.log(`[WATERMARK] Computed perceptual hashes: pHash=${hashes.pHash}, aHash=${hashes.aHash}, dHash=${hashes.dHash}`);

    // Update artwork with watermark data and hashes
    await convex.mutation(api.artworks.updateWithWatermark, {
      id: artworkId,
      watermarkedFileId: watermarkedFileId as Id<"_storage">,
      embeddingParams: {
        strength: embeddingParams.strength,
        eccBytes: embeddingParams.eccBytes,
        coefficientSeed: embeddingParams.coefficientSeed,
        blockSize: embeddingParams.blockSize,
      },
      qualityMetrics: {
        psnr: qualityMetrics?.psnr ?? 0,
        ssim: qualityMetrics?.ssim ?? 0,
        perceptuallyIndistinguishable:
          (qualityMetrics?.psnr ?? 0) >= 40 && (qualityMetrics?.ssim ?? 0) >= 0.95,
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

    // Blockchain notarization (optional - may fail if not configured)
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
      // Still mark as completed even without blockchain
      await convex.mutation(api.artworks.markCompleted, { id: artworkId });
    }

    const processingTime = Date.now() - processStartTime;

    // Get download URL - use our API route to properly serve the file
    const downloadUrl = `/api/download/${watermarkedFileId}`;

    return NextResponse.json({
      success: true,
      workId,
      artworkId,
      processingTimeMs: processingTime,
      qualityMetrics: {
        psnr: qualityMetrics?.psnr ?? 0,
        ssim: qualityMetrics?.ssim ?? 0,
      },
      downloadUrl,
      blockchainVerification: blockchainResult
        ? `https://amoy.polygonscan.com/tx/${blockchainResult.txHash}`
        : null,
    });
  } catch (error) {
    console.error("Watermarking error:", error);
    return NextResponse.json(
      {
        error: "Failed to process file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
