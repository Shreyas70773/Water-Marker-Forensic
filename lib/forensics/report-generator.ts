/**
 * Forensic Report Generator
 *
 * Generates court-ready PDF reports with complete evidence chain:
 * - Artwork identification
 * - Cryptographic evidence (hashes)
 * - Blockchain notarization proof
 * - Watermark detection analysis
 * - Server-side signatures
 */

import PDFDocument from "pdfkit";

/**
 * Forensic report data structure
 */
export interface ForensicReportData {
  artwork: {
    workId: string;
    author: string;
    displayName: string;
    createdUtc: string;
    mediaType: "IMAGE" | "VIDEO";
    originalFileName: string;
    originalHash: string;
    payloadHash: string;
    aspectRatio: string;
  };
  detection?: {
    confidence: number;
    confidenceLevel: string;
    framesAnalyzed?: number;
    eccRecoveryRate?: string;
    errorsFound?: number;
    errorsCorrected?: number;
    detectedAt: string;
  };
  blockchain: {
    txHash: string;
    network: string;
    blockNumber: number;
    timestamp: number;
  };
  evidence: {
    signature: string;
    publicKey: string;
    algorithm: string;
  };
  qualityMetrics: {
    psnr: number;
    ssim: number;
  };
}

/**
 * Forensic Report Generator
 */
export class ForensicReportGenerator {
  /**
   * Generate a forensic PDF report
   *
   * @param data - Report data
   * @returns Buffer containing PDF
   */
  async generateReport(data: ForensicReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 50,
        info: {
          Title: `Forensic Watermark Report - ${data.artwork.workId}`,
          Author: "WaterMarker Forensic System",
          Subject: "Digital Watermark Forensic Evidence",
          Keywords: "watermark, forensic, blockchain, evidence",
        },
      });

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      this.buildReport(doc, data);

      doc.end();
    });
  }

  /**
   * Generate report as a readable stream
   */
  generateReportStream(data: ForensicReportData): PDFKit.PDFDocument {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50,
    });

    this.buildReport(doc, data);
    doc.end();

    return doc;
  }

  /**
   * Build the report content
   */
  private buildReport(doc: PDFKit.PDFDocument, data: ForensicReportData): void {
    // Header
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("FORENSIC WATERMARK ANALYSIS REPORT", { align: "center" })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Report Generated: ${new Date().toISOString()}`, { align: "center" })
      .text(`Work ID: ${data.artwork.workId}`, { align: "center" })
      .moveDown(2);

    // Section 1: Artwork Identification
    this.addSection(doc, "1. ARTWORK IDENTIFICATION");

    doc.fontSize(10).font("Helvetica");
    this.addField(doc, "Work ID", data.artwork.workId);
    this.addField(doc, "Author (Legal Name)", data.artwork.author);
    this.addField(doc, "Known As", data.artwork.displayName);
    this.addField(doc, "Media Type", data.artwork.mediaType);
    this.addField(doc, "Original File", data.artwork.originalFileName);
    this.addField(doc, "Aspect Ratio", data.artwork.aspectRatio);
    this.addField(doc, "Creation Date (UTC)", data.artwork.createdUtc);
    doc.moveDown();

    // Section 2: Cryptographic Evidence
    this.addSection(doc, "2. CRYPTOGRAPHIC EVIDENCE");

    doc.fontSize(10).font("Helvetica").text("Original File Hash (SHA-256):");
    doc.fontSize(8).font("Courier").text(data.artwork.originalHash).moveDown(0.5);

    doc.fontSize(10).font("Helvetica").text("Payload Hash (SHA-256):");
    doc.fontSize(8).font("Courier").text(data.artwork.payloadHash).moveDown();

    // Section 3: Quality Metrics
    this.addSection(doc, "3. QUALITY VERIFICATION");

    const psnrStatus = data.qualityMetrics.psnr >= 40 ? "PASS" : "WARN";
    const ssimStatus = data.qualityMetrics.ssim >= 0.95 ? "PASS" : "WARN";

    this.addField(
      doc,
      "PSNR (Peak Signal-to-Noise Ratio)",
      `${data.qualityMetrics.psnr.toFixed(2)} dB [${psnrStatus}]`
    );
    this.addField(
      doc,
      "SSIM (Structural Similarity Index)",
      `${data.qualityMetrics.ssim.toFixed(4)} [${ssimStatus}]`
    );
    this.addField(
      doc,
      "Quality Standard",
      "PSNR >= 40 dB, SSIM >= 0.95 (imperceptible difference)"
    );
    doc.moveDown();

    // Section 4: Blockchain Notarization
    this.addSection(doc, "4. BLOCKCHAIN NOTARIZATION");

    this.addField(doc, "Network", data.blockchain.network);
    this.addField(doc, "Transaction Hash", data.blockchain.txHash);
    this.addField(doc, "Block Number", data.blockchain.blockNumber.toString());
    this.addField(
      doc,
      "Block Timestamp",
      new Date(data.blockchain.timestamp * 1000).toISOString()
    );
    this.addField(
      doc,
      "Verification URL",
      `https://polygonscan.com/tx/${data.blockchain.txHash}`
    );
    doc.moveDown();

    // Section 5: Detection Results (if present)
    if (data.detection) {
      this.addSection(doc, "5. WATERMARK DETECTION ANALYSIS");

      this.addField(doc, "Detection Date", data.detection.detectedAt);
      this.addField(
        doc,
        "Confidence Score",
        `${(data.detection.confidence * 100).toFixed(2)}%`
      );
      this.addField(doc, "Confidence Level", data.detection.confidenceLevel);

      if (data.detection.framesAnalyzed) {
        this.addField(
          doc,
          "Frames Analyzed",
          data.detection.framesAnalyzed.toString()
        );
      }

      if (data.detection.eccRecoveryRate) {
        this.addField(doc, "ECC Recovery", data.detection.eccRecoveryRate);
      }

      if (data.detection.errorsFound !== undefined) {
        this.addField(
          doc,
          "Bit Errors Found",
          data.detection.errorsFound.toString()
        );
        this.addField(
          doc,
          "Bit Errors Corrected",
          (data.detection.errorsCorrected ?? 0).toString()
        );
      }
      doc.moveDown();
    }

    // Section 6: Server Signature
    const sectionNum = data.detection ? 6 : 5;
    this.addSection(doc, `${sectionNum}. SERVER-SIDE EVIDENCE SIGNATURE`);

    this.addField(doc, "Algorithm", data.evidence.algorithm);

    doc.fontSize(10).font("Helvetica").text("Signature:");
    doc
      .fontSize(7)
      .font("Courier")
      .text(data.evidence.signature, { width: 500 })
      .moveDown(0.5);

    doc.fontSize(10).font("Helvetica").text("Public Key:");
    doc
      .fontSize(7)
      .font("Courier")
      .text(data.evidence.publicKey, { width: 500 })
      .moveDown();

    // Section 7: Conclusion
    this.addSection(doc, `${sectionNum + 1}. FORENSIC CONCLUSION`);

    const conclusionText =
      `This report provides forensic evidence that the analyzed ${data.artwork.mediaType.toLowerCase()} ` +
      `contains an embedded watermark matching Work ID ${data.artwork.workId}, ` +
      `created by ${data.artwork.author}${data.artwork.displayName !== data.artwork.author ? ` (known as ${data.artwork.displayName})` : ""}. ` +
      `\n\nThe watermark embedding meets quality standards with PSNR of ${data.qualityMetrics.psnr.toFixed(2)} dB ` +
      `and SSIM of ${data.qualityMetrics.ssim.toFixed(4)}, indicating perceptually indistinguishable modification. ` +
      `\n\nThe existence of this watermark at the creation timestamp has been independently verified ` +
      `via blockchain notarization on the ${data.blockchain.network} network ` +
      `(Transaction: ${data.blockchain.txHash}, Block: ${data.blockchain.blockNumber}).`;

    doc.fontSize(10).font("Helvetica").text(conclusionText, { align: "justify" });
    doc.moveDown();

    // Footer
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("gray")
      .text(
        "This report was generated by an automated forensic watermark analysis system. " +
          "All cryptographic evidence can be independently verified using the provided hashes, " +
          "signatures, and blockchain transaction data. This document is intended for use in " +
          "copyright disputes, DMCA takedown notices, and legal proceedings.",
        { align: "justify" }
      );
  }

  /**
   * Add a section header
   */
  private addSection(doc: PDFKit.PDFDocument, title: string): void {
    doc.fontSize(14).font("Helvetica-Bold").fillColor("black").text(title).moveDown(0.5);
  }

  /**
   * Add a field with label and value
   */
  private addField(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string
  ): void {
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("black")
      .text(`${label}: `, { continued: true })
      .font("Helvetica")
      .text(value);
  }
}

/**
 * Create a forensic report generator
 */
export function createForensicReportGenerator(): ForensicReportGenerator {
  return new ForensicReportGenerator();
}

/**
 * Generate a quick forensic report
 */
export async function generateForensicReport(
  data: ForensicReportData
): Promise<Buffer> {
  const generator = new ForensicReportGenerator();
  return generator.generateReport(data);
}
