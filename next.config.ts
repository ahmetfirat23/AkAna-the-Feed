import type { NextConfig } from "next";

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  // Tailwind v4 inlines critical CSS at build time; runtime style injection
  // only occurs in dev. 'unsafe-inline' is required for that dev experience.
  "style-src 'self' 'unsafe-inline'",
  // Allow images from any https origin (RSS article thumbnails, favicons, etc.)
  "img-src 'self' data: https:",
  // Fonts loaded via next/font are self-hosted; no external font CDN needed.
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  // No iframes needed.
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: ContentSecurityPolicy,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
