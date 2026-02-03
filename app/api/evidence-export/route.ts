import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: NextRequest) {
  try {
    const authResult = await auth();
    const clerkId = authResult?.userId;

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get artwork ID from query params
    const { searchParams } = new URL(req.url);
    const artworkId = searchParams.get("artworkId");

    if (!artworkId) {
      return NextResponse.json({ error: "Artwork ID required" }, { status: 400 });
    }

    // Get evidence bundle from Convex
    const evidenceBundle = await convex.query(api.artworks.getEvidenceBundle, {
      id: artworkId as Id<"artworks">,
    });

    if (!evidenceBundle) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    // Return as downloadable JSON
    const jsonString = JSON.stringify(evidenceBundle, null, 2);
    
    return new NextResponse(jsonString, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="evidence-${evidenceBundle.workId}.json"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Evidence export error:", error);
    return NextResponse.json(
      { error: "Failed to export evidence" },
      { status: 500 }
    );
  }
}
