import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Generate an upload URL for file storage
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get a download URL for a stored file
 */
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Delete a stored file
 */
export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});

/**
 * Get file metadata
 */
export const getMetadata = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getMetadata(args.storageId);
  },
});

/**
 * Get storage usage for a user
 */
export const getUserStorageStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const artworks = await ctx.db
      .query("artworks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    let totalOriginalSize = 0;
    let totalWatermarkedSize = 0;
    let imageCount = 0;
    let videoCount = 0;

    for (const artwork of artworks) {
      totalOriginalSize += artwork.originalFileSize || 0;
      
      // Estimate watermarked size (usually similar to original)
      if (artwork.watermarkedFileId) {
        totalWatermarkedSize += artwork.originalFileSize || 0;
      }

      if (artwork.mediaType === "IMAGE") imageCount++;
      else videoCount++;
    }

    return {
      totalArtworks: artworks.length,
      imageCount,
      videoCount,
      totalOriginalSizeMB: (totalOriginalSize / 1024 / 1024).toFixed(2),
      totalWatermarkedSizeMB: (totalWatermarkedSize / 1024 / 1024).toFixed(2),
      totalSizeMB: ((totalOriginalSize + totalWatermarkedSize) / 1024 / 1024).toFixed(2),
    };
  },
});
