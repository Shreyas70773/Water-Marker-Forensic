import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
}

interface ProcessVideoOptions {
  inputPath: string;
  tempDir: string;
  workId: string;
  watermarkPayload: string;
  payloadHash: string;
  convexUrl: string;
  userId?: string;
  artworkId?: string;
  onProgress?: (progress: number, step: string) => void;
}

interface ProcessVideoResult {
  watermarkedVideoBuffer: Buffer;
  framesProcessed: number;
  framesTotal: number;
  metadata: VideoMetadata;
  perceptualHashes: {
    pHash: string;
    aHash: string;
    dHash: string;
  };
}

async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('No video stream found'));
      
      const fpsStr = videoStream.r_frame_rate || '30/1';
      const [num, den] = fpsStr.split('/').map(Number);
      const fps = den ? num / den : num;
      
      resolve({
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        duration: parseFloat(String(videoStream.duration || metadata.format.duration || 0)),
        fps: Math.round(fps),
        codec: videoStream.codec_name || 'h264',
      });
    });
  });
}

async function extractFrames(videoPath: string, outputDir: string, fps: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const outputPattern = path.join(outputDir, 'frame_%06d.png');
    
    ffmpeg(videoPath)
      .outputOptions(['-q:v 1', `-r ${fps}`])
      .output(outputPattern)
      .on('end', async () => {
        try {
          const files = await fs.readdir(outputDir);
          const framePaths = files
            .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
            .sort()
            .map(f => path.join(outputDir, f));
          resolve(framePaths);
        } catch (e) {
          reject(e);
        }
      })
      .on('error', reject)
      .run();
  });
}

async function reconstructVideo(
  framesDir: string,
  originalVideoPath: string,
  outputPath: string,
  metadata: VideoMetadata
): Promise<void> {
  const framePattern = path.join(framesDir, 'watermarked_%06d.png');
  
  return new Promise((resolve, reject) => {
    ffmpeg(framePattern)
      .inputOptions([`-framerate ${metadata.fps}`])
      .addInput(originalVideoPath)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset slow',
        '-crf 17',
        `-r ${metadata.fps}`,
        '-map 0:v:0',
        '-map 1:a:0?',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Simple DCT-based watermark embedding
 * Embeds payload bits into DCT coefficients of image blocks
 */
async function embedWatermark(
  imageBuffer: Buffer,
  payload: string,
  workId: string,
  payloadHash: string
): Promise<Buffer> {
  // Convert payload to bits
  const payloadBits: number[] = [];
  for (const char of payload) {
    const code = char.charCodeAt(0);
    for (let i = 7; i >= 0; i--) {
      payloadBits.push((code >> i) & 1);
    }
  }
  
  // Load image
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const { data, info } = await image
    .raw()
    .removeAlpha()
    .toBuffer({ resolveWithObject: true });
  
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  
  // Create seed from workId and payloadHash for reproducible coefficient selection
  const seed = crypto.createHash('sha256').update(workId + payloadHash).digest();
  
  // Simple watermark embedding: modify LSBs of specific pixels
  // This is a simplified version - the main app has more robust DCT embedding
  const blockSize = 8;
  const strength = 15; // Modification strength
  
  let bitIndex = 0;
  const modifiedData = Buffer.from(data);
  
  for (let y = 0; y < height - blockSize && bitIndex < payloadBits.length; y += blockSize) {
    for (let x = 0; x < width - blockSize && bitIndex < payloadBits.length; x += blockSize) {
      // Use seed to select a pixel within the block
      const seedOffset = ((y / blockSize) * (width / blockSize) + (x / blockSize)) % seed.length;
      const pixelOffset = seed[seedOffset] % (blockSize * blockSize);
      
      const px = x + (pixelOffset % blockSize);
      const py = y + Math.floor(pixelOffset / blockSize);
      
      // Modify the luminance channel
      const idx = (py * width + px) * channels;
      const currentValue = modifiedData[idx];
      const bit = payloadBits[bitIndex];
      
      // Embed bit by adjusting pixel value
      if (bit === 1) {
        modifiedData[idx] = Math.min(255, currentValue + strength);
      } else {
        modifiedData[idx] = Math.max(0, currentValue - strength);
      }
      
      bitIndex++;
    }
  }
  
  // Convert back to image
  return sharp(modifiedData, {
    raw: { width, height, channels },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * Compute perceptual hash of image
 * Simple average hash implementation
 */
async function computePerceptualHash(imageBuffer: Buffer): Promise<{ pHash: string; aHash: string; dHash: string }> {
  // Resize to 8x8 grayscale for hash
  const { data } = await sharp(imageBuffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  // Calculate average
  const pixels = Array.from(data);
  const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  
  // Generate hash: 1 if above average, 0 if below
  let hash = '';
  for (const pixel of pixels) {
    hash += pixel >= avg ? '1' : '0';
  }
  
  // Convert to hex
  const hexHash = parseInt(hash, 2).toString(16).padStart(16, '0');
  
  return {
    pHash: hexHash,
    aHash: hexHash, // Simplified: same as pHash
    dHash: hexHash, // Simplified: same as pHash
  };
}

export async function processVideo(options: ProcessVideoOptions): Promise<ProcessVideoResult> {
  const {
    inputPath,
    tempDir,
    workId,
    watermarkPayload,
    payloadHash,
    onProgress,
  } = options;
  
  const framesDir = path.join(tempDir, 'frames');
  const watermarkedFramesDir = path.join(tempDir, 'watermarked');
  const outputPath = path.join(tempDir, 'output.mp4');
  
  await fs.mkdir(framesDir, { recursive: true });
  await fs.mkdir(watermarkedFramesDir, { recursive: true });
  
  // 1. Get video metadata
  onProgress?.(5, 'Reading video metadata...');
  const metadata = await getVideoMetadata(inputPath);
  console.log(`[VIDEO] Metadata: ${metadata.width}x${metadata.height} @ ${metadata.fps}fps, ${metadata.duration}s`);
  
  // 2. Extract frames
  onProgress?.(10, 'Extracting frames...');
  const framePaths = await extractFrames(inputPath, framesDir, metadata.fps);
  console.log(`[VIDEO] Extracted ${framePaths.length} frames`);
  
  if (framePaths.length === 0) {
    throw new Error('No frames extracted from video');
  }
  
  // 3. Watermark each frame
  const totalFrames = framePaths.length;
  let processedFrames = 0;
  
  for (let i = 0; i < framePaths.length; i++) {
    const progress = 10 + Math.floor((i / totalFrames) * 70);
    if (i % 10 === 0) {
      onProgress?.(progress, `Watermarking frame ${i + 1}/${totalFrames}...`);
    }
    
    const frameBuffer = await fs.readFile(framePaths[i]);
    const watermarkedBuffer = await embedWatermark(
      frameBuffer,
      watermarkPayload,
      `${workId}-frame${i}`,
      payloadHash
    );
    
    const outputFramePath = path.join(watermarkedFramesDir, `watermarked_${String(i + 1).padStart(6, '0')}.png`);
    await fs.writeFile(outputFramePath, watermarkedBuffer);
    processedFrames++;
  }
  
  console.log(`[VIDEO] Watermarked ${processedFrames} frames`);
  
  // 4. Compute perceptual hash from middle frame
  onProgress?.(82, 'Computing perceptual hashes...');
  const middleFrameIndex = Math.floor(framePaths.length / 2);
  const middleFrameBuffer = await fs.readFile(framePaths[middleFrameIndex]);
  const hashes = await computePerceptualHash(middleFrameBuffer);
  
  // 5. Reconstruct video
  onProgress?.(85, 'Reconstructing video...');
  await reconstructVideo(watermarkedFramesDir, inputPath, outputPath, metadata);
  console.log(`[VIDEO] Video reconstructed`);
  
  // 6. Read output video
  onProgress?.(95, 'Finalizing...');
  const watermarkedVideoBuffer = await fs.readFile(outputPath);
  
  onProgress?.(100, 'Complete!');
  
  return {
    watermarkedVideoBuffer,
    framesProcessed: processedFrames,
    framesTotal: totalFrames,
    metadata,
    perceptualHashes: hashes,
  };
}
