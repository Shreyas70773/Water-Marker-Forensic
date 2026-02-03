import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a new processing job
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    workId: v.string(),
    mediaType: v.union(v.literal("IMAGE"), v.literal("VIDEO")),
    inputFileId: v.optional(v.id("_storage")),
    inputFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("processingJobs", {
      artworkId: undefined,
      userId: args.userId,
      workId: args.workId,
      mediaType: args.mediaType,
      status: "pending",
      progress: 0,
      currentStep: "Initializing...",
      inputFileId: args.inputFileId,
      inputFileName: args.inputFileName,
      outputFileId: undefined,
      error: undefined,
      errorDetails: undefined,
      createdAt: Date.now(),
      startedAt: undefined,
      completedAt: undefined,
    });
  },
});

/**
 * Update job status
 */
export const updateStatus = mutation({
  args: {
    id: v.id("processingJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("watermarking"),
      v.literal("notarizing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    artworkId: v.optional(v.id("artworks")),
    outputFileId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    errorDetails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, status, ...updates } = args;

    const patchData: Record<string, unknown> = {
      status,
      ...updates,
    };

    if (status === "processing" || status === "watermarking") {
      patchData.startedAt = Date.now();
    }

    if (status === "completed" || status === "failed") {
      patchData.completedAt = Date.now();
    }

    await ctx.db.patch(id, patchData);
  },
});

/**
 * Update job progress
 */
export const updateProgress = mutation({
  args: {
    id: v.id("processingJobs"),
    progress: v.number(),
    currentStep: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

/**
 * Link job to artwork
 */
export const linkToArtwork = mutation({
  args: {
    id: v.id("processingJobs"),
    artworkId: v.id("artworks"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { artworkId: args.artworkId });
  },
});

/**
 * Get job by ID
 */
export const get = query({
  args: { id: v.id("processingJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get job by work ID
 */
export const getByWorkId = query({
  args: { workId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("processingJobs")
      .withIndex("by_work_id", (q) => q.eq("workId", args.workId))
      .first();
  },
});

/**
 * Get jobs by user
 */
export const listByUser = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("uploading"),
        v.literal("processing"),
        v.literal("watermarking"),
        v.literal("notarizing"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("processingJobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", args.userId).eq("status", args.status!)
        )
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("processingJobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get active jobs (not completed/failed)
 */
export const getActiveJobs = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("processingJobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return jobs.filter(
      (job) => job.status !== "completed" && job.status !== "failed"
    );
  },
});

/**
 * Delete old completed jobs (cleanup)
 */
export const cleanupOld = mutation({
  args: {
    olderThanMs: v.number(), // Delete jobs older than this many ms
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;

    const oldJobs = await ctx.db
      .query("processingJobs")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed")
          ),
          q.lt(q.field("createdAt"), cutoff)
        )
      )
      .collect();

    for (const job of oldJobs) {
      await ctx.db.delete(job._id);
    }

    return oldJobs.length;
  },
});
