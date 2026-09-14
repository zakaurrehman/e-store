import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

type RemotePattern = {
  protocol?: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
};

// Media served from a CDN / object storage must be explicitly allow-listed for next/image.
const remotePatterns: RemotePattern[] = [];
const mediaOrigins: string[] = [];
if (process.env.MEDIA_PUBLIC_BASE_URL) {
  const url = new URL(process.env.MEDIA_PUBLIC_BASE_URL);
  mediaOrigins.push(url.origin);
  remotePatterns.push({
    protocol: url.protocol === "http:" ? "http" : "https",
    hostname: url.hostname,
    port: url.port,
    pathname: `${url.pathname.replace(/\/$/, "")}/**`,
  });
}

const paymentOrigins = [
  "https://checkout.stripe.com",
  "https://js.stripe.com",
  "https://www.paypal.com",
  "https://www.sandbox.paypal.com",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  ["img-src 'self' data: blob:", ...mediaOrigins].join(" "),
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  `frame-src 'self' ${paymentOrigins.join(" ")}`,
  `form-action 'self' ${paymentOrigins.join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg", "embedded-postgres"],
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [60, 75, 90],
    deviceSizes: [390, 640, 828, 1080, 1280, 1600, 2048],
    imageSizes: [48, 96, 160, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/media/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
