import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: "standalone",

  // Disable telemetry
  experimental: {
    // Allow server actions from external hosts (for container networking)
  },

  // Server-side only packages
  serverExternalPackages: ["child_process", "fs", "path", "stream", "events"],
};

export default nextConfig;
