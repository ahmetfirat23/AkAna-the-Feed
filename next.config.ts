import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // jsdom and its dependencies use ESM-only transitive deps that cannot be
  // bundled by Turbopack. Mark them as external so Node.js loads them natively.
  serverExternalPackages: [
    'jsdom',
    '@mozilla/readability',
    'isomorphic-dompurify',
    'html-encoding-sniffer',
    '@exodus/bytes',
  ],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
