import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev overlay badge sits exactly where the first live metric renders.
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
