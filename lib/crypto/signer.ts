/**
 * Evidence Signer using secp256k1
 *
 * Provides server-side cryptographic signatures for evidence packages,
 * proving that the watermark system generated specific evidence at
 * a specific time.
 *
 * Uses secp256k1 (same curve as Ethereum/Bitcoin) for compatibility
 * with blockchain ecosystems.
 */

import * as secp256k1 from "@noble/secp256k1";
import crypto from "crypto";

/**
 * Evidence package to be signed
 */
export interface EvidencePackage {
  mediaHash: string;
  payloadHash: string;
  timestamp: number;
  workId?: string;
}

/**
 * Signed evidence result
 */
export interface SignedEvidence {
  evidence: EvidencePackage;
  signature: string;
  publicKey: string;
  algorithm: string;
}

/**
 * Evidence Signer class
 */
export class EvidenceSigner {
  private privateKey: Uint8Array;
  private publicKey: string;

  /**
   * Create an evidence signer
   *
   * @param privateKeyHex - 32-byte private key as hex string (from env var)
   */
  constructor(privateKeyHex?: string) {
    // Load from environment variable if not provided
    const keyHex = privateKeyHex || process.env.EVIDENCE_SIGNING_KEY;

    if (!keyHex) {
      throw new Error(
        "EVIDENCE_SIGNING_KEY not configured. Generate with: openssl rand -hex 32"
      );
    }

    // Validate key length (32 bytes = 64 hex chars)
    if (keyHex.length !== 64) {
      throw new Error(
        "Invalid signing key length. Must be 32 bytes (64 hex characters)"
      );
    }

    this.privateKey = Buffer.from(keyHex, "hex");
    this.publicKey = Buffer.from(
      secp256k1.getPublicKey(this.privateKey)
    ).toString("hex");
  }

  /**
   * Sign an evidence package
   *
   * Creates a deterministic signature over:
   * mediaHash:payloadHash:timestamp
   *
   * @param mediaHash - SHA-256 hash of original media
   * @param payloadHash - SHA-256 hash of canonical payload
   * @param timestamp - Unix timestamp (milliseconds)
   * @returns Signature as hex string
   */
  async signEvidence(
    mediaHash: string,
    payloadHash: string,
    timestamp: number
  ): Promise<string> {
    // Create canonical message
    const message = this.createMessage(mediaHash, payloadHash, timestamp);

    // Hash the message
    const messageHash = crypto
      .createHash("sha256")
      .update(message, "utf-8")
      .digest();

    // Sign with secp256k1
    const signature = await secp256k1.signAsync(messageHash, this.privateKey);

    // Return signature as hex
    return Buffer.from(signature.toCompactRawBytes()).toString("hex");
  }

  /**
   * Sign a complete evidence package
   */
  async signEvidencePackage(
    evidence: EvidencePackage
  ): Promise<SignedEvidence> {
    const signature = await this.signEvidence(
      evidence.mediaHash,
      evidence.payloadHash,
      evidence.timestamp
    );

    return {
      evidence,
      signature,
      publicKey: this.publicKey,
      algorithm: "secp256k1",
    };
  }

  /**
   * Verify an evidence signature
   *
   * @param mediaHash - Media hash from evidence
   * @param payloadHash - Payload hash from evidence
   * @param timestamp - Timestamp from evidence
   * @param signature - Signature to verify (hex string)
   * @param publicKey - Public key to verify against (hex string)
   * @returns True if signature is valid
   */
  static async verifyEvidence(
    mediaHash: string,
    payloadHash: string,
    timestamp: number,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      // Recreate the message
      const message = `${mediaHash}:${payloadHash}:${timestamp}`;
      const messageHash = crypto
        .createHash("sha256")
        .update(message, "utf-8")
        .digest();

      // Verify signature
      const signatureBytes = Buffer.from(signature, "hex");
      const publicKeyBytes = Buffer.from(publicKey, "hex");

      return secp256k1.verify(
        secp256k1.Signature.fromCompact(signatureBytes),
        messageHash,
        publicKeyBytes
      );
    } catch (error) {
      console.error("Signature verification failed:", error);
      return false;
    }
  }

  /**
   * Get the public key for this signer
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Create canonical message format
   */
  private createMessage(
    mediaHash: string,
    payloadHash: string,
    timestamp: number
  ): string {
    return `${mediaHash}:${payloadHash}:${timestamp}`;
  }

  /**
   * Generate a new signing key pair (for initial setup)
   */
  static generateKeyPair(): { privateKey: string; publicKey: string } {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey);

    return {
      privateKey: Buffer.from(privateKey).toString("hex"),
      publicKey: Buffer.from(publicKey).toString("hex"),
    };
  }
}

/**
 * Create an evidence signer with environment variable key
 */
export function createEvidenceSigner(): EvidenceSigner {
  return new EvidenceSigner();
}

/**
 * Verify evidence without creating a signer instance
 */
export async function verifyEvidence(
  mediaHash: string,
  payloadHash: string,
  timestamp: number,
  signature: string,
  publicKey: string
): Promise<boolean> {
  return EvidenceSigner.verifyEvidence(
    mediaHash,
    payloadHash,
    timestamp,
    signature,
    publicKey
  );
}
