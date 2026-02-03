/**
 * Coefficient Hopping Module
 *
 * Generates pseudorandom DCT coefficient positions for watermark embedding.
 * The positions are deterministically seeded by workId + payloadHash,
 * making extraction reproducible while appearing random to attackers.
 */

import crypto from "crypto";
import { MID_FREQUENCY_POSITIONS } from "./dct-utils";

/**
 * Coefficient Hopper for secure watermark embedding
 */
export class CoefficientHopper {
  private positions: Array<[number, number]>;
  private seed: Buffer;

  /**
   * Create a coefficient hopper with deterministic seed
   *
   * @param workId - Unique work identifier
   * @param payloadHash - SHA-256 hash of the payload
   * @param blockSize - DCT block size (default 8)
   */
  constructor(
    workId: string,
    payloadHash: string,
    blockSize: number = 8
  ) {
    // Generate deterministic seed from workId + payloadHash
    this.seed = crypto
      .createHash("sha256")
      .update(`${workId}:${payloadHash}`, "utf-8")
      .digest();

    // Use mid-frequency positions (best for watermarking)
    // Shuffle them using the seed for security
    this.positions = this.shufflePositions([...MID_FREQUENCY_POSITIONS]);
  }

  /**
   * Get coefficient position for a given block index
   *
   * @param blockIndex - Index of the DCT block being processed
   * @returns [row, col] position within the 8x8 DCT block
   */
  getPosition(blockIndex: number): [number, number] {
    return this.positions[blockIndex % this.positions.length];
  }

  /**
   * Get all available positions (for detection attempts)
   */
  getAllPositions(): Array<[number, number]> {
    return [...this.positions];
  }

  /**
   * Get the number of unique positions
   */
  getPositionCount(): number {
    return this.positions.length;
  }

  /**
   * Get the seed used for this hopper (for verification)
   */
  getSeedHex(): string {
    return this.seed.toString("hex");
  }

  /**
   * Fisher-Yates shuffle with deterministic seed
   */
  private shufflePositions(
    positions: Array<[number, number]>
  ): Array<[number, number]> {
    const result = [...positions];
    let seedIndex = 0;

    for (let i = result.length - 1; i > 0; i--) {
      // Use seed bytes to generate swap index
      const seedByte = this.seed[seedIndex % this.seed.length];
      seedIndex++;
      const j = seedByte % (i + 1);

      // Swap elements
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }
}

/**
 * Coefficient position patterns for different watermark strengths
 */
export const COEFFICIENT_PATTERNS = {
  /**
   * Conservative: Only safest mid-frequency positions
   * Best invisibility, lower capacity
   */
  conservative: [
    [3, 3],
    [3, 4],
    [4, 3],
    [4, 4],
  ] as Array<[number, number]>,

  /**
   * Balanced: Standard mid-frequency positions
   * Good balance of invisibility and capacity
   */
  balanced: [
    [2, 2],
    [2, 3],
    [3, 2],
    [3, 3],
    [2, 4],
    [4, 2],
    [3, 4],
    [4, 3],
  ] as Array<[number, number]>,

  /**
   * Aggressive: Extended mid-frequency range
   * Higher capacity, slightly more visible
   */
  aggressive: [
    [2, 2],
    [2, 3],
    [3, 2],
    [3, 3],
    [2, 4],
    [4, 2],
    [3, 4],
    [4, 3],
    [4, 4],
    [2, 5],
    [5, 2],
    [3, 5],
    [5, 3],
  ] as Array<[number, number]>,
};

/**
 * Generate multiple coefficient hoppers for video temporal spreading
 *
 * @param workId - Base work identifier
 * @param payloadHash - Payload hash
 * @param numShards - Number of temporal shards
 * @returns Array of coefficient hoppers, one per shard
 */
export function createTemporalHoppers(
  workId: string,
  payloadHash: string,
  numShards: number
): CoefficientHopper[] {
  const hoppers: CoefficientHopper[] = [];

  for (let i = 0; i < numShards; i++) {
    // Create unique seed for each shard
    const shardWorkId = `${workId}-shard${i}`;
    hoppers.push(new CoefficientHopper(shardWorkId, payloadHash));
  }

  return hoppers;
}

/**
 * Validate that a position is within the mid-frequency range
 */
export function isValidPosition(
  row: number,
  col: number,
  blockSize: number = 8
): boolean {
  // Avoid DC coefficient (0,0) - too visible
  if (row === 0 && col === 0) return false;

  // Avoid high-frequency edges - lost in compression
  if (row >= blockSize - 1 || col >= blockSize - 1) return false;

  // Avoid very low frequency (besides DC)
  if (row + col <= 1) return false;

  // Ideal range: positions 2-5 in each dimension
  return row >= 2 && row <= 5 && col >= 2 && col <= 5;
}
