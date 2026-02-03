import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Step 1: Parse form data
    console.log("[TEST] Step 1: Parsing form data...");
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    
    console.log(`[TEST] File received: ${file.name}, type: ${file.type}, size: ${file.size}`);
    
    // Step 2: Read file buffer
    console.log("[TEST] Step 2: Reading file buffer...");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[TEST] Buffer size: ${buffer.length}`);
    
    // Step 3: Test sharp
    console.log("[TEST] Step 3: Testing sharp...");
    let sharpResult = null;
    try {
      const sharp = require("sharp");
      const metadata = await sharp(buffer).metadata();
      sharpResult = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
      console.log(`[TEST] Sharp metadata:`, sharpResult);
    } catch (sharpError) {
      console.error("[TEST] Sharp error:", sharpError);
      return NextResponse.json({
        step: "sharp",
        error: sharpError instanceof Error ? sharpError.message : "Sharp failed",
      }, { status: 500 });
    }
    
    // Step 4: Test Convex connection
    console.log("[TEST] Step 4: Testing Convex...");
    let convexResult = null;
    try {
      const { ConvexHttpClient } = require("convex/browser");
      const { api } = require("@/convex/_generated/api");
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      
      if (!convexUrl) {
        return NextResponse.json({
          step: "convex",
          error: "NEXT_PUBLIC_CONVEX_URL not set",
        }, { status: 500 });
      }
      
      const client = new ConvexHttpClient(convexUrl);
      const artworks = await client.query(api.artworks.getRecent, { limit: 1 });
      convexResult = { artworksFound: artworks.length };
      console.log(`[TEST] Convex result:`, convexResult);
    } catch (convexError) {
      console.error("[TEST] Convex error:", convexError);
      return NextResponse.json({
        step: "convex",
        error: convexError instanceof Error ? convexError.message : "Convex failed",
      }, { status: 500 });
    }
    
    // Step 5: Test perceptual hash
    console.log("[TEST] Step 5: Testing perceptual hash...");
    let hashResult = null;
    try {
      const { computeCombinedHash } = require("@/lib/watermark/perceptual-hash");
      const hashes = await computeCombinedHash(buffer);
      hashResult = {
        pHash: hashes.pHash?.substring(0, 16) + "...",
        dHash: hashes.dHash?.substring(0, 16) + "...",
      };
      console.log(`[TEST] Hash result:`, hashResult);
    } catch (hashError) {
      console.error("[TEST] Hash error:", hashError);
      return NextResponse.json({
        step: "perceptual-hash",
        error: hashError instanceof Error ? hashError.message : "Hash failed",
      }, { status: 500 });
    }
    
    // All steps passed!
    return NextResponse.json({
      success: true,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
      },
      sharp: sharpResult,
      convex: convexResult,
      hash: hashResult,
    });
    
  } catch (error) {
    console.error("[TEST] Unexpected error:", error);
    return NextResponse.json({
      step: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
