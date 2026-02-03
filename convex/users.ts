import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get user by Clerk ID
 */
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Get user by ID
 */
export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Create or update user profile
 */
export const upsert = mutation({
  args: {
    clerkId: v.string(),
    legalName: v.string(),
    displayName: v.string(),
    email: v.string(),
    copyrightYear: v.optional(v.number()),
    primarySource: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        instagram: v.optional(v.string()),
        pinterest: v.optional(v.string()),
        behance: v.optional(v.string()),
        twitter: v.optional(v.string()),
        website: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    const now = Date.now();
    const year = new Date().getFullYear();

    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, {
        legalName: args.legalName,
        displayName: args.displayName,
        email: args.email,
        copyrightYear: args.copyrightYear ?? existing.copyrightYear,
        primarySource: args.primarySource ?? existing.primarySource,
        socialLinks: args.socialLinks ?? existing.socialLinks,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new user
    const signingKeyId = `key_${args.clerkId}_${now}`;

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      legalName: args.legalName,
      displayName: args.displayName,
      email: args.email,
      copyrightYear: args.copyrightYear ?? year,
      primarySource: args.primarySource ?? "",
      socialLinks: args.socialLinks ?? {},
      signingKeyId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update user profile
 */
export const update = mutation({
  args: {
    id: v.id("users"),
    legalName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    copyrightYear: v.optional(v.number()),
    primarySource: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        instagram: v.optional(v.string()),
        pinterest: v.optional(v.string()),
        behance: v.optional(v.string()),
        twitter: v.optional(v.string()),
        website: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get current user (requires auth context)
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});
