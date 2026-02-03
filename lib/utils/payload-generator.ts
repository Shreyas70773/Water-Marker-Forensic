/**
 * Payload Generator
 *
 * Creates canonical, deterministic payloads for watermark embedding.
 * The payload format is designed to be:
 * - Human-readable
 * - Deterministically sortable (for hash consistency)
 * - Compact enough to embed in images
 */

/**
 * User profile for payload generation
 */
export interface UserProfile {
  legalName: string;
  displayName: string;
  copyrightYear: number;
  primarySource: string;
}

/**
 * Full artwork payload data
 */
export interface ArtworkPayload {
  author: string;
  knownAs: string;
  copyright: string;
  rights: string;
  source: string;
  workId: string;
  mediaType: "IMAGE" | "VIDEO";
  aspectRatio: string;
  createdUtc: string;
}

/**
 * Generate canonical payload for database storage
 *
 * This is the full payload that gets hashed and stored.
 * Format: KEY=VALUE pairs, sorted alphabetically.
 *
 * @param userProfile - User profile data
 * @param workId - Unique work identifier
 * @param mediaType - IMAGE or VIDEO
 * @param aspectRatio - Aspect ratio string (e.g., "16:9")
 * @returns Canonical payload string
 */
export function generateCanonicalPayload(
  userProfile: UserProfile,
  workId: string,
  mediaType: "IMAGE" | "VIDEO",
  aspectRatio: string
): string {
  const payload: ArtworkPayload = {
    author: userProfile.legalName,
    knownAs: userProfile.displayName,
    copyright: `©${userProfile.legalName} ${userProfile.copyrightYear}`,
    rights: "All rights reserved",
    source: userProfile.primarySource,
    workId,
    mediaType,
    aspectRatio,
    createdUtc: new Date().toISOString(),
  };

  // Sort keys alphabetically for deterministic output
  return Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key.toUpperCase()}=${value}`)
    .join("\n");
}

/**
 * Generate compact watermark payload for embedding
 *
 * This is the shortened payload that actually gets embedded.
 * Must be short to fit in limited DCT capacity.
 *
 * Format: ©{initials}|{displayName}|{workId}
 *
 * @param userProfile - User profile data
 * @param workId - Unique work identifier
 * @returns Compact payload string
 */
export function generateWatermarkPayload(
  userProfile: UserProfile,
  workId: string
): string {
  // Extract initials from legal name
  const initials = userProfile.legalName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .toUpperCase();

  return `©${initials}|${userProfile.displayName}|${workId}`;
}

/**
 * Parse a compact watermark payload
 *
 * @param payload - Compact payload string
 * @returns Parsed components or null if invalid
 */
export function parseWatermarkPayload(payload: string): {
  initials: string;
  displayName: string;
  workId: string;
} | null {
  const pattern = /^©([A-Z]+)\|([^|]+)\|(.+)$/;
  const match = payload.match(pattern);

  if (!match) {
    return null;
  }

  return {
    initials: match[1],
    displayName: match[2],
    workId: match[3],
  };
}

/**
 * Detect aspect ratio from dimensions
 *
 * @param width - Image/video width
 * @param height - Image/video height
 * @returns Aspect ratio string
 */
export function detectAspectRatio(width: number, height: number): string {
  const ratio = width / height;

  // Common aspect ratios
  const ratios: Record<string, number> = {
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "1:1": 1,
    "3:2": 3 / 2,
    "21:9": 21 / 9,
    "9:16": 9 / 16, // Vertical video
    "4:5": 4 / 5, // Instagram portrait
  };

  // Find closest match
  let closestRatio = "custom";
  let minDiff = Infinity;

  for (const [name, value] of Object.entries(ratios)) {
    const diff = Math.abs(ratio - value);
    if (diff < minDiff && diff < 0.05) {
      minDiff = diff;
      closestRatio = name;
    }
  }

  return closestRatio;
}

/**
 * Validate payload format
 *
 * @param payload - Payload string to validate
 * @returns True if valid compact payload format
 */
export function isValidWatermarkPayload(payload: string): boolean {
  return parseWatermarkPayload(payload) !== null;
}

/**
 * Get estimated byte length of watermark payload
 *
 * @param userProfile - User profile
 * @param workId - Work ID
 * @returns Byte length of UTF-8 encoded payload
 */
export function getPayloadByteLength(
  userProfile: UserProfile,
  workId: string
): number {
  const payload = generateWatermarkPayload(userProfile, workId);
  return Buffer.byteLength(payload, "utf-8");
}
