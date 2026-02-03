import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  // Check environment variables (don't expose values, just check if set)
  diagnostics.envVars = {
    NEXT_PUBLIC_CONVEX_URL: !!process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
    EVIDENCE_SIGNING_KEY: !!process.env.EVIDENCE_SIGNING_KEY,
    NOTARY_PRIVATE_KEY: !!process.env.NOTARY_PRIVATE_KEY,
  };

  // Test sharp loading
  try {
    const sharp = require("sharp");
    diagnostics.sharp = {
      loaded: true,
      version: sharp.versions?.sharp || "unknown",
    };
  } catch (e) {
    diagnostics.sharp = {
      loaded: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }

  // Test Convex connection
  try {
    if (process.env.NEXT_PUBLIC_CONVEX_URL) {
      const { ConvexHttpClient } = require("convex/browser");
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
      diagnostics.convex = {
        configured: true,
        url: process.env.NEXT_PUBLIC_CONVEX_URL.substring(0, 30) + "...",
      };
    } else {
      diagnostics.convex = { configured: false };
    }
  } catch (e) {
    diagnostics.convex = {
      configured: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }

  return NextResponse.json(diagnostics);
}
