import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a new artwork record
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    workId: v.string(),
    mediaType: v.union(v.literal("IMAGE"), v.literal("VIDEO")),
    aspectRatio: v.string(),
    originalFileId: v.id("_storage"),
    originalFileName: v.string(),
    originalFileSize: v.number(),
    originalHash: v.string(),
    payloadHash: v.string(),
    watermarkPayload: v.string(),
    metadata: v.object({
      width: v.number(),
      height: v.number(),
      duration: v.optional(v.number()),
      frameRate: v.optional(v.number()),
      codec: v.optional(v.string()),
      bitrate: v.optional(v.number()),
      format: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("artworks", {
      ...args,
      watermarkedFileId: undefined,
      evidenceSignature: undefined,
      signatureAlgorithm: undefined,
      signaturePublicKey: undefined,
      blockchainTxHash: undefined,
      blockchainNetwork: undefined,
      blockNumber: undefined,
      blockchainTimestamp: undefined,
      embeddingParams: {
        strength: 0,
        eccBytes: 0,
        coefficientSeed: "",
        blockSize: 8,
      },
      qualityMetrics: {
        psnr: 0,
        ssim: 0,
        perceptuallyIndistinguishable: false,
      },
      status: "pending",
      processingError: undefined,
      createdUtc: new Date().toISOString(),
      uploadedAt: now,
      processedAt: undefined,
    });
  },
});

/**
 * Update artwork with watermarking results
 */
export const updateWithWatermark = mutation({
  args: {
    id: v.id("artworks"),
    watermarkedFileId: v.id("_storage"),
    embeddingParams: v.object({
      strength: v.number(),
      eccBytes: v.number(),
      coefficientSeed: v.string(),
      blockSize: v.optional(v.number()),
      framesProcessed: v.optional(v.number()),
      temporalShards: v.optional(v.number()),
    }),
    qualityMetrics: v.object({
      psnr: v.number(),
      ssim: v.number(),
      perceptuallyIndistinguishable: v.boolean(),
    }),
    perceptualHash: v.optional(v.string()),
    averageHash: v.optional(v.string()),
    differenceHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    await ctx.db.patch(id, {
      ...updates,
      status: "processing" as const,
      processedAt: Date.now(),
    });
  },
});

/**
 * Update artwork with evidence signing
 */
export const updateWithSignature = mutation({
  args: {
    id: v.id("artworks"),
    evidenceSignature: v.string(),
    signatureAlgorithm: v.string(),
    signaturePublicKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

/**
 * Update artwork with blockchain notarization
 */
export const updateWithBlockchain = mutation({
  args: {
    id: v.id("artworks"),
    blockchainTxHash: v.string(),
    blockchainNetwork: v.string(),
    blockNumber: v.number(),
    blockchainTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    await ctx.db.patch(id, {
      ...updates,
      status: "completed" as const,
    });
  },
});

/**
 * Mark artwork as failed
 */
export const markFailed = mutation({
  args: {
    id: v.id("artworks"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      processingError: args.error,
    });
  },
});

/**
 * Delete artwork and clean up storage files
 * User can download evidence first, then delete to save space
 */
export const deleteWithCleanup = mutation({
  args: {
    id: v.id("artworks"),
    deleteOriginal: v.optional(v.boolean()), // Keep original by default
    deleteWatermarked: v.optional(v.boolean()), // Delete watermarked to save space
  },
  handler: async (ctx, args) => {
    const artwork = await ctx.db.get(args.id);
    if (!artwork) {
      throw new Error("Artwork not found");
    }

    // Delete storage files if requested
    if (args.deleteOriginal && artwork.originalFileId) {
      await ctx.storage.delete(artwork.originalFileId);
    }
    
    if (args.deleteWatermarked && artwork.watermarkedFileId) {
      await ctx.storage.delete(artwork.watermarkedFileId);
    }

    // Delete the artwork record
    await ctx.db.delete(args.id);

    return { success: true };
  },
});

/**
 * Delete only the storage files but keep the evidence record
 * Useful for saving space while retaining proof
 */
export const cleanupStorageOnly = mutation({
  args: {
    id: v.id("artworks"),
    keepOriginal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const artwork = await ctx.db.get(args.id);
    if (!artwork) {
      throw new Error("Artwork not found");
    }

    let deletedOriginal = false;
    let deletedWatermarked = false;

    // Delete original if not keeping
    if (!args.keepOriginal && artwork.originalFileId) {
      await ctx.storage.delete(artwork.originalFileId);
      deletedOriginal = true;
    }
    
    // Always delete watermarked to save space (user already downloaded it)
    if (artwork.watermarkedFileId) {
      await ctx.storage.delete(artwork.watermarkedFileId);
      deletedWatermarked = true;
    }

    // Update artwork to mark files as cleaned up
    await ctx.db.patch(args.id, {
      originalFileId: args.keepOriginal ? artwork.originalFileId : undefined,
      watermarkedFileId: undefined,
      // Add a flag to indicate files were cleaned up
      processingError: artwork.processingError || "FILES_CLEANED_UP",
    });

    return { 
      success: true, 
      deletedOriginal, 
      deletedWatermarked,
      message: "Files cleaned up. Evidence record preserved."
    };
  },
});

/**
 * Batch cleanup old artworks (for admin/cron)
 */
export const cleanupOldArtworks = mutation({
  args: {
    userId: v.id("users"),
    olderThanDays: v.number(),
    keepEvidence: v.boolean(), // If true, only delete files but keep records
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const artworks = await ctx.db
      .query("artworks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const oldArtworks = artworks.filter(a => a.uploadedAt < cutoffTime);
    let cleaned = 0;

    for (const artwork of oldArtworks) {
      if (artwork.originalFileId) {
        await ctx.storage.delete(artwork.originalFileId);
      }
      if (artwork.watermarkedFileId) {
        await ctx.storage.delete(artwork.watermarkedFileId);
      }

      if (args.keepEvidence) {
        // Just clear the file references
        await ctx.db.patch(artwork._id, {
          originalFileId: undefined,
          watermarkedFileId: undefined,
        });
      } else {
        await ctx.db.delete(artwork._id);
      }
      cleaned++;
    }

    return { cleaned, total: oldArtworks.length };
  },
});

/**
 * Mark artwork as completed (without blockchain)
 */
export const markCompleted = mutation({
  args: {
    id: v.id("artworks"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "completed",
    });
  },
});

/**
 * Get artwork by ID
 */
export const get = query({
  args: { id: v.id("artworks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get artwork by work ID
 */
export const getByWorkId = query({
  args: { workId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artworks")
      .withIndex("by_work_id", (q) => q.eq("workId", args.workId))
      .first();
  },
});

/**
 * Get artworks by user
 */
export const listByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("artworks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});

/**
 * Get recent artworks (for detection matching)
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    // Get all artworks with completed or processing status
    const artworks = await ctx.db
      .query("artworks")
      .order("desc")
      .take(limit);
    
    // For now, return all artworks for debugging
    // In production, should filter by status === "completed"
    console.log(`[getRecent] Found ${artworks.length} artworks, statuses: ${artworks.map(a => a.status).join(', ')}`);
    
    return artworks;
  },
});

/**
 * Debug: Get all artworks regardless of status
 */
export const getAllForDebug = query({
  args: {},
  handler: async (ctx) => {
    const artworks = await ctx.db.query("artworks").collect();
    return artworks.map(a => ({
      workId: a.workId,
      status: a.status,
      embeddingParams: a.embeddingParams,
    }));
  },
});

/**
 * Get artwork with user data
 */
export const getWithUser = query({
  args: { id: v.id("artworks") },
  handler: async (ctx, args) => {
    const artwork = await ctx.db.get(args.id);
    if (!artwork) return null;

    const user = await ctx.db.get(artwork.userId);
    return { artwork, user };
  },
});

/**
 * Get artwork statistics for a user
 */
export const getStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const artworks = await ctx.db
      .query("artworks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      total: artworks.length,
      images: artworks.filter((a) => a.mediaType === "IMAGE").length,
      videos: artworks.filter((a) => a.mediaType === "VIDEO").length,
      completed: artworks.filter((a) => a.status === "completed").length,
      pending: artworks.filter((a) => a.status === "pending" || a.status === "processing").length,
      failed: artworks.filter((a) => a.status === "failed").length,
    };
  },
});

/**
 * Get complete evidence bundle for export/download
 * Contains all cryptographic proof - user can save this and delete files
 */
export const getEvidenceBundle = query({
  args: { id: v.id("artworks") },
  handler: async (ctx, args) => {
    const artwork = await ctx.db.get(args.id);
    if (!artwork) return null;

    const user = await ctx.db.get(artwork.userId);

    // Get detection history
    const detectionLogs = await ctx.db
      .query("detectionLogs")
      .withIndex("by_artwork", (q) => q.eq("artworkId", args.id))
      .collect();

    return {
      // Evidence metadata
      exportedAt: new Date().toISOString(),
      version: "1.0",
      
      // Work identification
      workId: artwork.workId,
      mediaType: artwork.mediaType,
      originalFileName: artwork.originalFileName,
      originalFileSize: artwork.originalFileSize,
      aspectRatio: artwork.aspectRatio,
      
      // Owner information
      owner: {
        legalName: user?.legalName,
        displayName: user?.displayName,
        copyrightYear: user?.copyrightYear,
        primarySource: user?.primarySource,
      },
      
      // Cryptographic evidence (THIS IS THE IMPORTANT PART)
      cryptographicProof: {
        originalHash: artwork.originalHash,
        payloadHash: artwork.payloadHash,
        watermarkPayload: artwork.watermarkPayload,
        evidenceSignature: artwork.evidenceSignature,
        signatureAlgorithm: artwork.signatureAlgorithm,
        signaturePublicKey: artwork.signaturePublicKey,
      },
      
      // Perceptual hashes for detection
      perceptualHashes: {
        pHash: artwork.perceptualHash,
        aHash: artwork.averageHash,
        dHash: artwork.differenceHash,
      },
      
      // Blockchain proof
      blockchainProof: artwork.blockchainTxHash ? {
        txHash: artwork.blockchainTxHash,
        network: artwork.blockchainNetwork,
        blockNumber: artwork.blockNumber,
        timestamp: artwork.blockchainTimestamp,
        verificationUrl: `https://amoy.polygonscan.com/tx/${artwork.blockchainTxHash}`,
      } : null,
      
      // Embedding parameters (for forensic verification)
      embeddingParams: artwork.embeddingParams,
      
      // Quality metrics
      qualityMetrics: artwork.qualityMetrics,
      
      // Media metadata
      metadata: artwork.metadata,
      
      // Timestamps
      timestamps: {
        created: artwork.createdUtc,
        uploaded: artwork.uploadedAt,
        processed: artwork.processedAt,
      },
      
      // Detection history
      detectionHistory: detectionLogs.map(log => ({
        detectedAt: log.detectedAt,
        detected: log.detected,
        confidence: log.confidence,
        confidenceLevel: log.confidenceLevel,
        analyzedFileName: log.analyzedFileName,
        sourceIp: log.sourceIp,
      })),
      
      // Instructions for verification
      verificationInstructions: `
To verify this evidence:
1. The originalHash is a SHA-256 hash of your original file
2. The payloadHash is a SHA-256 hash of the embedded watermark data
3. The evidenceSignature can be verified with the signaturePublicKey
4. The blockchain transaction provides an immutable timestamp
5. Visit the verificationUrl to see the blockchain record
      `.trim(),
    };
  },
});
