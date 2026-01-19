import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Bundle size optimization - avoid barrel file imports (vercel-react-best-practices: bundle-barrel-imports)
  // lucide-react has ~1,583 re-exports, this transforms imports to direct paths at build time
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
