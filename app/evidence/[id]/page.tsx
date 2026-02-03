"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Shield,
  Hash,
  Clock,
  CheckCircle,
  Trash2,
  HardDrive,
  AlertTriangle,
  FileJson,
} from "lucide-react";

export default function EvidenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const artworkId = params.id as string;
  const { user: clerkUser } = useUser();
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<"files" | "all">("files");

  const artworkWithUser = useQuery(api.artworks.getWithUser, {
    id: artworkId as Id<"artworks">,
  });

  // Use the download API route instead of raw Convex URL for proper file download
  const downloadUrl = artworkWithUser?.artwork?.watermarkedFileId
    ? `/api/download/${artworkWithUser.artwork.watermarkedFileId}`
    : null;

  const detectionLogs = useQuery(
    api.detectionLogs.listByArtwork,
    artworkWithUser?.artwork
      ? { artworkId: artworkWithUser.artwork._id, limit: 10 }
      : "skip"
  );

  // Storage cleanup mutations
  const cleanupStorage = useMutation(api.artworks.cleanupStorageOnly);
  const deleteArtwork = useMutation(api.artworks.deleteWithCleanup);

  const handleCleanupFiles = async () => {
    if (!artworkWithUser?.artwork) return;
    setIsDeleting(true);
    try {
      await cleanupStorage({
        id: artworkWithUser.artwork._id,
        keepOriginal: false,
      });
      setShowDeleteConfirm(false);
      alert("Files cleaned up! Evidence record preserved.");
    } catch (error) {
      alert("Failed to cleanup files: " + (error as Error).message);
    }
    setIsDeleting(false);
  };

  const handleDeleteAll = async () => {
    if (!artworkWithUser?.artwork) return;
    setIsDeleting(true);
    try {
      await deleteArtwork({
        id: artworkWithUser.artwork._id,
        deleteOriginal: true,
        deleteWatermarked: true,
      });
      router.push("/evidence");
    } catch (error) {
      alert("Failed to delete: " + (error as Error).message);
      setIsDeleting(false);
    }
  };

  const confirmDelete = (type: "files" | "all") => {
    setDeleteType(type);
    setShowDeleteConfirm(true);
  };

  if (!clerkUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please sign in to view evidence details.</p>
      </div>
    );
  }

  if (!artworkWithUser) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  const { artwork, user } = artworkWithUser;

  if (!artwork) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p>Artwork not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/evidence"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Evidence Vault
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{artwork.originalFileName}</h1>
              <p className="font-mono text-sm text-muted-foreground">
                {artwork.workId}
              </p>
            </div>
            <div className="flex gap-2">
              {downloadUrl && (
                <Button asChild>
                  <a href={downloadUrl} download>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <a
                  href={`/api/forensic-report?artworkId=${artwork._id}`}
                  download
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Forensic Report
                </a>
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="technical">Technical</TabsTrigger>
            <TabsTrigger value="detections">Detection Log</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
          </TabsList>

          {/* Evidence Tab */}
          <TabsContent value="evidence" className="space-y-4">
            {/* Owner Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Registered Owner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Legal Name</p>
                    <p className="font-medium">{user?.legalName || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Display Name</p>
                    <p>{user?.displayName || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Copyright</p>
                    <p>
                      © {user?.legalName} {user?.copyrightYear}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p>{new Date(artwork.createdUtc).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cryptographic Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  Cryptographic Evidence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Original File Hash (SHA-256)
                  </p>
                  <p className="font-mono text-xs break-all bg-gray-100 p-2 rounded">
                    {artwork.originalHash}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Payload Hash (SHA-256)
                  </p>
                  <p className="font-mono text-xs break-all bg-gray-100 p-2 rounded">
                    {artwork.payloadHash}
                  </p>
                </div>
                {artwork.evidenceSignature && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Evidence Signature ({artwork.signatureAlgorithm})
                    </p>
                    <p className="font-mono text-xs break-all bg-gray-100 p-2 rounded">
                      {artwork.evidenceSignature}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Blockchain Notarization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" />
                  Blockchain Notarization
                </CardTitle>
              </CardHeader>
              <CardContent>
                {artwork.blockchainTxHash ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Verified on Blockchain</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Network</p>
                        <p>{artwork.blockchainNetwork}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Block Number</p>
                        <p>{artwork.blockNumber}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Timestamp</p>
                        <p>
                          {artwork.blockchainTimestamp
                            ? new Date(
                                artwork.blockchainTimestamp * 1000
                              ).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Transaction Hash
                      </p>
                      <p className="font-mono text-xs break-all">
                        {artwork.blockchainTxHash}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://mumbai.polygonscan.com/tx/${artwork.blockchainTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on Polygonscan
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    This artwork has not been notarized on the blockchain.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technical Tab */}
          <TabsContent value="technical" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Media Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p>{artwork.mediaType}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dimensions</p>
                    <p>
                      {artwork.metadata.width} x {artwork.metadata.height}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Aspect Ratio</p>
                    <p>{artwork.aspectRatio}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Format</p>
                    <p>{artwork.metadata.format}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Original Size</p>
                    <p>
                      {(artwork.originalFileSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Embedding Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Strength</p>
                    <p>{artwork.embeddingParams.strength}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ECC Bytes</p>
                    <p>{artwork.embeddingParams.eccBytes}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Block Size</p>
                    <p>{artwork.embeddingParams.blockSize || 8}x{artwork.embeddingParams.blockSize || 8}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics</CardTitle>
                <CardDescription>
                  Targets: PSNR ≥ 40 dB, SSIM ≥ 0.95
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">PSNR</p>
                    <p
                      className={`text-2xl font-bold ${
                        artwork.qualityMetrics.psnr >= 40
                          ? "text-green-600"
                          : "text-yellow-600"
                      }`}
                    >
                      {artwork.qualityMetrics.psnr.toFixed(2)} dB
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {artwork.qualityMetrics.psnr >= 40 ? "PASS" : "BELOW TARGET"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">SSIM</p>
                    <p
                      className={`text-2xl font-bold ${
                        artwork.qualityMetrics.ssim >= 0.95
                          ? "text-green-600"
                          : "text-yellow-600"
                      }`}
                    >
                      {artwork.qualityMetrics.ssim.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {artwork.qualityMetrics.ssim >= 0.95
                        ? "PASS"
                        : "BELOW TARGET"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detection Log Tab */}
          <TabsContent value="detections" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Detection History
                </CardTitle>
                <CardDescription>
                  Forensic audit trail of watermark detection attempts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detectionLogs && detectionLogs.length > 0 ? (
                  <div className="space-y-4">
                    {detectionLogs.map((log) => (
                      <div
                        key={log._id}
                        className="border rounded-lg p-4 text-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {new Date(log.detectedAt).toLocaleString()}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              log.detected
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {log.detected
                              ? `${log.confidenceLevel} (${((log.confidence ?? 0) * 100).toFixed(0)}%)`
                              : "Not detected"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          {log.analyzedFileName && (
                            <p>File: {log.analyzedFileName}</p>
                          )}
                          {log.eccRecoveryRate && (
                            <p>ECC: {log.eccRecoveryRate}</p>
                          )}
                          <p>IP: {log.sourceIp}</p>
                          <p>ID: {log.requestId.slice(0, 8)}...</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No detection attempts recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Storage Management Tab */}
          <TabsContent value="storage" className="space-y-4">
            {/* Delete Confirmation */}
            {showDeleteConfirm && (
              <Alert variant="destructive">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle>
                  {deleteType === "files" 
                    ? "Clean Up Storage Files?" 
                    : "Delete Everything?"}
                </AlertTitle>
                <AlertDescription className="space-y-4">
                  <p>
                    {deleteType === "files"
                      ? "This will delete the original and watermarked files to save storage space. Your evidence record (hashes, signatures, blockchain proof) will be preserved."
                      : "This will permanently delete this artwork and all associated files. This cannot be undone."}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={deleteType === "files" ? handleCleanupFiles : handleDeleteAll}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Processing..." : "Confirm Delete"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Export Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  Export Evidence
                </CardTitle>
                <CardDescription>
                  Download your complete evidence package before cleaning up files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The evidence export contains all cryptographic proofs, hashes, 
                  signatures, and blockchain records. Save this file - it's your 
                  legal proof of ownership even after files are deleted.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button asChild>
                    <a href={`/api/evidence-export?artworkId=${artwork._id}`} download>
                      <FileJson className="h-4 w-4 mr-2" />
                      Download Evidence JSON
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={`/api/forensic-report?artworkId=${artwork._id}`} download>
                      <FileText className="h-4 w-4 mr-2" />
                      Download PDF Report
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Storage Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Storage Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Original File</p>
                    <p className="font-medium">
                      {artwork.originalFileId 
                        ? `${(artwork.originalFileSize / 1024 / 1024).toFixed(2)} MB`
                        : "Deleted"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Watermarked File</p>
                    <p className="font-medium">
                      {artwork.watermarkedFileId 
                        ? `~${(artwork.originalFileSize / 1024 / 1024).toFixed(2)} MB`
                        : "Deleted"}
                    </p>
                  </div>
                </div>
                
                {(artwork.originalFileId || artwork.watermarkedFileId) && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Tip:</strong> Download your watermarked file and evidence JSON first, 
                      then clean up files to save storage space.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Clean Up Files Only</p>
                    <p className="text-sm text-muted-foreground">
                      Delete image/video files but keep evidence record
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => confirmDelete("files")}
                    disabled={!artwork.originalFileId && !artwork.watermarkedFileId}
                  >
                    Clean Up
                  </Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
                  <div>
                    <p className="font-medium text-red-700">Delete Everything</p>
                    <p className="text-sm text-red-600">
                      Permanently delete this artwork and all files
                    </p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => confirmDelete("all")}
                  >
                    Delete All
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
