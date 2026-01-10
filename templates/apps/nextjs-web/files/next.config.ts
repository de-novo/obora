import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@{{PROJECT_NAME}}/ui", "@{{PROJECT_NAME}}/database"],
};

export default nextConfig;
