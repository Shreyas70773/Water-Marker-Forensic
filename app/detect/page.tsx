"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
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
  Search,
  Image as ImageIcon,
  Video as VideoIcon,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  FileText,
  Shield,
} from "lucide-react";

interface DetectionResult {
  found: boolean;
  verified?: boolean;
  confidence?: number;
  message?: string;
  matchType?: string;
  threshold?: number;
  forensicData?: {
    similarity: number;
    confidenceLevel: string;
    hashDetails?: {
      pHashSimilarity: number;
      aHashSimilarity: number;
      dHashSimilarity: number;
    };
  };
  artwork?: {
    workId: string;
    author: string;
    displayName: string;
    createdUtc: string;
    mediaType: string;
    blockchainTxHash?: string;
    primarySource?: string;
  };
  evidenceBundle?: {
    originalHash: string;
    payloadHash: string;
    evidenceSignature?: string;
    blockchainVerificationUrl?: string;
  };
}

export default function DetectPage() {
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [status, setStatus] = useState<"idle" | "analyzing" | "completed" | "error">("idle");
  const [result, setResult] = useState<DetectionResult | null>(null);
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

  const imageTypes = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
  };
  
  const videoTypes = {
    "video/mp4": [".mp4"],
    "video/webm": [".webm"],
    "video/quicktime": [".mov"],
  };

  const acceptedFileTypes = mediaType === "IMAGE" ? imageTypes : videoTypes;

  const maxFileSize = mediaType === "IMAGE"
    ? 10 * 1024 * 1024   // 10MB for images
    : 500 * 1024 * 1024; // 500MB for videos

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: maxFileSize,
    multiple: false,
  });

  const handleMediaTypeChange = (value: string) => {
    setMediaType(value as "IMAGE" | "VIDEO");
    setSelectedFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setResult(null);
  };

  const handleDetect = async () => {
    if (!selectedFile) return;

    setStatus("analyzing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      // Use appropriate API endpoint based on media type
      const apiEndpoint = mediaType === "VIDEO" ? "/api/detect-video" : "/api/detect";
      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Detection failed");
      }

      setResult(data);
      setStatus("completed");
    } catch (error) {
      console.error("Detection error:", error);
      setStatus("error");
      setResult({
        found: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const resetDetection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setResult(null);
  };

  const getConfidenceColor = (level?: string) => {
    switch (level) {
      case "EXCELLENT":
        return "text-green-600 bg-green-100";
      case "GOOD":
        return "text-blue-600 bg-blue-100";
      case "FAIR":
        return "text-yellow-600 bg-yellow-100";
      case "MARGINAL":
        return "text-orange-600 bg-orange-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Detect Watermark</h1>
          <p className="text-muted-foreground mt-1">
            Check if an image or video contains a registered watermark
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Media for Analysis</CardTitle>
            <CardDescription>
              We'll scan for embedded watermarks and verify ownership
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
                <p className="text-sm text-muted-foreground">
                  Supported formats: JPEG, PNG, WebP (max 10MB)
                </p>
              </TabsContent>
              
              <TabsContent value="VIDEO" className="mt-4">
                <p className="text-sm text-muted-foreground">
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
                      Drag & drop {mediaType === "IMAGE" ? "an image" : "a video"} to analyze
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
                    <Button variant="ghost" size="sm" onClick={resetDetection}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Analyzing */}
            {status === "analyzing" && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">
                  {mediaType === "VIDEO" 
                    ? "Extracting frames and analyzing..." 
                    : "Analyzing image..."}
                </span>
              </div>
            )}

            {/* Results */}
            {status === "completed" && result && (
              <div className="space-y-4">
                {result.found && result.verified ? (
                  <>
                    <Alert className="bg-green-50 border-green-200">
                      <Shield className="h-5 w-5 text-green-600" />
                      <AlertTitle className="text-green-800">
                        Watermark Detected!
                      </AlertTitle>
                      <AlertDescription className="text-green-700">
                        This image contains a verified watermark.
                      </AlertDescription>
                    </Alert>

                    {/* Similarity */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Match Confidence:
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-sm font-medium ${getConfidenceColor(result.forensicData?.confidenceLevel)}`}
                      >
                        {result.forensicData?.confidenceLevel} (
                        {((result.forensicData?.similarity ?? 0) * 100).toFixed(1)}
                        % similar)
                      </span>
                    </div>

                    {/* Owner Info */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          Registered Owner
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Author:</span>
                          <span className="font-medium">
                            {result.artwork?.author}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Known As:
                          </span>
                          <span>{result.artwork?.displayName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Work ID:</span>
                          <span className="font-mono text-xs">
                            {result.artwork?.workId}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created:</span>
                          <span>
                            {result.artwork?.createdUtc
                              ? new Date(
                                  result.artwork.createdUtc
                                ).toLocaleDateString()
                              : "Unknown"}
                          </span>
                        </div>
                        {result.artwork?.primarySource && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Source:</span>
                            <a
                              href={result.artwork.primarySource}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              Portfolio
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Evidence */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          Forensic Evidence
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Original Hash:
                          </span>
                          <p className="font-mono text-xs break-all">
                            {result.evidenceBundle?.originalHash}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Payload Hash:
                          </span>
                          <p className="font-mono text-xs break-all">
                            {result.evidenceBundle?.payloadHash}
                          </p>
                        </div>
                        {result.evidenceBundle?.blockchainVerificationUrl && (
                          <div className="pt-2">
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={
                                  result.evidenceBundle.blockchainVerificationUrl
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Verify on Blockchain
                              </a>
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Alert>
                    <XCircle className="h-5 w-5" />
                    <AlertTitle>No Watermark Detected</AlertTitle>
                    <AlertDescription>
                      {result.message ||
                        `This ${mediaType === "VIDEO" ? "video" : "image"} does not contain a registered watermark, or the watermark was too degraded to detect.`}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <XCircle className="h-5 w-5" />
                <AlertTitle>Detection Failed</AlertTitle>
                <AlertDescription>
                  {result?.message || "An error occurred during analysis"}
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {status === "idle" && selectedFile && (
                <Button onClick={handleDetect} className="flex-1">
                  <Search className="h-4 w-4 mr-2" />
                  Detect Watermark
                </Button>
              )}
              {(status === "completed" || status === "error") && (
                <Button
                  onClick={resetDetection}
                  variant="outline"
                  className="flex-1"
                >
                  Analyze Another {mediaType === "VIDEO" ? "Video" : "Image"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
