# WaterMarker - Forensic-Grade Invisible Watermarking

A broadcast-grade, court-defensible Next.js web application that embeds imperceptible, forensically-robust watermarks into images and videos, providing cryptographic proof of authorship with blockchain notarization.

## Features

- **Invisible Watermarking**: DCT-based frequency-domain embedding with coefficient hopping
- **Error Correction**: Reed-Solomon ECC for resilience against compression
- **Blockchain Notarization**: Polygon network for immutable timestamp proof
- **Server-Side Signing**: secp256k1 signatures for evidence authenticity
- **Forensic Reports**: PDF generation for legal proceedings
- **Video Support**: Temporal spreading across frames with scene-adaptive embedding

## Quality Metrics

- PSNR ≥ 40 dB (imperceptible quality difference)
- SSIM ≥ 0.95 (structural similarity preserved)
- Survives Instagram, TikTok, and YouTube compression

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Convex (real-time database, file storage, long-running actions)
- **Auth**: Clerk
- **Blockchain**: Polygon (Mumbai testnet / Mainnet)
- **Processing**: Sharp (images), custom DCT implementation

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Convex account
- Clerk account
- Ethereum wallet for blockchain notarization

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/shreyas70773/water-marker.git
   cd water-marker
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Copy the environment template:
   \`\`\`bash
   cp .env.local.example .env.local
   \`\`\`

4. Configure your environment variables in \`.env.local\`

5. Initialize Convex:
   \`\`\`bash
   npx convex dev
   \`\`\`

6. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

7. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

\`\`\`
/water-marker
├── app/                    # Next.js 14 App Router pages
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── upload/             # Upload components
│   ├── detection/          # Detection components
│   └── evidence/           # Evidence vault components
├── lib/                    # Core libraries
│   ├── watermark/          # Watermarking algorithms
│   ├── crypto/             # Cryptographic utilities
│   └── utils/              # Helper functions
├── convex/                 # Convex backend
└── public/                 # Static assets
\`\`\`

## Watermarking Algorithm

### Image Watermarking

1. Convert image to YCbCr color space
2. Extract luminance channel
3. Divide into 8x8 blocks
4. Apply 2D DCT to each block
5. Embed payload bits using Quantization Index Modulation (QIM)
6. Use coefficient hopping (seeded by workId + payloadHash)
7. Apply Reed-Solomon error correction
8. Inverse DCT and reconstruct image

### Video Watermarking

1. Extract frames using FFmpeg
2. Analyze scene texture (skip flat regions)
3. Split payload into temporal shards
4. Embed each shard across multiple frames
5. Reconstruct video preserving codec settings

## API Reference

### POST /api/watermark
Upload and watermark a file.

### POST /api/detect
Detect watermark in uploaded file.

### GET /api/evidence/[id]
Retrieve evidence bundle for artwork.

### GET /api/forensic-report/[id]
Generate forensic PDF report.

## Security

- All private keys stored server-side only
- Rate limiting on detection endpoint
- File validation via magic bytes
- CSRF protection enabled

## License

MIT License - see LICENSE file for details.

## Disclaimer

This system provides forensic evidence to support copyright claims. Legal outcomes depend on jurisdiction and specific circumstances. Consult legal counsel for disputes.
