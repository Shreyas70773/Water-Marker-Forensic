/**
 * Perceptual Hash Implementation
 * 
 * Creates image fingerprints that survive:
 * - JPEG compression
 * - Resizing
 * - Minor color adjustments
 * - Format conversion
 */

import sharp from "sharp";

/**
 * Compute perceptual hash (pHash) of an image
 * 
 * Algorithm:
 * 1. Resize to 32x32 grayscale
 * 2. Compute DCT
 * 3. Take top-left 8x8 (low frequencies)
 * 4. Calculate median
 * 5. Create hash: 1 if > median, 0 otherwise
 */
export async function computePerceptualHash(imageBuffer: Buffer): Promise<string> {
  // Resize to 32x32 grayscale
  const { data } = await sharp(imageBuffer)
    .resize(32, 32, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert to 2D array
  const pixels: number[][] = [];
  for (let y = 0; y < 32; y++) {
    pixels[y] = [];
    for (let x = 0; x < 32; x++) {
      pixels[y][x] = data[y * 32 + x];
    }
  }

  // Compute simplified DCT (just use pixel averages in 4x4 blocks)
  const dctSize = 8;
  const dct: number[] = [];
  
  for (let by = 0; by < dctSize; by++) {
    for (let bx = 0; bx < dctSize; bx++) {
      let sum = 0;
      for (let y = by * 4; y < (by + 1) * 4; y++) {
        for (let x = bx * 4; x < (bx + 1) * 4; x++) {
          sum += pixels[y][x];
        }
      }
      dct.push(sum / 16);
    }
  }

  // Calculate median (excluding DC component)
  const dctWithoutDC = dct.slice(1);
  const sorted = [...dctWithoutDC].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Generate hash
  let hash = "";
  for (let i = 1; i < dct.length; i++) {
    hash += dct[i] > median ? "1" : "0";
  }

  // Convert to hex
  let hexHash = "";
  for (let i = 0; i < hash.length; i += 4) {
    const nibble = hash.substring(i, i + 4);
    hexHash += parseInt(nibble, 2).toString(16);
  }

  return hexHash;
}

/**
 * Compute average hash (aHash) - simpler but less robust
 */
export async function computeAverageHash(imageBuffer: Buffer): Promise<string> {
  // Resize to 8x8 grayscale
  const { data } = await sharp(imageBuffer)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Calculate average
  let sum = 0;
  for (let i = 0; i < 64; i++) {
    sum += data[i];
  }
  const avg = sum / 64;

  // Generate hash
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += data[i] > avg ? "1" : "0";
  }

  // Convert to hex
  let hexHash = "";
  for (let i = 0; i < hash.length; i += 4) {
    const nibble = hash.substring(i, i + 4);
    hexHash += parseInt(nibble, 2).toString(16);
  }

  return hexHash;
}

/**
 * Compute difference hash (dHash) - good for detecting similar images
 */
export async function computeDifferenceHash(imageBuffer: Buffer): Promise<string> {
  // Resize to 9x8 grayscale (9 wide to get 8 differences)
  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Generate hash based on horizontal differences
  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      hash += left < right ? "1" : "0";
    }
  }

  // Convert to hex
  let hexHash = "";
  for (let i = 0; i < hash.length; i += 4) {
    const nibble = hash.substring(i, i + 4);
    hexHash += parseInt(nibble, 2).toString(16);
  }

  return hexHash;
}

/**
 * Calculate Hamming distance between two hashes
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    // Pad shorter hash
    const maxLen = Math.max(hash1.length, hash2.length);
    hash1 = hash1.padStart(maxLen, "0");
    hash2 = hash2.padStart(maxLen, "0");
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16);
    const n2 = parseInt(hash2[i], 16);
    const xor = n1 ^ n2;
    // Count bits in xor
    distance += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }

  return distance;
}

/**
 * Calculate similarity percentage between two hashes
 */
export function hashSimilarity(hash1: string, hash2: string): number {
  const maxLen = Math.max(hash1.length, hash2.length) * 4; // bits
  const distance = hammingDistance(hash1, hash2);
  return Math.max(0, (maxLen - distance) / maxLen);
}

/**
 * Combined hash for better matching
 */
export interface CombinedHash {
  pHash: string;
  aHash: string;
  dHash: string;
}

/**
 * Compute all three hashes for an image
 */
export async function computeCombinedHash(imageBuffer: Buffer): Promise<CombinedHash> {
  const [pHash, aHash, dHash] = await Promise.all([
    computePerceptualHash(imageBuffer),
    computeAverageHash(imageBuffer),
    computeDifferenceHash(imageBuffer),
  ]);

  return { pHash, aHash, dHash };
}

/**
 * Compare two combined hashes and return overall similarity
 */
export function compareCombinedHashes(
  hash1: CombinedHash,
  hash2: CombinedHash
): { similarity: number; pHashSim: number; aHashSim: number; dHashSim: number } {
  const pHashSim = hashSimilarity(hash1.pHash, hash2.pHash);
  const aHashSim = hashSimilarity(hash1.aHash, hash2.aHash);
  const dHashSim = hashSimilarity(hash1.dHash, hash2.dHash);

  // Weighted average - dHash is most reliable for similar images
  const similarity = pHashSim * 0.3 + aHashSim * 0.2 + dHashSim * 0.5;

  return { similarity, pHashSim, aHashSim, dHashSim };
}
