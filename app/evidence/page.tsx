"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon,
  Video,
  ExternalLink,
  Download,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

export default function EvidencePage() {
  const { user: clerkUser } = useUser();
  const user = useQuery(api.users.getCurrent);
  const artworks = useQuery(
    api.artworks.listByUser,
    user ? { userId: user._id } : "skip"
  );

  if (!clerkUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please sign in to access your evidence vault.</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "failed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Evidence Vault</h1>
            <p className="text-muted-foreground mt-1">
              All your watermarked artworks with forensic evidence
            </p>
          </div>
          <Link href="/upload">
            <Button>Upload New</Button>
          </Link>
        </div>

        {artworks && artworks.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworks.map((artwork) => (
              <Link
                key={artwork._id}
                href={`/evidence/${artwork._id}`}
                className="block"
              >
                <Card className="hover:shadow-lg transition-shadow h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {artwork.mediaType === "IMAGE" ? (
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Video className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-base truncate max-w-[180px]">
                          {artwork.originalFileName}
                        </CardTitle>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${getStatusColor(artwork.status)}`}
                      >
                        {getStatusIcon(artwork.status)}
                        {artwork.status}
                      </span>
                    </div>
                    <CardDescription className="font-mono text-xs">
                      {artwork.workId}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span>
                          {new Date(artwork.createdUtc).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Aspect:</span>
                        <span>{artwork.aspectRatio}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PSNR:</span>
                        <span
                          className={
                            artwork.qualityMetrics.psnr >= 40
                              ? "text-green-600"
                              : "text-yellow-600"
                          }
                        >
                          {artwork.qualityMetrics.psnr.toFixed(1)} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SSIM:</span>
                        <span
                          className={
                            artwork.qualityMetrics.ssim >= 0.95
                              ? "text-green-600"
                              : "text-yellow-600"
                          }
                        >
                          {artwork.qualityMetrics.ssim.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      {artwork.blockchainTxHash ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Blockchain verified
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not notarized
                        </span>
                      )}
                      <span className="text-xs text-blue-600">
                        View Details →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No artworks yet</h3>
              <p className="text-muted-foreground mb-4">
                Upload your first image to start building your evidence vault.
              </p>
              <Link href="/upload">
                <Button>Upload Artwork</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
