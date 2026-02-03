/**
 * Reed-Solomon Error Correction Coding
 *
 * Provides forward error correction for watermark payloads,
 * allowing recovery from bit errors caused by image compression.
 *
 * Uses GF(2^8) (Galois Field with 256 elements) with the
 * primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D).
 */

// Galois Field (GF) parameters for GF(2^8)
const GF_SIZE = 256;
const GF_PRIMITIVE = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1

// Lookup tables for GF multiplication
const gfExp: number[] = new Array(512);
const gfLog: number[] = new Array(256);

// Initialize GF lookup tables
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= GF_PRIMITIVE;
    }
  }
  // Extend exp table for easier modular arithmetic
  for (let i = 255; i < 512; i++) {
    gfExp[i] = gfExp[i - 255];
  }
  gfLog[0] = -1; // log(0) is undefined
})();

/**
 * Galois Field multiplication
 */
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return gfExp[gfLog[a] + gfLog[b]];
}

/**
 * Galois Field division
 */
function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero in GF");
  if (a === 0) return 0;
  return gfExp[(gfLog[a] - gfLog[b] + 255) % 255];
}

/**
 * Galois Field power
 */
function gfPow(x: number, power: number): number {
  return gfExp[(gfLog[x] * power) % 255];
}

/**
 * Galois Field polynomial multiplication
 */
function gfPolyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

/**
 * Generate Reed-Solomon generator polynomial
 */
function rsGeneratorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    g = gfPolyMul(g, [1, gfPow(2, i)]);
  }
  return g;
}

/**
 * Reed-Solomon Error Correction Engine
 */
export class ECCEngine {
  private eccBytes: number;
  private generatorPoly: number[];

  /**
   * Create an ECC engine with specified redundancy
   *
   * @param eccBytes - Number of error correction bytes (can correct eccBytes/2 errors)
   */
  constructor(eccBytes: number = 8) {
    this.eccBytes = eccBytes;
    this.generatorPoly = rsGeneratorPoly(eccBytes);
  }

  /**
   * Encode a payload string with Reed-Solomon error correction
   *
   * @param payload - String to encode
   * @returns Binary array (bits) ready for embedding
   */
  encode(payload: string): number[] {
    // Convert string to bytes
    const messageBytes = Buffer.from(payload, "utf-8");
    const message = Array.from(messageBytes);

    // Calculate RS parity bytes
    const encoded = this.rsEncode(message);

    // Convert to binary array
    const binary: number[] = [];
    for (const byte of encoded) {
      for (let i = 7; i >= 0; i--) {
        binary.push((byte >> i) & 1);
      }
    }

    return binary;
  }

  /**
   * Decode a binary array with Reed-Solomon error correction
   *
   * @param binary - Binary array extracted from image
   * @returns Decoded payload and recovery statistics
   */
  decode(binary: number[]): {
    payload: string | null;
    errorsFound: number;
    errorsCorrected: number;
    corrupted: boolean;
  } {
    // Convert binary to bytes
    const bytes: number[] = [];
    for (let i = 0; i + 7 < binary.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | (binary[i + j] & 1);
      }
      bytes.push(byte);
    }

    // Apply RS decoding
    const result = this.rsDecode(bytes);

    if (result.success) {
      // Remove ECC bytes and convert to string
      const messageBytes = result.data.slice(0, -this.eccBytes);
      try {
        const payload = Buffer.from(messageBytes).toString("utf-8");
        return {
          payload,
          errorsFound: result.errorsFound,
          errorsCorrected: result.errorsCorrected,
          corrupted: false,
        };
      } catch {
        return {
          payload: null,
          errorsFound: result.errorsFound,
          errorsCorrected: 0,
          corrupted: true,
        };
      }
    }

    return {
      payload: null,
      errorsFound: -1,
      errorsCorrected: 0,
      corrupted: true,
    };
  }

  /**
   * Calculate required bits for a payload of given length
   *
   * @param payloadByteLength - Length of payload in bytes
   * @returns Number of bits needed (including ECC)
   */
  getRequiredBits(payloadByteLength: number): number {
    return (payloadByteLength + this.eccBytes) * 8;
  }

  /**
   * Get maximum payload length for a given bit capacity
   *
   * @param availableBits - Number of bits available for embedding
   * @returns Maximum payload bytes (excluding ECC)
   */
  getMaxPayloadLength(availableBits: number): number {
    const totalBytes = Math.floor(availableBits / 8);
    return Math.max(0, totalBytes - this.eccBytes);
  }

  /**
   * Reed-Solomon encoding
   */
  private rsEncode(message: number[]): number[] {
    // Pad message with zero bytes for parity
    const encoded = [...message, ...new Array(this.eccBytes).fill(0)];

    // Polynomial division
    for (let i = 0; i < message.length; i++) {
      const coef = encoded[i];
      if (coef !== 0) {
        for (let j = 0; j < this.generatorPoly.length; j++) {
          encoded[i + j] ^= gfMul(this.generatorPoly[j], coef);
        }
      }
    }

    // Combine message with parity
    return [...message, ...encoded.slice(message.length)];
  }

  /**
   * Reed-Solomon decoding with error correction
   */
  private rsDecode(received: number[]): {
    success: boolean;
    data: number[];
    errorsFound: number;
    errorsCorrected: number;
  } {
    // Calculate syndromes
    const syndromes = this.calcSyndromes(received);

    // Check if codeword is valid (all syndromes zero)
    const hasErrors = syndromes.some((s) => s !== 0);
    if (!hasErrors) {
      return {
        success: true,
        data: received,
        errorsFound: 0,
        errorsCorrected: 0,
      };
    }

    // Find error locator polynomial using Berlekamp-Massey
    const errorLocator = this.berlekampMassey(syndromes);
    const numErrors = errorLocator.length - 1;

    // Find error positions using Chien search
    const errorPositions = this.chienSearch(errorLocator, received.length);

    if (errorPositions.length !== numErrors) {
      // Too many errors to correct
      return {
        success: false,
        data: received,
        errorsFound: numErrors,
        errorsCorrected: 0,
      };
    }

    // Calculate error magnitudes using Forney algorithm
    const errorMagnitudes = this.forneyAlgorithm(
      syndromes,
      errorLocator,
      errorPositions
    );

    // Correct errors
    const corrected = [...received];
    for (let i = 0; i < errorPositions.length; i++) {
      const pos = received.length - 1 - errorPositions[i];
      if (pos >= 0 && pos < corrected.length) {
        corrected[pos] ^= errorMagnitudes[i];
      }
    }

    // Verify correction
    const verifySyndromes = this.calcSyndromes(corrected);
    const correctionSuccessful = verifySyndromes.every((s) => s === 0);

    return {
      success: correctionSuccessful,
      data: corrected,
      errorsFound: numErrors,
      errorsCorrected: correctionSuccessful ? numErrors : 0,
    };
  }

  /**
   * Calculate syndromes
   */
  private calcSyndromes(message: number[]): number[] {
    const syndromes: number[] = [];
    for (let i = 0; i < this.eccBytes; i++) {
      let syndrome = 0;
      for (let j = 0; j < message.length; j++) {
        syndrome ^= gfMul(message[j], gfPow(2, i * (message.length - 1 - j)));
      }
      syndromes.push(syndrome);
    }
    return syndromes;
  }

  /**
   * Berlekamp-Massey algorithm for finding error locator polynomial
   */
  private berlekampMassey(syndromes: number[]): number[] {
    let errorLocator = [1];
    let oldLocator = [1];

    for (let i = 0; i < syndromes.length; i++) {
      let delta = syndromes[i];
      for (let j = 1; j < errorLocator.length; j++) {
        delta ^= gfMul(errorLocator[j], syndromes[i - j] || 0);
      }

      oldLocator = [...oldLocator, 0];

      if (delta !== 0) {
        if (oldLocator.length > errorLocator.length) {
          const newLocator = oldLocator.map((v) => gfMul(v, delta));
          oldLocator = errorLocator.map((v) => gfDiv(v, delta));
          errorLocator = newLocator;
        }
        for (let j = 0; j < oldLocator.length; j++) {
          errorLocator[j] ^= gfMul(delta, oldLocator[j]);
        }
      }
    }

    return errorLocator;
  }

  /**
   * Chien search for finding error positions
   */
  private chienSearch(errorLocator: number[], messageLength: number): number[] {
    const positions: number[] = [];
    for (let i = 0; i < messageLength; i++) {
      let sum = 0;
      for (let j = 0; j < errorLocator.length; j++) {
        sum ^= gfMul(errorLocator[j], gfPow(2, j * i));
      }
      if (sum === 0) {
        positions.push(i);
      }
    }
    return positions;
  }

  /**
   * Forney algorithm for calculating error magnitudes
   */
  private forneyAlgorithm(
    syndromes: number[],
    errorLocator: number[],
    errorPositions: number[]
  ): number[] {
    // Calculate error evaluator polynomial
    const errorEvaluator = this.calcErrorEvaluator(syndromes, errorLocator);

    const magnitudes: number[] = [];
    for (const pos of errorPositions) {
      const xi = gfPow(2, pos);
      const xiInv = gfDiv(1, xi);

      // Evaluate error evaluator at xi^-1
      let evalNumerator = 0;
      for (let i = 0; i < errorEvaluator.length; i++) {
        evalNumerator ^= gfMul(errorEvaluator[i], gfPow(xiInv, i));
      }

      // Evaluate formal derivative of error locator at xi^-1
      let evalDenominator = 0;
      for (let i = 1; i < errorLocator.length; i += 2) {
        evalDenominator ^= gfMul(errorLocator[i], gfPow(xiInv, i - 1));
      }

      const magnitude = gfDiv(evalNumerator, evalDenominator);
      magnitudes.push(magnitude);
    }

    return magnitudes;
  }

  /**
   * Calculate error evaluator polynomial
   */
  private calcErrorEvaluator(
    syndromes: number[],
    errorLocator: number[]
  ): number[] {
    const product = gfPolyMul([0, ...syndromes], errorLocator);
    // Truncate to eccBytes terms
    return product.slice(0, this.eccBytes);
  }
}

/**
 * Create an ECC engine with default settings for images
 */
export function createImageECC(): ECCEngine {
  return new ECCEngine(8); // Can correct up to 4 byte errors
}

/**
 * Create an ECC engine with higher redundancy for videos
 */
export function createVideoECC(): ECCEngine {
  return new ECCEngine(12); // Can correct up to 6 byte errors
}
