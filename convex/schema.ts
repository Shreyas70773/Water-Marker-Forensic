import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // User profiles with author identity
  users: defineTable({
    clerkId: v.string(),
    legalName: v.string(),
    displayName: v.string(),
    email: v.string(),
    copyrightYear: v.number(),
    primarySource: v.string(), // e.g., Behance URL
    socialLinks: v.object({
      instagram: v.optional(v.string()),
      pinterest: v.optional(v.string()),
      behance: v.optional(v.string()),
      twitter: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
    signingKeyId: v.string(), // Reference to server-side signing key
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // Watermarked artworks with complete evidence chain
  artworks: defineTable({
    userId: v.id("users"),
    workId: v.string(), // "GJP-MEDIA-2026-XXXXXX"
    mediaType: v.union(v.literal("IMAGE"), v.literal("VIDEO")),
    aspectRatio: v.string(), // "16:9", "4:3", "1:1", "custom"

    // Original file
    // Note: originalFileId is optional to support storage cleanup where
    // files are deleted but the forensic evidence record is preserved.
    originalFileId: v.optional(v.id("_storage")),
    originalFileName: v.string(),
    originalFileSize: v.number(),

    // Watermarked file
    watermarkedFileId: v.optional(v.id("_storage")),

    // Cryptographic evidence
    originalHash: v.string(), // SHA-256 of original file
    payloadHash: v.string(), // SHA-256 of canonical payload
    watermarkPayload: v.string(), // The embedded payload string

    // Perceptual hashes for robust detection
    perceptualHash: v.optional(v.string()), // pHash
    averageHash: v.optional(v.string()), // aHash  
    differenceHash: v.optional(v.string()), // dHash

    // Server-side signature (forensic proof)
    evidenceSignature: v.optional(v.string()), // Sign(mediaHash + payloadHash + timestamp)
    signatureAlgorithm: v.optional(v.string()), // "secp256k1"
    signaturePublicKey: v.optional(v.string()), // Public key for verification

    // Blockchain notarization
    blockchainTxHash: v.optional(v.string()),
    blockchainNetwork: v.optional(v.string()), // "polygon-mumbai" or "polygon"
    blockNumber: v.optional(v.number()),
    blockchainTimestamp: v.optional(v.number()),

    // Embedding parameters (for forensic audit trail)
    embeddingParams: v.object({
      strength: v.number(), // 0.01-0.05
      eccBytes: v.number(), // Error correction bytes
      coefficientSeed: v.string(), // For reproducibility
      blockSize: v.optional(v.number()), // DCT block size (default 8)
      framesProcessed: v.optional(v.number()), // Videos only
      temporalShards: v.optional(v.number()), // Videos only
    }),

    // Media metadata
    metadata: v.object({
      width: v.number(),
      height: v.number(),
      duration: v.optional(v.number()), // For videos (seconds)
      frameRate: v.optional(v.number()),
      codec: v.optional(v.string()),
      bitrate: v.optional(v.number()),
      format: v.string(), // "jpeg", "png", "mp4", etc.
    }),

    // Quality metrics (required for legal claims)
    qualityMetrics: v.object({
      psnr: v.number(), // Peak Signal-to-Noise Ratio
      ssim: v.number(), // Structural Similarity Index
      perceptuallyIndistinguishable: v.boolean(), // PSNR >= 40 && SSIM >= 0.95
    }),

    // Processing status
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    processingError: v.optional(v.string()),

    // Timestamps
    createdUtc: v.string(), // ISO-8601 timestamp
    uploadedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_work_id", ["workId"])
    .index("by_blockchain_tx", ["blockchainTxHash"])
    .index("by_status", ["status"])
    .index("by_user_status", ["userId", "status"]),

  // Processing jobs for real-time progress tracking
  processingJobs: defineTable({
    artworkId: v.optional(v.id("artworks")),
    userId: v.id("users"),
    workId: v.string(),
    mediaType: v.union(v.literal("IMAGE"), v.literal("VIDEO")),

    // Status tracking
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("watermarking"),
      v.literal("notarizing"),
      v.literal("completed"),
      v.literal("failed")
    ),

    // Progress (0-100)
    progress: v.number(),
    currentStep: v.optional(v.string()),

    // Input file
    inputFileId: v.optional(v.id("_storage")),
    inputFileName: v.optional(v.string()),

    // Output (when completed)
    outputFileId: v.optional(v.id("_storage")),

    // Error handling
    error: v.optional(v.string()),
    errorDetails: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_work_id", ["workId"])
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_artwork", ["artworkId"]),

  // Detection logs (forensic audit trail)
  detectionLogs: defineTable({
    artworkId: v.optional(v.id("artworks")),
    workId: v.optional(v.string()),

    // Detection results
    detected: v.boolean(),
    confidence: v.number(), // 0.0-1.0
    confidenceLevel: v.optional(
      v.union(
        v.literal("EXCELLENT"),
        v.literal("GOOD"),
        v.literal("FAIR"),
        v.literal("MARGINAL"),
        v.literal("NONE")
      )
    ),

    // ECC recovery metrics
    framesAnalyzed: v.optional(v.number()), // For videos
    eccRecoveryRate: v.optional(v.string()), // e.g., "29/32 bits"
    errorsFound: v.optional(v.number()),
    errorsCorrected: v.optional(v.number()),

    // Extracted payload
    detectedPayload: v.optional(v.string()),

    // File info
    analyzedFileName: v.optional(v.string()),
    analyzedFileSize: v.optional(v.number()),
    analyzedFileHash: v.optional(v.string()),

    // Request metadata (for forensic tracking)
    sourceIp: v.string(),
    userAgent: v.string(),
    requestId: v.string(),

    // Timestamp
    detectedAt: v.number(),
  })
    .index("by_artwork", ["artworkId"])
    .index("by_work_id", ["workId"])
    .index("by_detected_at", ["detectedAt"]),

  // Forensic reports generated
  forensicReports: defineTable({
    artworkId: v.id("artworks"),
    detectionLogId: v.optional(v.id("detectionLogs")),

    // Report file
    reportFileId: v.id("_storage"),
    reportFileName: v.string(),

    // Report metadata
    reportType: v.union(
      v.literal("ownership"),
      v.literal("detection"),
      v.literal("full")
    ),

    // Generated by
    generatedBy: v.optional(v.id("users")),
    generatedAt: v.number(),
  })
    .index("by_artwork", ["artworkId"])
    .index("by_user", ["generatedBy"]),
});
