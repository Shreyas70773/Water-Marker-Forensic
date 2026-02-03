"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
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
  Upload,
  Search,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";

export default function DashboardPage() {
  const { user: clerkUser } = useUser();
  const user = useQuery(api.users.getCurrent);
  const stats = useQuery(
    api.artworks.getStats,
    user ? { userId: user._id } : "skip"
  );
  const artworks = useQuery(
    api.artworks.listByUser,
    user ? { userId: user._id, limit: 6 } : "skip"
  );

  if (!clerkUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please sign in to access your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Welcome back, {user?.displayName || clerkUser.firstName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your watermarked artworks and forensic evidence
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Link href="/upload">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <Upload className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg">Upload New</CardTitle>
                <CardDescription>
                  Watermark an image or video
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/detect">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <Search className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg">Detect Watermark</CardTitle>
                <CardDescription>
                  Check if an image contains your watermark
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/evidence">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <FileText className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg">Evidence Vault</CardTitle>
                <CardDescription>
                  Access your forensic evidence
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Statistics */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Artworks</CardDescription>
              <CardTitle className="text-3xl">{stats?.total ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Images</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                {stats?.images ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Videos</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Video className="h-6 w-6 text-muted-foreground" />
                {stats?.videos ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Processing</CardDescription>
              <CardTitle className="text-3xl">{stats?.pending ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Recent Artworks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Artworks</CardTitle>
              <CardDescription>
                Your recently watermarked files
              </CardDescription>
            </div>
            <Link href="/evidence">
              <Button variant="outline" size="sm">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {artworks && artworks.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {artworks.map((artwork) => (
                  <Link
                    key={artwork._id}
                    href={`/evidence/${artwork._id}`}
                    className="block"
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {artwork.mediaType === "IMAGE" ? (
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <Video className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <p className="font-medium text-sm truncate max-w-[150px]">
                                {artwork.originalFileName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {artwork.workId}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              artwork.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : artwork.status === "failed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {artwork.status}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          <p>PSNR: {artwork.qualityMetrics.psnr.toFixed(1)} dB</p>
                          <p>SSIM: {artwork.qualityMetrics.ssim.toFixed(3)}</p>
                        </div>
                        {artwork.blockchainTxHash && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                            <ExternalLink className="h-3 w-3" />
                            <span>Blockchain verified</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No artworks yet.</p>
                <Link href="/upload">
                  <Button className="mt-4">Upload Your First Artwork</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
