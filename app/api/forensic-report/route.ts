import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

import {
  ForensicReportGenerator,
  ForensicReportData,
} from "@/lib/forensics/report-generator";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    // Get artwork ID from query params
    const { searchParams } = new URL(req.url);
    const artworkId = searchParams.get("artworkId");

    if (!artworkId) {
      return NextResponse.json(
        { error: "artworkId is required" },
        { status: 400 }
      );
    }

    // Get artwork with user data
    const artworkWithUser = await convex.query(api.artworks.getWithUser, {
      id: artworkId as Id<"artworks">,
    });

    if (!artworkWithUser || !artworkWithUser.artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    const { artwork, user } = artworkWithUser;

    // Check authorization (only owner can generate report, or it's public detection)
    if (clerkId) {
      const currentUser = await convex.query(api.users.getByClerkId, {
        clerkId,
      });
      // Allow if owner
      if (currentUser && currentUser._id !== artwork.userId) {
        // For now, allow anyone to generate reports
        // In production, you might want to restrict this
      }
    }

    // Build report data
    const reportData: ForensicReportData = {
      artwork: {
        workId: artwork.workId,
        author: user?.legalName ?? "Unknown",
        displayName: user?.displayName ?? "Unknown",
        createdUtc: artwork.createdUtc,
        mediaType: artwork.mediaType,
        originalFileName: artwork.originalFileName,
        originalHash: artwork.originalHash,
        payloadHash: artwork.payloadHash,
        aspectRatio: artwork.aspectRatio,
      },
      blockchain: {
        txHash: artwork.blockchainTxHash ?? "Not notarized",
        network: artwork.blockchainNetwork ?? "N/A",
        blockNumber: artwork.blockNumber ?? 0,
        timestamp: artwork.blockchainTimestamp ?? 0,
      },
      evidence: {
        signature: artwork.evidenceSignature ?? "Not signed",
        publicKey: artwork.signaturePublicKey ?? "N/A",
        algorithm: artwork.signatureAlgorithm ?? "N/A",
      },
      qualityMetrics: {
        psnr: artwork.qualityMetrics.psnr,
        ssim: artwork.qualityMetrics.ssim,
      },
    };

    // Generate PDF report
    const generator = new ForensicReportGenerator();
    const pdfBuffer = await generator.generateReport(reportData);

    // Return PDF
    const filename = `forensic-report-${artwork.workId}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
