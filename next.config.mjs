/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` produces a self-contained server bundle that the Electron
  // desktop wrapper launches. It is also the smallest deployable output.
  output: 'standalone',
  outputFileTracingIncludes: {
    '/**': ['./vendor/**'],
  },
  serverExternalPackages: ['sql.js', 'pdfjs-dist', 'mammoth'],
  experimental: {
    serverActions: {
      // Course materials can be large scans; allow generous uploads.
      bodySizeLimit: '32mb',
    },
  },
};

export default nextConfig;
