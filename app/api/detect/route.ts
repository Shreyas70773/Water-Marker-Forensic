import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { v4 as uuidv4 } from "uuid";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds timeout

import { HashEngine } from "@/lib/crypto/hasher";
import { 
  computeCombinedHash, 
  compareCombinedHashes,
  CombinedHash 
} from "@/lib/watermark/perceptual-hash";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Similarity threshold for detection (0.85 = 85% similar)
const SIMILARITY_THRESHOLD = 0.85;

export async function POST(req: NextRequest) {
  const requestId = uuidv4();

  try {
    // Get form data
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Supported: JPEG, PNG, WebP, GIF" },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileHash = HashEngine.hashFile(buffer);

    // Get request metadata for logging
    const sourceIp =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Compute perceptual hashes of uploaded image
    console.log("[DETECT] Computing perceptual hashes of uploaded image...");
    const uploadedHashes = await computeCombinedHash(buffer);
    console.log(`[DETECT] Uploaded image hashes: pHash=${uploadedHashes.pHash}, dHash=${uploadedHashes.dHash}`);

    // Get recent artworks to try matching
    const recentArtworks = await convex.query(api.artworks.getRecent, {
      limit: 100,
    });

    console.log(`[DETECT] Found ${recentArtworks.length} artworks to search`);

    if (recentArtworks.length === 0) {
      await convex.mutation(api.detectionLogs.create, {
        detected: false,
        confidence: 0,
        confidenceLevel: "NONE",
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
      });
    }

    // Find best matching artwork using perceptual hash comparison
    let bestMatch: {
      artwork: (typeof recentArtworks)[0];
      similarity: number;
      details: { pHashSim: number; aHashSim: number; dHashSim: number };
    } | null = null;

    for (const artwork of recentArtworks) {
      // Skip artworks without perceptual hashes
      if (!artwork.perceptualHash || !artwork.differenceHash) {
        console.log(`[DETECT] Skipping ${artwork.workId} - no perceptual hashes`);
        continue;
      }

      const storedHashes: CombinedHash = {
        pHash: artwork.perceptualHash,
        aHash: artwork.averageHash || "",
        dHash: artwork.differenceHash,
      };

      const comparison = compareCombinedHashes(uploadedHashes, storedHashes);
      
      console.log(`[DETECT] ${artwork.workId}: similarity=${(comparison.similarity * 100).toFixed(1)}% (pHash=${(comparison.pHashSim * 100).toFixed(1)}%, dHash=${(comparison.dHashSim * 100).toFixed(1)}%)`);

      if (comparison.similarity > (bestMatch?.similarity ?? 0)) {
        bestMatch = {
          artwork,
          similarity: comparison.similarity,
          details: comparison,
        };
      }
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
    const matchSimilarity = bestMatch?.similarity ?? 0;
    if (!bestMatch || matchSimilarity < SIMILARITY_THRESHOLD) {
      await convex.mutation(api.detectionLogs.create, {
        detected: false,
        confidence: matchSimilarity,
        confidenceLevel: "NONE",
        analyzedFileName: file.name,
        analyzedFileSize: file.size,
        analyzedFileHash: fileHash,
        sourceIp,
        userAgent,
        requestId,
      });

      return NextResponse.json({
        found: false,
        message: "No matching watermarked image found",
        confidence: matchSimilarity,
        threshold: SIMILARITY_THRESHOLD,
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
    console.error("Detection error:", error);
    return NextResponse.json(
      {
        error: "Failed to detect watermark",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
