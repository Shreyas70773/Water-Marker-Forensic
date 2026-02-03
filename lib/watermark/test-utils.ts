/**
 * Watermark Testing Utilities
 *
 * Tools for testing watermark robustness against:
 * - JPEG compression at various quality levels
 * - Image resizing
 * - Moderate cropping
 * - Format conversion
 */

import sharp from "sharp";
import { ImageWatermarkEngine } from "./image-watermark";
import { QualityValidator } from "./quality-validator";
import { HashEngine } from "../crypto/hasher";

/**
 * Test configuration for robustness testing
 */
export interface RobustnessTestConfig {
  /** JPEG quality levels to test (default: [95, 85, 75, 65]) */
  jpegQualities?: number[];
  /** Resize scales to test (default: [0.5, 0.75, 1.25, 1.5]) */
  resizeScales?: number[];
  /** Crop percentages to test (default: [0.05, 0.1, 0.15]) */
  cropPercentages?: number[];
}

/**
 * Default test configuration
 */
const DEFAULT_CONFIG: RobustnessTestConfig = {
  jpegQualities: [95, 85, 75, 65],
  resizeScales: [0.5, 0.75, 1.25, 1.5],
  cropPercentages: [0.05, 0.1, 0.15],
};

/**
 * Test result for a single transformation
 */
export interface TransformationTestResult {
  transformation: string;
  parameters: Record<string, number | string | boolean>;
  detected: boolean;
  confidence: number;
  errorsFound: number;
  errorsCorrected: number;
  payload: string | null;
}

/**
 * Full robustness test results
 */
export interface RobustnessTestResults {
  originalPayload: string;
  workId: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  results: TransformationTestResult[];
}

/**
 * Run robustness tests on a watermarked image
 */
export async function testWatermarkRobustness(
  originalBuffer: Buffer,
  watermarkedBuffer: Buffer,
  payload: string,
  workId: string,
  payloadHash: string,
  config: RobustnessTestConfig = {}
): Promise<RobustnessTestResults> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const engine = new ImageWatermarkEngine();
  const results: TransformationTestResult[] = [];

  // Test JPEG compression
  for (const quality of cfg.jpegQualities || []) {
    const compressed = await sharp(watermarkedBuffer)
      .jpeg({ quality })
      .toBuffer();

    const extractResult = await engine.extract(
      compressed,
      workId,
      payloadHash,
      Buffer.byteLength(payload, "utf-8"),
      8
    );

    results.push({
      transformation: "JPEG Compression",
      parameters: { quality },
      detected: extractResult.payload !== null,
      confidence: extractResult.confidence,
      errorsFound: extractResult.errorsFound,
      errorsCorrected: extractResult.errorsCorrected,
      payload: extractResult.payload,
    });
  }

  // Test resizing
  const metadata = await sharp(watermarkedBuffer).metadata();
  const originalWidth = metadata.width || 800;
  const originalHeight = metadata.height || 600;

  for (const scale of cfg.resizeScales || []) {
    const resized = await sharp(watermarkedBuffer)
      .resize(Math.round(originalWidth * scale), Math.round(originalHeight * scale))
      .resize(originalWidth, originalHeight) // Resize back to original
      .jpeg({ quality: 95 })
      .toBuffer();

    const extractResult = await engine.extract(
      resized,
      workId,
      payloadHash,
      Buffer.byteLength(payload, "utf-8"),
      8
    );

    results.push({
      transformation: "Resize",
      parameters: { scale, resizeBack: true },
      detected: extractResult.payload !== null,
      confidence: extractResult.confidence,
      errorsFound: extractResult.errorsFound,
      errorsCorrected: extractResult.errorsCorrected,
      payload: extractResult.payload,
    });
  }

  // Test cropping
  for (const cropPercent of cfg.cropPercentages || []) {
    const cropX = Math.round(originalWidth * cropPercent);
    const cropY = Math.round(originalHeight * cropPercent);
    const newWidth = originalWidth - 2 * cropX;
    const newHeight = originalHeight - 2 * cropY;

    const cropped = await sharp(watermarkedBuffer)
      .extract({
        left: cropX,
        top: cropY,
        width: newWidth,
        height: newHeight,
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    const extractResult = await engine.extract(
      cropped,
      workId,
      payloadHash,
      Buffer.byteLength(payload, "utf-8"),
      8
    );

    results.push({
      transformation: "Crop",
      parameters: { cropPercent },
      detected: extractResult.payload !== null,
      confidence: extractResult.confidence,
      errorsFound: extractResult.errorsFound,
      errorsCorrected: extractResult.errorsCorrected,
      payload: extractResult.payload,
    });
  }

  // Calculate summary
  const passed = results.filter((r) => r.detected && r.confidence >= 0.5).length;
  const failed = results.length - passed;

  return {
    originalPayload: payload,
    workId,
    totalTests: results.length,
    passed,
    failed,
    passRate: passed / results.length,
    results,
  };
}

/**
 * Run a quick quality test
 */
export async function quickQualityTest(
  originalBuffer: Buffer,
  watermarkedBuffer: Buffer
): Promise<{
  psnr: number;
  ssim: number;
  passed: boolean;
}> {
  const validator = new QualityValidator();
  const result = await validator.validate(originalBuffer, watermarkedBuffer);

  return {
    psnr: result.metrics.psnr,
    ssim: result.metrics.ssim,
    passed: result.passed,
  };
}

/**
 * Test watermark with simulated Instagram compression
 * (JPEG quality ~72, max dimension 1080px)
 */
export async function testInstagramCompression(
  watermarkedBuffer: Buffer,
  workId: string,
  payloadHash: string,
  payloadLength: number
): Promise<TransformationTestResult> {
  const engine = new ImageWatermarkEngine();

  // Simulate Instagram: resize to max 1080px, JPEG quality ~72
  const metadata = await sharp(watermarkedBuffer).metadata();
  const maxDim = 1080;
  let width = metadata.width || 800;
  let height = metadata.height || 600;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height / width) * maxDim);
      width = maxDim;
    } else {
      width = Math.round((width / height) * maxDim);
      height = maxDim;
    }
  }

  const instagramSimulated = await sharp(watermarkedBuffer)
    .resize(width, height)
    .jpeg({ quality: 72 })
    .toBuffer();

  const result = await engine.extract(
    instagramSimulated,
    workId,
    payloadHash,
    payloadLength,
    8
  );

  return {
    transformation: "Instagram Simulation",
    parameters: { width, height, quality: 72 },
    detected: result.payload !== null,
    confidence: result.confidence,
    errorsFound: result.errorsFound,
    errorsCorrected: result.errorsCorrected,
    payload: result.payload,
  };
}

/**
 * Generate a test report as text
 */
export function generateTestReport(results: RobustnessTestResults): string {
  let report = "=== WATERMARK ROBUSTNESS TEST REPORT ===\n\n";
  report += `Work ID: ${results.workId}\n`;
  report += `Original Payload: ${results.originalPayload}\n\n`;
  report += `Summary: ${results.passed}/${results.totalTests} tests passed (${(results.passRate * 100).toFixed(1)}%)\n\n`;
  report += "--- Detailed Results ---\n\n";

  for (const result of results.results) {
    report += `${result.transformation}:\n`;
    report += `  Parameters: ${JSON.stringify(result.parameters)}\n`;
    report += `  Detected: ${result.detected ? "YES" : "NO"}\n`;
    report += `  Confidence: ${(result.confidence * 100).toFixed(1)}%\n`;
    report += `  Errors: ${result.errorsFound} found, ${result.errorsCorrected} corrected\n`;
    if (result.payload) {
      report += `  Payload: ${result.payload}\n`;
    }
    report += "\n";
  }

  return report;
}
