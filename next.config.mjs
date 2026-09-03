/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/webp", "image/avif"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  webpack: (config) => {
    // realtime.ts uses require("fs") guarded at runtime with typeof window check.
    // Next.js still tries to resolve fs/path in client bundles → build warning.
    // Mark as external so it's never bundled client-side.
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
