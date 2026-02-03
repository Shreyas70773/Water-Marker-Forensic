/**
 * Video Watermarking Engine
 *
 * Implements temporal spreading across video frames:
 * - Splits payload into temporal shards
 * - Embeds each shard in multiple frames for redundancy
 * - Uses scene-adaptive embedding (skips flat regions)
 * - Survives frame dropping and re-encoding
 */

import sharp from "sharp";
import { ImageWatermarkEngine, WatermarkOptions } from "./image-watermark";
import { ECCEngine, createVideoECC } from "./ecc";
import { createTemporalHoppers } from "./coefficient-hopping";

/**
 * Video watermark options
 */
export interface VideoWatermarkOptions extends WatermarkOptions {
  /** Number of temporal shards (default 3) */
  temporalShards: number;
  /** Skip frames with low texture (default true) */
  skipLowTexture: boolean;
  /** Minimum texture threshold (0-1, default 0.3) */
  textureThreshold: number;
  /** Frame sampling rate (embed every N frames, default 1) */
  frameSamplingRate: number;
}

/**
 * Default video watermark options
 */
const DEFAULT_VIDEO_OPTIONS: VideoWatermarkOptions = {
  strength: 0.03,
  blockSize: 8,
  eccBytes: 12, // Higher redundancy for video
  validateQuality: false, // Too expensive for video
  outputQuality: 95,
  temporalShards: 3,
  skipLowTexture: true,
  textureThreshold: 0.3,
  frameSamplingRate: 1,
};

/**
 * Frame processing result
 */
export interface FrameResult {
  frameIndex: number;
  shardIndex: number;
  embedded: boolean;
  skipped: boolean;
  textureScore?: number;
}

/**
 * Video embedding result
 */
export interface VideoEmbedResult {
  framesProcessed: number;
  framesSkipped: number;
  temporalShards: number;
  embeddingParams: {
    strength: number;
    eccBytes: number;
    temporalShards: number;
  };
  frameResults: FrameResult[];
}

/**
 * Video extraction result
 */
export interface VideoExtractResult {
  payload: string | null;
  confidence: number;
  framesAnalyzed: number;
  shardsRecovered: number;
  totalShards: number;
  eccRecoveryRate: string;
}

/**
 * Video Watermark Engine
 *
 * Note: This engine works with extracted frames.
 * Frame extraction/reconstruction should be done by Convex actions
 * using FFmpeg or similar tools.
 */
export class VideoWatermarkEngine {
  private imageEngine: ImageWatermarkEngine;
  private options: VideoWatermarkOptions;

  constructor(options: Partial<VideoWatermarkOptions> = {}) {
    this.options = { ...DEFAULT_VIDEO_OPTIONS, ...options };
    this.imageEngine = new ImageWatermarkEngine({
      strength: this.options.strength,
      blockSize: this.options.blockSize,
      eccBytes: this.options.eccBytes,
      validateQuality: false,
      outputQuality: 95, // High quality JPEG
      outputFormat: 'jpeg', // Use JPEG for faster video frame processing
    });
  }

  /**
   * Embed watermark across multiple frames
   *
   * @param frames - Array of frame buffers (PNG/JPEG)
   * @param payload - Payload to embed
   * @param workId - Unique work identifier
   * @param payloadHash - Payload hash for coefficient hopping
   * @param onProgress - Progress callback (frameIndex, totalFrames)
   * @returns Array of watermarked frame buffers
   */
  async embedInFrames(
    frames: Buffer[],
    payload: string,
    workId: string,
    payloadHash: string,
    onProgress?: (frameIndex: number, totalFrames: number, step: string) => void
  ): Promise<{
    watermarkedFrames: Buffer[];
    result: VideoEmbedResult;
  }> {
    const opts = this.options;
    const numShards = opts.temporalShards;
    const totalFrames = frames.length;

    // 1. Encode payload with ECC
    const eccEngine = createVideoECC();
    const binaryPayload = eccEngine.encode(payload);

    // 2. Split payload into temporal shards
    const shardSize = Math.ceil(binaryPayload.length / numShards);
    const shards: string[] = [];

    for (let i = 0; i < numShards; i++) {
      const start = i * shardSize;
      const end = Math.min(start + shardSize, binaryPayload.length);
      const shardBits = binaryPayload.slice(start, end);
      // Convert bits to hex string for embedding
      shards.push(this.bitsToHex(shardBits));
    }

    // 3. Create coefficient hoppers for each shard
    const hoppers = createTemporalHoppers(workId, payloadHash, numShards);

    // 4. Calculate frame ranges for each shard
    const framesPerShard = Math.floor(totalFrames / numShards);
    const shardFrameRanges: Array<{ start: number; end: number }> = [];

    for (let i = 0; i < numShards; i++) {
      const start = i * framesPerShard;
      const end = i === numShards - 1 ? totalFrames : (i + 1) * framesPerShard;
      shardFrameRanges.push({ start, end });
    }

    // 5. Process frames
    const watermarkedFrames: Buffer[] = [];
    const frameResults: FrameResult[] = [];
    let framesProcessed = 0;
    let framesSkipped = 0;

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      onProgress?.(frameIndex, totalFrames, `Processing frame ${frameIndex + 1}/${totalFrames}`);

      // Determine which shard this frame belongs to
      let shardIndex = 0;
      for (let i = 0; i < numShards; i++) {
        if (frameIndex >= shardFrameRanges[i].start && frameIndex < shardFrameRanges[i].end) {
          shardIndex = i;
          break;
        }
      }

      // Check if we should skip this frame (sampling rate)
      if (opts.frameSamplingRate > 1 && frameIndex % opts.frameSamplingRate !== 0) {
        watermarkedFrames.push(frames[frameIndex]);
        frameResults.push({
          frameIndex,
          shardIndex,
          embedded: false,
          skipped: true,
        });
        framesSkipped++;
        continue;
      }

      // Check texture if enabled
      if (opts.skipLowTexture) {
        const textureScore = await this.calculateTextureScore(frames[frameIndex]);
        if (textureScore < opts.textureThreshold) {
          watermarkedFrames.push(frames[frameIndex]);
          frameResults.push({
            frameIndex,
            shardIndex,
            embedded: false,
            skipped: true,
            textureScore,
          });
          framesSkipped++;
          continue;
        }
      }

      // Embed shard in this frame
      try {
        const shardPayload = shards[shardIndex];
        const shardWorkId = `${workId}-shard${shardIndex}`;

        const { watermarkedBuffer } = await this.imageEngine.embed(
          frames[frameIndex],
          shardPayload,
          shardWorkId,
          payloadHash
        );

        watermarkedFrames.push(watermarkedBuffer);
        frameResults.push({
          frameIndex,
          shardIndex,
          embedded: true,
          skipped: false,
        });
        framesProcessed++;
      } catch (error) {
        // If embedding fails, keep original frame
        console.warn(`Frame ${frameIndex} embedding failed:`, error);
        watermarkedFrames.push(frames[frameIndex]);
        frameResults.push({
          frameIndex,
          shardIndex,
          embedded: false,
          skipped: true,
        });
        framesSkipped++;
      }
    }

    return {
      watermarkedFrames,
      result: {
        framesProcessed,
        framesSkipped,
        temporalShards: numShards,
        embeddingParams: {
          strength: opts.strength,
          eccBytes: opts.eccBytes,
          temporalShards: numShards,
        },
        frameResults,
      },
    };
  }

  /**
   * Extract watermark from video frames
   *
   * @param frames - Array of frame buffers to analyze
   * @param workId - Work identifier for coefficient hopping
   * @param payloadHash - Payload hash for coefficient hopping
   * @param expectedPayloadLength - Expected payload length in bytes
   * @param onProgress - Progress callback
   */
  async extractFromFrames(
    frames: Buffer[],
    workId: string,
    payloadHash: string,
    expectedPayloadLength: number,
    onProgress?: (frameIndex: number, totalFrames: number) => void
  ): Promise<VideoExtractResult> {
    const opts = this.options;
    const numShards = opts.temporalShards;
    const totalFrames = frames.length;

    // Calculate frame ranges for each shard
    const framesPerShard = Math.floor(totalFrames / numShards);
    const shardExtractions: Array<string[]> = Array.from(
      { length: numShards },
      () => []
    );

    // Sample frames from each shard (every 5th frame for efficiency)
    const sampleRate = 5;
    let framesAnalyzed = 0;

    for (let shardIndex = 0; shardIndex < numShards; shardIndex++) {
      const start = shardIndex * framesPerShard;
      const end = shardIndex === numShards - 1 ? totalFrames : (shardIndex + 1) * framesPerShard;
      const shardWorkId = `${workId}-shard${shardIndex}`;

      // Extract from multiple frames in this shard
      for (let frameIndex = start; frameIndex < end; frameIndex += sampleRate) {
        if (frameIndex >= frames.length) break;

        onProgress?.(framesAnalyzed, totalFrames);
        framesAnalyzed++;

        try {
          const result = await this.imageEngine.extract(
            frames[frameIndex],
            shardWorkId,
            payloadHash,
            Math.ceil(expectedPayloadLength / numShards) + opts.eccBytes,
            opts.eccBytes
          );

          if (result.payload && result.confidence > 0.5) {
            shardExtractions[shardIndex].push(result.payload);
          }
        } catch (error) {
          // Frame extraction failed, continue
          console.warn(`Frame ${frameIndex} extraction failed:`, error);
        }
      }
    }

    // Reconstruct full payload from shards (majority vote per shard)
    const recoveredShards: string[] = [];
    for (const attempts of shardExtractions) {
      if (attempts.length > 0) {
        const mostCommon = this.getMostCommon(attempts);
        recoveredShards.push(mostCommon);
      }
    }

    // Calculate recovery rate
    const shardsRecovered = recoveredShards.length;
    const eccRecoveryRate = `${shardsRecovered}/${numShards} shards`;

    if (shardsRecovered < numShards) {
      return {
        payload: null,
        confidence: shardsRecovered / numShards,
        framesAnalyzed,
        shardsRecovered,
        totalShards: numShards,
        eccRecoveryRate,
      };
    }

    // Combine shards and decode
    try {
      const combinedHex = recoveredShards.join("");
      const combinedBits = this.hexToBits(combinedHex);

      const eccEngine = createVideoECC();
      const decoded = eccEngine.decode(combinedBits);

      if (decoded.payload) {
        return {
          payload: decoded.payload,
          confidence: 1.0 - (decoded.errorsFound / (opts.eccBytes * 2)),
          framesAnalyzed,
          shardsRecovered,
          totalShards: numShards,
          eccRecoveryRate: `${shardsRecovered}/${numShards} shards, ${decoded.errorsCorrected}/${decoded.errorsFound} errors corrected`,
        };
      }
    } catch (error) {
      console.error("Payload reconstruction failed:", error);
    }

    return {
      payload: null,
      confidence: 0,
      framesAnalyzed,
      shardsRecovered,
      totalShards: numShards,
      eccRecoveryRate: `${shardsRecovered}/${numShards} shards - reconstruction failed`,
    };
  }

  /**
   * Calculate texture score for a frame
   * Higher texture = more detail = better for watermarking
   */
  private async calculateTextureScore(frameBuffer: Buffer): Promise<number> {
    const { data, info } = await sharp(frameBuffer)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const n = pixels.length;

    // Calculate variance as texture measure
    const mean = pixels.reduce((sum, val) => sum + val, 0) / n;
    const variance = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;

    // Normalize to 0-1 (typical variance range: 0-5000)
    return Math.min(variance / 5000, 1);
  }

  /**
   * Convert bit array to hex string
   */
  private bitsToHex(bits: number[]): string {
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      let nibble = 0;
      for (let j = 0; j < 4 && i + j < bits.length; j++) {
        nibble = (nibble << 1) | (bits[i + j] & 1);
      }
      hex += nibble.toString(16);
    }
    return hex;
  }

  /**
   * Convert hex string to bit array
   */
  private hexToBits(hex: string): number[] {
    const bits: number[] = [];
    for (const char of hex) {
      const nibble = parseInt(char, 16);
      for (let i = 3; i >= 0; i--) {
        bits.push((nibble >> i) & 1);
      }
    }
    return bits;
  }

  /**
   * Get most common element from array
   */
  private getMostCommon(items: string[]): string {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommon = items[0];

    counts.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    });

    return mostCommon;
  }
}

/**
 * Create a video watermark engine with default settings
 */
export function createVideoWatermarkEngine(
  options?: Partial<VideoWatermarkOptions>
): VideoWatermarkEngine {
  return new VideoWatermarkEngine(options);
}
