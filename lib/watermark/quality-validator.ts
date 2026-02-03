/**
 * Quality Validator for Watermarked Images
 *
 * Calculates PSNR (Peak Signal-to-Noise Ratio) and SSIM (Structural Similarity Index)
 * to ensure watermarks remain imperceptible.
 *
 * Thresholds (forensic-grade):
 * - PSNR >= 40 dB (imperceptible difference)
 * - SSIM >= 0.95 (structural similarity preserved)
 */

import sharp from "sharp";

export interface QualityMetrics {
  psnr: number;
  ssim: number;
  mse: number; // Mean Squared Error
  maxDiff: number; // Maximum pixel difference
}

export interface ValidationResult {
  passed: boolean;
  metrics: QualityMetrics;
  psnrPassed: boolean;
  ssimPassed: boolean;
}

/**
 * Quality validation thresholds
 */
export const QUALITY_THRESHOLDS = {
  MIN_PSNR: 40, // dB
  MIN_SSIM: 0.95,
  MAX_PIXEL_DIFF: 15, // Maximum acceptable pixel difference
};

/**
 * Quality Validator class
 */
export class QualityValidator {
  private minPsnr: number;
  private minSsim: number;

  constructor(
    minPsnr: number = QUALITY_THRESHOLDS.MIN_PSNR,
    minSsim: number = QUALITY_THRESHOLDS.MIN_SSIM
  ) {
    this.minPsnr = minPsnr;
    this.minSsim = minSsim;
  }

  /**
   * Validate watermarked image quality against original
   *
   * @param originalBuffer - Original image buffer
   * @param watermarkedBuffer - Watermarked image buffer
   * @returns Validation result with metrics
   */
  async validate(
    originalBuffer: Buffer,
    watermarkedBuffer: Buffer
  ): Promise<ValidationResult> {
    // Get raw pixel data from both images
    const [originalData, watermarkedData] = await Promise.all([
      this.getPixelData(originalBuffer),
      this.getPixelData(watermarkedBuffer),
    ]);

    // Ensure same dimensions
    if (
      originalData.width !== watermarkedData.width ||
      originalData.height !== watermarkedData.height
    ) {
      throw new Error("Image dimensions do not match");
    }

    // Calculate metrics
    const { mse, maxDiff } = this.calculateMSE(
      originalData.data,
      watermarkedData.data
    );
    const psnr = this.calculatePSNR(mse);
    const ssim = this.calculateSSIM(
      originalData.data,
      watermarkedData.data,
      originalData.width,
      originalData.height,
      originalData.channels
    );

    const metrics: QualityMetrics = {
      psnr,
      ssim,
      mse,
      maxDiff,
    };

    const psnrPassed = psnr >= this.minPsnr;
    const ssimPassed = ssim >= this.minSsim;

    return {
      passed: psnrPassed && ssimPassed,
      metrics,
      psnrPassed,
      ssimPassed,
    };
  }

  /**
   * Get raw pixel data from image buffer
   */
  private async getPixelData(buffer: Buffer): Promise<{
    data: Buffer;
    width: number;
    height: number;
    channels: number;
  }> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    };
  }

  /**
   * Calculate Mean Squared Error between two images
   */
  private calculateMSE(
    original: Buffer,
    watermarked: Buffer
  ): { mse: number; maxDiff: number } {
    if (original.length !== watermarked.length) {
      throw new Error("Image data lengths do not match");
    }

    let sumSquaredError = 0;
    let maxDiff = 0;

    for (let i = 0; i < original.length; i++) {
      const diff = Math.abs(original[i] - watermarked[i]);
      sumSquaredError += diff * diff;
      maxDiff = Math.max(maxDiff, diff);
    }

    const mse = sumSquaredError / original.length;
    return { mse, maxDiff };
  }

  /**
   * Calculate Peak Signal-to-Noise Ratio
   * PSNR = 10 * log10(MAX^2 / MSE)
   */
  private calculatePSNR(mse: number): number {
    if (mse === 0) {
      return Infinity; // Images are identical
    }
    const maxPixelValue = 255;
    return 10 * Math.log10((maxPixelValue * maxPixelValue) / mse);
  }

  /**
   * Calculate Structural Similarity Index (simplified)
   *
   * SSIM measures structural similarity considering:
   * - Luminance comparison
   * - Contrast comparison
   * - Structure comparison
   */
  private calculateSSIM(
    original: Buffer,
    watermarked: Buffer,
    width: number,
    height: number,
    channels: number
  ): number {
    // Constants for SSIM (as per original paper)
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;

    // Calculate means
    let sumOriginal = 0;
    let sumWatermarked = 0;

    for (let i = 0; i < original.length; i++) {
      sumOriginal += original[i];
      sumWatermarked += watermarked[i];
    }

    const meanOriginal = sumOriginal / original.length;
    const meanWatermarked = sumWatermarked / watermarked.length;

    // Calculate variances and covariance
    let varianceOriginal = 0;
    let varianceWatermarked = 0;
    let covariance = 0;

    for (let i = 0; i < original.length; i++) {
      const diffOriginal = original[i] - meanOriginal;
      const diffWatermarked = watermarked[i] - meanWatermarked;
      varianceOriginal += diffOriginal * diffOriginal;
      varianceWatermarked += diffWatermarked * diffWatermarked;
      covariance += diffOriginal * diffWatermarked;
    }

    varianceOriginal /= original.length;
    varianceWatermarked /= watermarked.length;
    covariance /= original.length;

    // Calculate SSIM
    const numerator =
      (2 * meanOriginal * meanWatermarked + C1) * (2 * covariance + C2);
    const denominator =
      (meanOriginal ** 2 + meanWatermarked ** 2 + C1) *
      (varianceOriginal + varianceWatermarked + C2);

    return numerator / denominator;
  }

  /**
   * Calculate local SSIM using sliding window (more accurate but slower)
   */
  async calculateLocalSSIM(
    originalBuffer: Buffer,
    watermarkedBuffer: Buffer,
    windowSize: number = 8
  ): Promise<number> {
    const [originalData, watermarkedData] = await Promise.all([
      this.getPixelData(originalBuffer),
      this.getPixelData(watermarkedBuffer),
    ]);

    const { width, height, channels } = originalData;
    const original = originalData.data;
    const watermarked = watermarkedData.data;

    // Convert to grayscale for SSIM calculation
    const grayOriginal = this.toGrayscale(original, channels);
    const grayWatermarked = this.toGrayscale(watermarked, channels);

    let ssimSum = 0;
    let windowCount = 0;

    // Sliding window
    for (let y = 0; y <= height - windowSize; y += windowSize) {
      for (let x = 0; x <= width - windowSize; x += windowSize) {
        const windowOriginal = this.extractWindow(
          grayOriginal,
          width,
          x,
          y,
          windowSize
        );
        const windowWatermarked = this.extractWindow(
          grayWatermarked,
          width,
          x,
          y,
          windowSize
        );

        const windowSSIM = this.calculateWindowSSIM(
          windowOriginal,
          windowWatermarked
        );
        ssimSum += windowSSIM;
        windowCount++;
      }
    }

    return ssimSum / windowCount;
  }

  /**
   * Convert RGB to grayscale
   */
  private toGrayscale(data: Buffer, channels: number): number[] {
    const grayscale: number[] = [];
    const pixelCount = data.length / channels;

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * channels;
      // ITU-R BT.601 standard
      const gray =
        0.299 * data[offset] +
        0.587 * data[offset + 1] +
        0.114 * data[offset + 2];
      grayscale.push(gray);
    }

    return grayscale;
  }

  /**
   * Extract a window from grayscale image
   */
  private extractWindow(
    gray: number[],
    width: number,
    x: number,
    y: number,
    size: number
  ): number[] {
    const window: number[] = [];
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        window.push(gray[(y + j) * width + (x + i)]);
      }
    }
    return window;
  }

  /**
   * Calculate SSIM for a single window
   */
  private calculateWindowSSIM(window1: number[], window2: number[]): number {
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    const n = window1.length;

    // Means
    const mean1 = window1.reduce((a, b) => a + b, 0) / n;
    const mean2 = window2.reduce((a, b) => a + b, 0) / n;

    // Variances and covariance
    let var1 = 0,
      var2 = 0,
      covar = 0;
    for (let i = 0; i < n; i++) {
      const d1 = window1[i] - mean1;
      const d2 = window2[i] - mean2;
      var1 += d1 * d1;
      var2 += d2 * d2;
      covar += d1 * d2;
    }
    var1 /= n;
    var2 /= n;
    covar /= n;

    // SSIM formula
    const numerator = (2 * mean1 * mean2 + C1) * (2 * covar + C2);
    const denominator = (mean1 ** 2 + mean2 ** 2 + C1) * (var1 + var2 + C2);

    return numerator / denominator;
  }
}

/**
 * Quick quality check (faster, less accurate)
 */
export async function quickQualityCheck(
  originalBuffer: Buffer,
  watermarkedBuffer: Buffer
): Promise<{ passed: boolean; psnr: number }> {
  const validator = new QualityValidator();
  const result = await validator.validate(originalBuffer, watermarkedBuffer);
  return {
    passed: result.passed,
    psnr: result.metrics.psnr,
  };
}
