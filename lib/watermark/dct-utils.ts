/**
 * 2D Discrete Cosine Transform (DCT) Implementation
 *
 * This module provides DCT-II and IDCT-II implementations for
 * frequency-domain watermark embedding. Uses 8x8 blocks (JPEG standard).
 *
 * The DCT transforms spatial domain data into frequency domain,
 * where watermarks can be embedded in mid-frequency coefficients
 * for optimal invisibility and robustness.
 */

/**
 * Precompute cosine lookup table for performance
 */
const cosineTable: Map<string, number> = new Map();

function getCosine(n: number, k: number, N: number): number {
  const key = `${n}-${k}-${N}`;
  if (!cosineTable.has(key)) {
    cosineTable.set(key, Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N)));
  }
  return cosineTable.get(key)!;
}

/**
 * Compute alpha coefficient for DCT normalization
 */
function alpha(k: number, N: number): number {
  return k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
}

/**
 * 1D Discrete Cosine Transform (Type-II)
 *
 * @param signal - Input signal array
 * @returns DCT coefficients
 */
export function dct1d(signal: number[]): number[] {
  const N = signal.length;
  const result: number[] = new Array(N);

  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += signal[n] * getCosine(n, k, N);
    }
    result[k] = alpha(k, N) * sum;
  }

  return result;
}

/**
 * 1D Inverse Discrete Cosine Transform (Type-II)
 *
 * @param coefficients - DCT coefficients
 * @returns Reconstructed signal
 */
export function idct1d(coefficients: number[]): number[] {
  const N = coefficients.length;
  const result: number[] = new Array(N);

  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      sum += alpha(k, N) * coefficients[k] * getCosine(n, k, N);
    }
    result[n] = sum;
  }

  return result;
}

/**
 * 2D Discrete Cosine Transform
 *
 * Applies separable 2D DCT: DCT on rows, then DCT on columns.
 * This is equivalent to the full 2D DCT but more efficient.
 *
 * @param block - 2D array (typically 8x8)
 * @param size - Block size (default 8)
 * @returns 2D DCT coefficients
 */
export function dct2d(block: number[][], size: number = 8): number[][] {
  // Validate input
  if (block.length !== size || block[0].length !== size) {
    throw new Error(`Block must be ${size}x${size}`);
  }

  // Step 1: Apply 1D DCT to each row
  const rowTransformed: number[][] = [];
  for (let i = 0; i < size; i++) {
    rowTransformed.push(dct1d(block[i]));
  }

  // Step 2: Apply 1D DCT to each column
  const result: number[][] = Array.from({ length: size }, () =>
    new Array(size).fill(0)
  );

  for (let j = 0; j < size; j++) {
    // Extract column
    const column: number[] = [];
    for (let i = 0; i < size; i++) {
      column.push(rowTransformed[i][j]);
    }

    // Apply DCT to column
    const transformedColumn = dct1d(column);

    // Store result
    for (let i = 0; i < size; i++) {
      result[i][j] = transformedColumn[i];
    }
  }

  return result;
}

/**
 * 2D Inverse Discrete Cosine Transform
 *
 * Reconstructs spatial domain data from DCT coefficients.
 *
 * @param coefficients - 2D DCT coefficients
 * @param size - Block size (default 8)
 * @returns Reconstructed 2D block
 */
export function idct2d(coefficients: number[][], size: number = 8): number[][] {
  // Validate input
  if (coefficients.length !== size || coefficients[0].length !== size) {
    throw new Error(`Coefficients must be ${size}x${size}`);
  }

  // Step 1: Apply 1D IDCT to each column
  const columnTransformed: number[][] = Array.from({ length: size }, () =>
    new Array(size).fill(0)
  );

  for (let j = 0; j < size; j++) {
    // Extract column
    const column: number[] = [];
    for (let i = 0; i < size; i++) {
      column.push(coefficients[i][j]);
    }

    // Apply IDCT to column
    const transformedColumn = idct1d(column);

    // Store result
    for (let i = 0; i < size; i++) {
      columnTransformed[i][j] = transformedColumn[i];
    }
  }

  // Step 2: Apply 1D IDCT to each row
  const result: number[][] = [];
  for (let i = 0; i < size; i++) {
    result.push(idct1d(columnTransformed[i]));
  }

  return result;
}

/**
 * Extract an 8x8 block from an image at given position
 *
 * @param image - Flat array of pixel values
 * @param width - Image width
 * @param x - Block X position (top-left corner)
 * @param y - Block Y position (top-left corner)
 * @param blockSize - Block size (default 8)
 * @returns 2D block array
 */
export function extractBlock(
  image: number[],
  width: number,
  x: number,
  y: number,
  blockSize: number = 8
): number[][] {
  const block: number[][] = [];

  for (let i = 0; i < blockSize; i++) {
    const row: number[] = [];
    for (let j = 0; j < blockSize; j++) {
      const pixelIndex = (y + i) * width + (x + j);
      row.push(image[pixelIndex] || 0);
    }
    block.push(row);
  }

  return block;
}

/**
 * Write a block back to an image at given position
 *
 * @param image - Flat array of pixel values (modified in place)
 * @param width - Image width
 * @param block - 2D block to write
 * @param x - Block X position (top-left corner)
 * @param y - Block Y position (top-left corner)
 * @param blockSize - Block size (default 8)
 */
export function writeBlock(
  image: number[],
  width: number,
  block: number[][],
  x: number,
  y: number,
  blockSize: number = 8
): void {
  for (let i = 0; i < blockSize; i++) {
    for (let j = 0; j < blockSize; j++) {
      const pixelIndex = (y + i) * width + (x + j);
      // Clamp values to valid pixel range [0, 255]
      image[pixelIndex] = Math.max(0, Math.min(255, Math.round(block[i][j])));
    }
  }
}

/**
 * Get the number of complete blocks that fit in an image
 *
 * @param width - Image width
 * @param height - Image height
 * @param blockSize - Block size (default 8)
 * @returns Object with numBlocksX and numBlocksY
 */
export function getBlockCount(
  width: number,
  height: number,
  blockSize: number = 8
): { numBlocksX: number; numBlocksY: number; totalBlocks: number } {
  const numBlocksX = Math.floor(width / blockSize);
  const numBlocksY = Math.floor(height / blockSize);
  return {
    numBlocksX,
    numBlocksY,
    totalBlocks: numBlocksX * numBlocksY,
  };
}

/**
 * DCT coefficient positions ordered by frequency (zigzag order)
 * Used for selecting embedding positions
 */
export const ZIGZAG_ORDER: [number, number][] = [
  [0, 0], // DC
  [0, 1],
  [1, 0],
  [2, 0],
  [1, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [2, 1],
  [3, 0],
  [4, 0],
  [3, 1],
  [2, 2],
  [1, 3],
  [0, 4],
  [0, 5],
  [1, 4],
  [2, 3],
  [3, 2],
  [4, 1],
  [5, 0],
  [6, 0],
  [5, 1],
  [4, 2],
  [3, 3],
  [2, 4],
  [1, 5],
  [0, 6],
  [0, 7],
  [1, 6],
  [2, 5],
  [3, 4],
  [4, 3],
  [5, 2],
  [6, 1],
  [7, 0],
  [7, 1],
  [6, 2],
  [5, 3],
  [4, 4],
  [3, 5],
  [2, 6],
  [1, 7],
  [2, 7],
  [3, 6],
  [4, 5],
  [5, 4],
  [6, 3],
  [7, 2],
  [7, 3],
  [6, 4],
  [5, 5],
  [4, 6],
  [3, 7],
  [4, 7],
  [5, 6],
  [6, 5],
  [7, 4],
  [7, 5],
  [6, 6],
  [5, 7],
  [6, 7],
  [7, 6],
  [7, 7],
];

/**
 * Mid-frequency coefficient positions (ideal for watermarking)
 * Avoids DC (too visible) and high-frequency (lost in compression)
 */
export const MID_FREQUENCY_POSITIONS: [number, number][] = [
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
];

/**
 * Level shift pixel values for DCT (center around 0)
 *
 * @param block - 2D block of pixel values [0-255]
 * @returns Level-shifted block [-128 to 127]
 */
export function levelShift(block: number[][]): number[][] {
  return block.map((row) => row.map((val) => val - 128));
}

/**
 * Inverse level shift (restore to [0-255] range)
 *
 * @param block - Level-shifted block
 * @returns Block with values in [0-255]
 */
export function inverseLevelShift(block: number[][]): number[][] {
  return block.map((row) =>
    row.map((val) => Math.max(0, Math.min(255, Math.round(val + 128))))
  );
}
