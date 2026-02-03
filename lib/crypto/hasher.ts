/**
 * SHA-256 Hashing Engine
 *
 * Provides cryptographic hashing for:
 * - Original media files (proof of content)
 * - Canonical payloads (proof of authorship claim)
 * - Combined hashes for blockchain notarization
 */

import crypto from "crypto";

/**
 * Hash Engine for forensic evidence
 */
export class HashEngine {
  /**
   * Generate SHA-256 hash of a file buffer
   *
   * @param buffer - File contents as Buffer
   * @returns Lowercase hexadecimal hash string
   */
  static hashFile(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Generate SHA-256 hash of a payload string
   *
   * @param payload - String payload (canonical format)
   * @returns Lowercase hexadecimal hash string
   */
  static hashPayload(payload: string): string {
    return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
  }

  /**
   * Generate combined hash for blockchain notarization
   *
   * Format: SHA256(workId:mediaHash:payloadHash)
   *
   * @param workId - Unique work identifier
   * @param mediaHash - Hash of original media file
   * @param payloadHash - Hash of canonical payload
   * @returns Combined hash for notarization
   */
  static hashForNotarization(
    workId: string,
    mediaHash: string,
    payloadHash: string
  ): string {
    const combined = `${workId}:${mediaHash}:${payloadHash}`;
    return crypto.createHash("sha256").update(combined, "utf-8").digest("hex");
  }

  /**
   * Verify a file's hash matches expected value
   *
   * @param buffer - File contents
   * @param expectedHash - Expected hash value
   * @returns True if hashes match
   */
  static verifyFileHash(buffer: Buffer, expectedHash: string): boolean {
    const actualHash = this.hashFile(buffer);
    return this.constantTimeCompare(actualHash, expectedHash.toLowerCase());
  }

  /**
   * Verify a payload's hash matches expected value
   *
   * @param payload - Payload string
   * @param expectedHash - Expected hash value
   * @returns True if hashes match
   */
  static verifyPayloadHash(payload: string, expectedHash: string): boolean {
    const actualHash = this.hashPayload(payload);
    return this.constantTimeCompare(actualHash, expectedHash.toLowerCase());
  }

  /**
   * Generate a hash-based message authentication code (HMAC)
   *
   * @param data - Data to authenticate
   * @param key - Secret key
   * @returns HMAC-SHA256 as hex string
   */
  static hmac(data: string, key: string): string {
    return crypto
      .createHmac("sha256", key)
      .update(data, "utf-8")
      .digest("hex");
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Generate random bytes (for key generation, nonces, etc.)
   *
   * @param length - Number of bytes
   * @returns Random bytes as hex string
   */
  static randomBytes(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  /**
   * Hash multiple items and combine them
   *
   * @param items - Array of items to hash
   * @returns Combined hash
   */
  static hashMultiple(...items: (string | Buffer)[]): string {
    const hash = crypto.createHash("sha256");

    for (const item of items) {
      if (typeof item === "string") {
        hash.update(item, "utf-8");
      } else {
        hash.update(item);
      }
      // Add separator to prevent collision attacks
      hash.update(Buffer.from([0]));
    }

    return hash.digest("hex");
  }
}

/**
 * Convenience function to hash a file buffer
 */
export function hashFile(buffer: Buffer): string {
  return HashEngine.hashFile(buffer);
}

/**
 * Convenience function to hash a payload string
 */
export function hashPayload(payload: string): string {
  return HashEngine.hashPayload(payload);
}
