/** @type {import('next').NextConfig} */
const nextConfig = {
  // External packages for server-side processing
  serverExternalPackages: [
    'sharp',
    'pdfkit',
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe',
    'fluent-ffmpeg',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.convex.cloud',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle ffmpeg packages on server - use native require
      config.externals = config.externals || [];
      config.externals.push({
        '@ffmpeg-installer/ffmpeg': 'commonjs @ffmpeg-installer/ffmpeg',
        '@ffprobe-installer/ffprobe': 'commonjs @ffprobe-installer/ffprobe',
        'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
      });
    }
    return config;
  },
  // Output configuration for Netlify
  output: 'standalone',
};

module.exports = nextConfig;
