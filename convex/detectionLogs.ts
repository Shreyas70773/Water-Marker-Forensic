import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a detection log entry
 */
export const create = mutation({
  args: {
    artworkId: v.optional(v.id("artworks")),
    workId: v.optional(v.string()),
    detected: v.boolean(),
    confidence: v.number(),
    confidenceLevel: v.optional(
      v.union(
        v.literal("EXCELLENT"),
        v.literal("GOOD"),
        v.literal("FAIR"),
        v.literal("MARGINAL"),
        v.literal("NONE")
      )
    ),
    framesAnalyzed: v.optional(v.number()),
    eccRecoveryRate: v.optional(v.string()),
    errorsFound: v.optional(v.number()),
    errorsCorrected: v.optional(v.number()),
    detectedPayload: v.optional(v.string()),
    analyzedFileName: v.optional(v.string()),
    analyzedFileSize: v.optional(v.number()),
    analyzedFileHash: v.optional(v.string()),
    sourceIp: v.string(),
    userAgent: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    // Determine confidence level if not provided
    let confidenceLevel = args.confidenceLevel;
    if (!confidenceLevel && args.detected) {
      if (args.confidence >= 0.95) {
        confidenceLevel = "EXCELLENT";
      } else if (args.confidence >= 0.85) {
        confidenceLevel = "GOOD";
      } else if (args.confidence >= 0.75) {
        confidenceLevel = "FAIR";
      } else if (args.confidence >= 0.5) {
        confidenceLevel = "MARGINAL";
      } else {
        confidenceLevel = "NONE";
      }
    }

    return await ctx.db.insert("detectionLogs", {
      ...args,
      confidenceLevel,
      detectedAt: Date.now(),
    });
  },
});

/**
 * Get detection logs for an artwork
 */
export const listByArtwork = query({
  args: {
    artworkId: v.id("artworks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("detectionLogs")
      .withIndex("by_artwork", (q) => q.eq("artworkId", args.artworkId))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});

/**
 * Get detection logs by work ID
 */
export const listByWorkId = query({
  args: {
    workId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("detectionLogs")
      .withIndex("by_work_id", (q) => q.eq("workId", args.workId))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});

/**
 * Get recent detection attempts
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("detectionLogs")
      .withIndex("by_detected_at")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get detection statistics
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db.query("detectionLogs").collect();

    const total = logs.length;
    const detected = logs.filter((l) => l.detected).length;
    const excellent = logs.filter((l) => l.confidenceLevel === "EXCELLENT").length;
    const good = logs.filter((l) => l.confidenceLevel === "GOOD").length;
    const fair = logs.filter((l) => l.confidenceLevel === "FAIR").length;
    const marginal = logs.filter((l) => l.confidenceLevel === "MARGINAL").length;

    return {
      total,
      detected,
      notDetected: total - detected,
      detectionRate: total > 0 ? detected / total : 0,
      byConfidence: {
        excellent,
        good,
        fair,
        marginal,
      },
    };
  },
});
