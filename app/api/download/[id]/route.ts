import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storageId = params.id;

    if (!storageId) {
      return new NextResponse("Storage ID is required", { status: 400 });
    }

    // Get download URL from Convex
    const url = await convex.query(api.storage.getUrl, {
      storageId: storageId as Id<"_storage">,
    });

    if (!url) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Fetch the file from Convex
    const response = await fetch(url);
    if (!response.ok) {
      return new NextResponse("Failed to fetch file", { status: 500 });
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Determine content type and extension
    const contentType = response.headers.get("content-type") || "image/jpeg";
    let extension = "jpg";
    let filename = "watermarked-image";
    
    if (contentType.includes("png")) {
      extension = "png";
    } else if (contentType.includes("webp")) {
      extension = "webp";
    } else if (contentType.includes("video/mp4") || contentType.includes("mp4")) {
      extension = "mp4";
      filename = "watermarked-video";
    } else if (contentType.includes("video/webm") || contentType.includes("webm")) {
      extension = "webm";
      filename = "watermarked-video";
    } else if (contentType.includes("video/quicktime") || contentType.includes("mov")) {
      extension = "mov";
      filename = "watermarked-video";
    }

    // Return file with download headers
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}.${extension}"`,
        "Content-Length": arrayBuffer.byteLength.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return new NextResponse("Failed to download file", { status: 500 });
  }
}
