import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PWA service worker will be configured via next-pwa when ready for production.
  // For now, the manifest.json in /public provides basic PWA metadata
  // (home screen icon, theme color, standalone display).
};

export default nextConfig;
