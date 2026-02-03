/**
 * Blockchain Notarization Module
 *
 * Provides immutable timestamp proof on Polygon network.
 * Stores workId:mediaHash:payloadHash in transaction data,
 * creating undeniable proof of when the work was registered.
 */

import { ethers } from "ethers";

/**
 * Supported blockchain networks
 */
export type BlockchainNetwork = "polygon" | "polygon-amoy";

/**
 * Network configuration
 */
const NETWORK_CONFIG: Record<
  BlockchainNetwork,
  { rpcUrl: string; chainId: number; explorerUrl: string }
> = {
  polygon: {
    rpcUrl: "https://polygon-rpc.com",
    chainId: 137,
    explorerUrl: "https://polygonscan.com",
  },
  "polygon-amoy": {
    rpcUrl: "https://rpc-amoy.polygon.technology",
    chainId: 80002,
    explorerUrl: "https://amoy.polygonscan.com",
  },
};

/**
 * Notarization result
 */
export interface NotarizationResult {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  network: BlockchainNetwork;
  gasUsed: string;
  explorerUrl: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  workId: string;
  mediaHash: string;
  payloadHash: string;
  timestamp: number;
  blockNumber: number;
  confirmed: boolean;
  network: BlockchainNetwork;
}

/**
 * Blockchain Notary class
 */
export class BlockchainNotary {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private network: BlockchainNetwork;
  private explorerUrl: string;

  /**
   * Create a blockchain notary
   *
   * @param network - Target network (polygon or polygon-mumbai)
   * @param privateKey - Ethereum private key (from env var if not provided)
   */
  constructor(network: BlockchainNetwork = "polygon-amoy", privateKey?: string) {
    this.network = network;

    const config = NETWORK_CONFIG[network];
    // Use POLYGON_RPC_URL env var or fall back to config default
    const rpcUrl = process.env.POLYGON_RPC_URL || config.rpcUrl;

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.explorerUrl = config.explorerUrl;

    // Get private key from env or parameter
    const key = privateKey || process.env.NOTARY_PRIVATE_KEY;
    if (!key) {
      throw new Error(
        "NOTARY_PRIVATE_KEY not configured. This should be an Ethereum private key."
      );
    }

    this.wallet = new ethers.Wallet(key, this.provider);
  }

  /**
   * Notarize artwork on blockchain
   *
   * Creates a self-transaction with notarization data in the calldata.
   * This provides an immutable, timestamped record on the blockchain.
   *
   * @param workId - Unique work identifier
   * @param mediaHash - SHA-256 hash of original media
   * @param payloadHash - SHA-256 hash of canonical payload
   */
  async notarize(
    workId: string,
    mediaHash: string,
    payloadHash: string
  ): Promise<NotarizationResult> {
    // Create notarization data
    const notarizationData = `NOTARIZE:${workId}:${mediaHash}:${payloadHash}`;
    const dataHex = ethers.hexlify(ethers.toUtf8Bytes(notarizationData));

    // Estimate gas
    const gasEstimate = await this.provider.estimateGas({
      to: this.wallet.address,
      data: dataHex,
    });

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("30", "gwei");

    // Send self-transaction with data
    const tx = await this.wallet.sendTransaction({
      to: this.wallet.address, // Self-transaction
      value: 0,
      data: dataHex,
      gasLimit: gasEstimate,
      gasPrice: gasPrice,
    });

    // Wait for confirmation
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction failed - no receipt");
    }

    // Get block for timestamp
    const block = await this.provider.getBlock(receipt.blockNumber);
    if (!block) {
      throw new Error("Could not retrieve block information");
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: block.timestamp,
      network: this.network,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: `${this.explorerUrl}/tx/${receipt.hash}`,
    };
  }

  /**
   * Verify notarization by transaction hash
   *
   * @param txHash - Transaction hash to verify
   */
  async verify(txHash: string): Promise<VerificationResult> {
    // Get transaction
    const tx = await this.provider.getTransaction(txHash);
    if (!tx) {
      throw new Error(`Transaction not found: ${txHash}`);
    }

    // Wait for confirmation if pending
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction not confirmed");
    }

    // Get block for timestamp
    const block = await this.provider.getBlock(receipt.blockNumber);
    if (!block) {
      throw new Error("Could not retrieve block information");
    }

    // Parse transaction data
    const dataText = ethers.toUtf8String(tx.data);
    const parts = dataText.split(":");

    if (parts.length !== 4 || parts[0] !== "NOTARIZE") {
      throw new Error(
        `Invalid notarization format. Expected NOTARIZE:workId:mediaHash:payloadHash, got: ${dataText.substring(0, 100)}`
      );
    }

    const [, workId, mediaHash, payloadHash] = parts;

    return {
      workId,
      mediaHash,
      payloadHash,
      timestamp: block.timestamp,
      blockNumber: receipt.blockNumber,
      confirmed: receipt.status === 1,
      network: this.network,
    };
  }

  /**
   * Get wallet address (for funding)
   */
  getWalletAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  /**
   * Check if wallet has sufficient balance for notarization
   */
  async hasSufficientBalance(): Promise<boolean> {
    const balance = await this.provider.getBalance(this.wallet.address);
    // Minimum balance: 0.01 MATIC (should cover multiple notarizations)
    const minBalance = ethers.parseEther("0.01");
    return balance >= minBalance;
  }

  /**
   * Get explorer URL for a transaction
   */
  getExplorerUrl(txHash: string): string {
    return `${this.explorerUrl}/tx/${txHash}`;
  }

  /**
   * Get current network
   */
  getNetwork(): BlockchainNetwork {
    return this.network;
  }
}

/**
 * Create a blockchain notary for testnet
 */
export function createTestnetNotary(): BlockchainNotary {
  return new BlockchainNotary("polygon-amoy");
}

/**
 * Create a blockchain notary for mainnet
 */
export function createMainnetNotary(): BlockchainNotary {
  return new BlockchainNotary("polygon");
}

/**
 * Verify a notarization without creating a full notary instance
 */
export async function verifyNotarization(
  txHash: string,
  network: BlockchainNetwork = "polygon-amoy"
): Promise<VerificationResult> {
  const notary = new BlockchainNotary(network);
  return notary.verify(txHash);
}
