/**
 * Work ID Generator
 *
 * Generates unique, human-readable work identifiers.
 * Format: GJP-MEDIA-{YEAR}-{TIMESTAMP}{RANDOM}
 */

/**
 * Generate a unique work ID
 *
 * @param mediaType - Type of media (IMAGE or VIDEO)
 * @returns Unique work identifier string
 */
export function generateWorkId(mediaType: "IMAGE" | "VIDEO"): string {
  const prefix = "GJP-MEDIA";
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}-${year}-${timestamp}${random}`;
}

/**
 * Parse a work ID to extract components
 *
 * @param workId - Work ID to parse
 * @returns Parsed components or null if invalid
 */
export function parseWorkId(workId: string): {
  prefix: string;
  year: number;
  timestampRandom: string;
} | null {
  const pattern = /^(GJP-MEDIA)-(\d{4})-([A-Z0-9]+)$/;
  const match = workId.match(pattern);

  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    year: parseInt(match[2], 10),
    timestampRandom: match[3],
  };
}

/**
 * Validate a work ID format
 *
 * @param workId - Work ID to validate
 * @returns True if valid format
 */
export function isValidWorkId(workId: string): boolean {
  return parseWorkId(workId) !== null;
}

/**
 * Generate a sequential work ID (for testing)
 *
 * @param sequence - Sequence number
 * @returns Sequential work ID
 */
export function generateSequentialWorkId(sequence: number): string {
  const year = new Date().getFullYear();
  const paddedSequence = sequence.toString().padStart(6, "0");
  return `GJP-MEDIA-${year}-${paddedSequence}`;
}
