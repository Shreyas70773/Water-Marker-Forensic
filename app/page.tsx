import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Shield, Lock, FileCheck, Fingerprint } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">WaterMarker</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/auth/sign-in">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button>Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Forensic-Grade Invisible Watermarking
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Protect your creative work with court-defensible, imperceptible
          watermarks. Blockchain-notarized proof of authorship that survives
          social media compression.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/auth/sign-up">
            <Button size="lg" className="gap-2">
              <Shield className="h-5 w-5" />
              Start Protecting Your Work
            </Button>
          </Link>
          <Link href="/detect">
            <Button size="lg" variant="outline">
              Detect Watermark
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Why WaterMarker?
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Invisible Protection</CardTitle>
              <CardDescription>
                PSNR ≥ 40 dB, SSIM ≥ 0.95 - no perceptible quality loss
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Our DCT-based watermarking with coefficient hopping ensures your
                watermark is completely invisible while remaining detectable.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Lock className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Blockchain Notarized</CardTitle>
              <CardDescription>
                Immutable timestamp proof on Polygon
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Every watermark is cryptographically signed and notarized on the
                blockchain, providing undeniable proof of when you created your
                work.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <FileCheck className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Survives Compression</CardTitle>
              <CardDescription>
                Reed-Solomon error correction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Temporal spreading and ECC ensure your watermark survives
                Instagram, TikTok, and YouTube compression intact.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Fingerprint className="h-10 w-10 text-primary mb-2" />
              <CardTitle>Court-Defensible</CardTitle>
              <CardDescription>
                Forensic PDF reports included
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Generate detailed forensic reports with complete evidence chain
                for copyright disputes and DMCA takedowns.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="font-semibold mb-2">Upload Your Work</h3>
              <p className="text-sm text-muted-foreground">
                Upload your image or video. We support all major formats up to
                10MB for images and 500MB for videos.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="font-semibold mb-2">Automatic Processing</h3>
              <p className="text-sm text-muted-foreground">
                Our engine embeds an invisible watermark, hashes your file, and
                notarizes it on the blockchain.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="font-semibold mb-2">Download & Share</h3>
              <p className="text-sm text-muted-foreground">
                Download your protected file. If someone steals it, detect the
                watermark and generate a forensic report.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            WaterMarker - Forensic-grade invisible watermarking with blockchain
            notarization
          </p>
          <p className="mt-2">Built for creators who value their work.</p>
        </div>
      </footer>
    </div>
  );
}
