"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/layout/navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  ExternalLink,
} from "lucide-react";

type ProcessingStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "completed"
  | "error";

interface ProcessingResult {
  success: boolean;
  workId?: string;
  downloadUrl?: string;
  blockchainVerification?: string;
  qualityMetrics?: {
    psnr: number;
    ssim: number;
  };
  error?: string;
}

export default function UploadPage() {
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const user = useQuery(api.users.getCurrent);
  const upsertUser = useMutation(api.users.upsert);
  const [userCreating, setUserCreating] = useState(false);
  const userCreationAttempted = useRef(false);

  // Auto-create user in Convex if they don't exist
  useEffect(() => {
    async function ensureUser() {
      // Only attempt once per session
      if (userCreationAttempted.current) return;
      
      if (isClerkLoaded && clerkUser && user === null && !userCreating) {
        userCreationAttempted.current = true;
        setUserCreating(true);
        try {
          await upsertUser({
            clerkId: clerkUser.id,
            legalName: clerkUser.fullName || clerkUser.firstName || "Anonymous",
            displayName: clerkUser.firstName || clerkUser.username || "User",
            email: clerkUser.primaryEmailAddress?.emailAddress || "",
          });
        } catch (error) {
          console.error("Failed to create user:", error);
          userCreationAttempted.current = false; // Allow retry on error
        }
        setUserCreating(false);
      }
    }
    ensureUser();
  }, [isClerkLoaded, clerkUser, user, userCreating, upsertUser]);

  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStatus("idle");
      setResult(null);
    }
  }, []);

  const acceptedFileTypes = mediaType === "IMAGE" 
    ? {
        "image/jpeg": [".jpg", ".jpeg"],
        "image/png": [".png"],
        "image/webp": [".webp"],
      }
    : {
        "video/mp4": [".mp4"],
        "video/webm": [".webm"],
        "video/quicktime": [".mov"],
      };

  const maxFileSize = mediaType === "IMAGE" 
    ? 10 * 1024 * 1024   // 10MB for images
    : 500 * 1024 * 1024; // 500MB for videos

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: maxFileSize,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    setStatus("uploading");
    setProgress(10);
    setProgressText("Uploading file...");

    try {
      // Create form data
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mediaType", mediaType);

      setProgress(30);
      setProgressText(mediaType === "VIDEO" ? "Processing video frames..." : "Processing watermark...");
      setStatus("processing");

      // Call appropriate API based on media type
      const apiEndpoint = mediaType === "VIDEO" ? "/api/watermark-video" : "/api/watermark";
      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData,
      });

      setProgress(70);
      setProgressText("Signing evidence...");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Processing failed");
      }

      setProgress(90);
      setProgressText("Notarizing on blockchain...");

      setProgress(100);
      setProgressText("Complete!");
      setStatus("completed");

      setResult({
        success: true,
        workId: data.workId,
        downloadUrl: data.downloadUrl,
        blockchainVerification: data.blockchainVerification,
        qualityMetrics: data.qualityMetrics,
      });
    } catch (error) {
      console.error("Upload error:", error);
      setStatus("error");
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setProgress(0);
    setProgressText("");
    setResult(null);
  };

  const handleMediaTypeChange = (value: string) => {
    setMediaType(value as "IMAGE" | "VIDEO");
    // Reset file when switching media types
    setSelectedFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setResult(null);
  };

  if (!isClerkLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!clerkUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please sign in to upload files.</p>
      </div>
    );
  }

  // Show loading while user data is being fetched or created
  if (user === undefined || userCreating || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-2">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">
          {userCreating ? "Creating your profile..." : "Loading your profile..."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Upload Artwork</h1>
          <p className="text-muted-foreground mt-1">
            Add an invisible watermark to protect your creative work
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Media Upload</CardTitle>
            <CardDescription>
              Add invisible watermarks to protect your creative work
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Media Type Tabs */}
            <Tabs value={mediaType} onValueChange={handleMediaTypeChange}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="IMAGE" className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Image
                </TabsTrigger>
                <TabsTrigger value="VIDEO" className="flex items-center gap-2">
                  <VideoIcon className="h-4 w-4" />
                  Video
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="IMAGE" className="mt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Supported formats: JPEG, PNG, WebP (max 10MB)
                </p>
              </TabsContent>
              
              <TabsContent value="VIDEO" className="mt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Supported formats: MP4, WebM, MOV (max 500MB)
                </p>
              </TabsContent>
            </Tabs>

            {/* Dropzone */}
            {!selectedFile && (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-primary"
                }`}
              >
                <input {...getInputProps()} />
                {mediaType === "IMAGE" ? (
                  <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                ) : (
                  <VideoIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                )}
                {isDragActive ? (
                  <p className="text-primary">Drop the file here...</p>
                ) : (
                  <div>
                    <p className="text-muted-foreground">
                      Drag & drop {mediaType === "IMAGE" ? "an image" : "a video"} here, or click to select
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {mediaType === "IMAGE" 
                        ? "JPEG, PNG, WebP up to 10MB"
                        : "MP4, WebM, MOV up to 500MB"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Preview */}
            {selectedFile && previewUrl && (
              <div className="space-y-4">
                <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                  {mediaType === "IMAGE" ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="object-contain w-full h-full"
                    />
                  ) : (
                    <video
                      src={previewUrl}
                      className="object-contain w-full h-full"
                      controls
                      muted
                    />
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {mediaType === "IMAGE" ? (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <VideoIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-muted-foreground">
                      ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  {status === "idle" && (
                    <Button variant="ghost" size="sm" onClick={resetUpload}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Progress */}
            {(status === "uploading" || status === "processing") && (
              <div className="space-y-2">
                <Progress value={progress} />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{progressText}</span>
                </div>
              </div>
            )}

            {/* Result */}
            {status === "completed" && result?.success && (
              <Alert variant="default" className="bg-green-50 border-green-200">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <AlertTitle className="text-green-800">
                  Watermark Applied Successfully!
                </AlertTitle>
                <AlertDescription className="text-green-700">
                  <p className="mb-2">Work ID: {result.workId}</p>
                  <p className="text-sm mb-3">
                    Quality: PSNR {result.qualityMetrics?.psnr.toFixed(1)} dB,
                    SSIM {result.qualityMetrics?.ssim.toFixed(3)}
                  </p>
                  <div className="flex gap-2">
                    {result.downloadUrl && (
                      <Button size="sm" asChild>
                        <a href={result.downloadUrl} download>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    )}
                    {result.blockchainVerification && (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={result.blockchainVerification}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Blockchain Proof
                        </a>
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <XCircle className="h-5 w-5" />
                <AlertTitle>Processing Failed</AlertTitle>
                <AlertDescription>
                  {result?.error || "An unknown error occurred"}
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {status === "idle" && selectedFile && (
                <Button onClick={handleUpload} className="flex-1">
                  <Upload className="h-4 w-4 mr-2" />
                  Apply Watermark
                </Button>
              )}
              {(status === "completed" || status === "error") && (
                <Button onClick={resetUpload} variant="outline" className="flex-1">
                  Upload Another
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            {mediaType === "IMAGE" ? (
              <>
                <p>1. Your image is processed using DCT-based watermarking</p>
                <p>2. An invisible watermark with your identity is embedded</p>
                <p>3. The evidence is cryptographically signed</p>
                <p>4. A blockchain timestamp is created for proof</p>
                <p className="text-xs mt-4">
                  Quality targets: PSNR &gt;= 40 dB, SSIM &gt;= 0.95 (imperceptible difference)
                </p>
              </>
            ) : (
              <>
                <p>1. Your video is split into frames for processing</p>
                <p>2. Watermarks are spread temporally across multiple frames</p>
                <p>3. The video is reconstructed with embedded watermarks</p>
                <p>4. The evidence is cryptographically signed and notarized</p>
                <p className="text-xs mt-4">
                  Video processing uses temporal sharding for robustness against frame dropping
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
