/**
 * Image Watermarking Engine
 *
 * Implements DCT-based frequency-domain watermarking with:
 * - Coefficient hopping for security
 * - Quantization Index Modulation (QIM) for embedding
 * - Reed-Solomon error correction for robustness
 *
 * Quality targets:
 * - PSNR >= 40 dB
 * - SSIM >= 0.95
 */

import sharp from "sharp";
import {
  dct2d,
  idct2d,
  extractBlock,
  writeBlock,
  getBlockCount,
  levelShift,
  inverseLevelShift,
} from "./dct-utils";
import { ECCEngine, createImageECC } from "./ecc";
import { CoefficientHopper } from "./coefficient-hopping";
import { QualityValidator, QualityMetrics } from "./quality-validator";

/**
 * Watermark embedding options
 */
export interface WatermarkOptions {
  /** Embedding strength (0.05-0.20, default 0.15) */
  strength: number;
  /** DCT block size (default 8) */
  blockSize: number;
  /** Error correction bytes (default 8) */
  eccBytes: number;
  /** Validate quality after embedding */
  validateQuality: boolean;
  /** Target JPEG quality for output (default 100) */
  outputQuality: number;
  /** Output format: 'jpeg' or 'png' (default 'jpeg') */
  outputFormat?: 'jpeg' | 'png';
}

/**
 * Default watermark options
 */
const DEFAULT_OPTIONS: WatermarkOptions = {
  strength: 0.15, // Increased from 0.03 to survive JPEG compression
  blockSize: 8,
  eccBytes: 8,
  validateQuality: true,
  outputQuality: 100,
  outputFormat: 'jpeg',
};

/**
 * Embedding result
 */
export interface EmbedResult {
  watermarkedBuffer: Buffer;
  embeddingParams: {
    strength: number;
    eccBytes: number;
    coefficientSeed: string;
    blockSize: number;
    bitsEmbedded: number;
    blocksUsed: number;
  };
  qualityMetrics?: QualityMetrics;
}

/**
 * Extraction result
 */
export interface ExtractResult {
  payload: string | null;
  confidence: number;
  errorsFound: number;
  errorsCorrected: number;
  bitsExtracted: number;
}

/**
 * Image Watermark Engine
 */
export class ImageWatermarkEngine {
  private options: WatermarkOptions;

  constructor(options: Partial<WatermarkOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Embed watermark into image
   *
   * @param imageBuffer - Original image buffer (JPEG, PNG, etc.)
   * @param payload - String payload to embed
   * @param workId - Unique work identifier
   * @param payloadHash - SHA-256 hash of canonical payload
   * @param options - Override default options
   */
  async embed(
    imageBuffer: Buffer,
    payload: string,
    workId: string,
    payloadHash: string,
    options: Partial<WatermarkOptions> = {}
  ): Promise<EmbedResult> {
    const opts = { ...this.options, ...options };

    // 1. Initialize ECC and encode payload
    const eccEngine = new ECCEngine(opts.eccBytes);
    const binaryPayload = eccEngine.encode(payload);

    // 2. Initialize coefficient hopper
    const hopper = new CoefficientHopper(workId, payloadHash, opts.blockSize);

    // 3. Get image metadata and raw data
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Could not determine image dimensions");
    }

    const { width, height } = metadata;

    // 4. Convert to raw RGB data
    const { data: rawData, info } = await image
      .raw()
      .removeAlpha()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;

    // 5. Extract luminance channel (Y in YCbCr)
    const luminance = this.extractLuminance(rawData, width, height, channels);

    // 6. Check capacity
    const { totalBlocks } = getBlockCount(width, height, opts.blockSize);
    if (binaryPayload.length > totalBlocks) {
      throw new Error(
        `Payload too large: ${binaryPayload.length} bits, but only ${totalBlocks} blocks available`
      );
    }

    // 7. Embed watermark in DCT domain
    const watermarkedLuminance = this.embedInDCT(
      luminance,
      width,
      height,
      binaryPayload,
      hopper,
      opts
    );

    // 8. Reconstruct image with modified luminance
    const watermarkedRaw = this.reconstructImage(
      rawData,
      luminance,
      watermarkedLuminance,
      width,
      height,
      channels
    );

    // 9. Convert back to image format
    let sharpOutput = sharp(watermarkedRaw, {
      raw: {
        width,
        height,
        channels,
      },
    });
    
    // Output as PNG or JPEG based on options
    const watermarkedBuffer = opts.outputFormat === 'png'
      ? await sharpOutput.png({ compressionLevel: 6 }).toBuffer()
      : await sharpOutput.jpeg({ quality: opts.outputQuality || 95 }).toBuffer();

    // 10. Validate quality if requested
    let qualityMetrics: QualityMetrics | undefined;
    if (opts.validateQuality) {
      const validator = new QualityValidator();
      const validation = await validator.validate(imageBuffer, watermarkedBuffer);
      qualityMetrics = validation.metrics;

      if (!validation.passed) {
        console.warn(
          `Quality validation warning: PSNR=${qualityMetrics.psnr.toFixed(2)}, SSIM=${qualityMetrics.ssim.toFixed(4)}`
        );
      }
    }

    return {
      watermarkedBuffer,
      embeddingParams: {
        strength: opts.strength,
        eccBytes: opts.eccBytes,
        coefficientSeed: `${workId}:${payloadHash}`,
        blockSize: opts.blockSize,
        bitsEmbedded: binaryPayload.length,
        blocksUsed: binaryPayload.length,
      },
      qualityMetrics,
    };
  }

  /**
   * Extract watermark from image
   *
   * @param imageBuffer - Potentially watermarked image
   * @param workId - Work identifier (for coefficient hopping seed)
   * @param payloadHash - Payload hash (for coefficient hopping seed)
   * @param expectedPayloadLength - Expected payload length in bytes
   * @param eccBytes - ECC bytes used during embedding
   */
  async extract(
    imageBuffer: Buffer,
    workId: string,
    payloadHash: string,
    expectedPayloadLength: number,
    eccBytes: number = 8
  ): Promise<ExtractResult> {
    // 1. Initialize ECC engine
    const eccEngine = new ECCEngine(eccBytes);
    const bitsNeeded = eccEngine.getRequiredBits(expectedPayloadLength);

    // 2. Initialize coefficient hopper with same seed
    const hopper = new CoefficientHopper(workId, payloadHash, this.options.blockSize);

    // 3. Get image data
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Could not determine image dimensions");
    }

    const { width, height } = metadata;

    const { data: rawData, info } = await image
      .raw()
      .removeAlpha()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;

    // 4. Extract luminance channel
    const luminance = this.extractLuminance(rawData, width, height, channels);

    // 5. Extract binary data from DCT coefficients
    const binary = this.extractFromDCT(
      luminance,
      width,
      height,
      bitsNeeded,
      hopper
    );

    // 6. Decode with ECC
    const result = eccEngine.decode(binary);

    // 7. Calculate confidence
    let confidence = 0;
    if (result.payload) {
      if (result.errorsFound === 0) {
        confidence = 1.0;
      } else if (result.errorsFound > 0) {
        // Confidence decreases with more errors
        const maxCorrectableErrors = Math.floor(eccBytes / 2);
        confidence = Math.max(
          0,
          1.0 - result.errorsFound / (maxCorrectableErrors * 2)
        );
      }
    }

    return {
      payload: result.payload,
      confidence,
      errorsFound: result.errorsFound,
      errorsCorrected: result.errorsCorrected,
      bitsExtracted: binary.length,
    };
  }

  /**
   * Extract luminance (Y) channel from RGB data
   */
  private extractLuminance(
    data: Buffer,
    width: number,
    height: number,
    channels: number
  ): number[] {
    const luminance: number[] = new Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const offset = i * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      // ITU-R BT.601 standard for Y
      luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    return luminance;
  }

  /**
   * Embed watermark bits in DCT domain using QIM
   */
  private embedInDCT(
    luminance: number[],
    width: number,
    height: number,
    binary: number[],
    hopper: CoefficientHopper,
    opts: WatermarkOptions
  ): number[] {
    const result = [...luminance];
    const { blockSize, strength } = opts;
    const { numBlocksX, numBlocksY } = getBlockCount(width, height, blockSize);

    // Quantization step for QIM
    const delta = strength * 255;

    let bitIndex = 0;
    let blockIndex = 0;

    // Process blocks row by row
    for (let by = 0; by < numBlocksY && bitIndex < binary.length; by++) {
      for (let bx = 0; bx < numBlocksX && bitIndex < binary.length; bx++) {
        // Extract 8x8 block
        const x = bx * blockSize;
        const y = by * blockSize;
        const block = extractBlock(result, width, x, y, blockSize);

        // Level shift for DCT
        const shiftedBlock = levelShift(block);

        // Apply 2D DCT
        const dctBlock = dct2d(shiftedBlock, blockSize);

        // Get coefficient position from hopper
        const [coeffRow, coeffCol] = hopper.getPosition(blockIndex);

        // Get current coefficient value
        const coefficient = dctBlock[coeffRow][coeffCol];

        // Embed bit using Quantization Index Modulation (QIM)
        const bit = binary[bitIndex];
        const quantized = Math.round(coefficient / delta);

        // Modify coefficient to encode bit
        // Even |quantized| values encode 0, odd |quantized| values encode 1
        const absQuantized = Math.abs(quantized);
        const sign = quantized >= 0 ? 1 : -1;
        const currentParity = absQuantized % 2; // 0 or 1
        
        let newAbsQuantized: number;
        if (bit === currentParity) {
          // Already correct parity
          newAbsQuantized = absQuantized;
        } else {
          // Need to change parity - add 1 to flip even<->odd
          newAbsQuantized = absQuantized + 1;
        }

        dctBlock[coeffRow][coeffCol] = sign * newAbsQuantized * delta;

        // Apply inverse DCT
        const modifiedBlock = idct2d(dctBlock, blockSize);

        // Inverse level shift
        const finalBlock = inverseLevelShift(modifiedBlock);

        // Write block back to image
        writeBlock(result, width, finalBlock, x, y, blockSize);

        bitIndex++;
        blockIndex++;
      }
    }

    return result;
  }

  /**
   * Extract watermark bits from DCT domain
   */
  private extractFromDCT(
    luminance: number[],
    width: number,
    height: number,
    bitsNeeded: number,
    hopper: CoefficientHopper
  ): number[] {
    const blockSize = this.options.blockSize;
    const strength = this.options.strength;
    const delta = strength * 255;

    const { numBlocksX, numBlocksY } = getBlockCount(width, height, blockSize);
    const extractedBits: number[] = [];

    let blockIndex = 0;

    for (let by = 0; by < numBlocksY && extractedBits.length < bitsNeeded; by++) {
      for (let bx = 0; bx < numBlocksX && extractedBits.length < bitsNeeded; bx++) {
        const x = bx * blockSize;
        const y = by * blockSize;
        const block = extractBlock(luminance, width, x, y, blockSize);

        // Level shift and DCT
        const shiftedBlock = levelShift(block);
        const dctBlock = dct2d(shiftedBlock, blockSize);

        // Get coefficient position
        const [coeffRow, coeffCol] = hopper.getPosition(blockIndex);
        const coefficient = dctBlock[coeffRow][coeffCol];

        // Extract bit using QIM decoding
        const quantized = Math.round(coefficient / delta);
        const bit = Math.abs(quantized) % 2; // Even = 0, Odd = 1

        extractedBits.push(bit);
        blockIndex++;
      }
    }

    return extractedBits;
  }

  /**
   * Reconstruct RGB image with modified luminance
   */
  private reconstructImage(
    original: Buffer,
    originalLuminance: number[],
    newLuminance: number[],
    width: number,
    height: number,
    channels: number
  ): Buffer {
    const result = Buffer.from(original);

    for (let i = 0; i < width * height; i++) {
      const offset = i * channels;

      // Calculate luminance difference
      const oldY = originalLuminance[i];
      const newY = newLuminance[i];
      const diff = newY - oldY;

      // Apply difference proportionally to all RGB channels
      for (let c = 0; c < 3; c++) {
        const oldValue = original[offset + c];
        const newValue = Math.max(0, Math.min(255, Math.round(oldValue + diff)));
        result[offset + c] = newValue;
      }
    }

    return result;
  }

  /**
   * Check if image has sufficient capacity for payload
   */
  async checkCapacity(
    imageBuffer: Buffer,
    payloadLength: number,
    eccBytes: number = 8
  ): Promise<{
    hasCapacity: boolean;
    availableBlocks: number;
    requiredBits: number;
  }> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Could not determine image dimensions");
    }

    const { totalBlocks } = getBlockCount(
      metadata.width,
      metadata.height,
      this.options.blockSize
    );

    const eccEngine = new ECCEngine(eccBytes);
    const requiredBits = eccEngine.getRequiredBits(payloadLength);

    return {
      hasCapacity: totalBlocks >= requiredBits,
      availableBlocks: totalBlocks,
      requiredBits,
    };
  }
}

/**
 * Create a watermark engine with default settings
 */
export function createImageWatermarkEngine(
  options?: Partial<WatermarkOptions>
): ImageWatermarkEngine {
  return new ImageWatermarkEngine(options);
}
