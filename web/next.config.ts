import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@koul/core"],
  // @koul/core is a symlink to ../packages/core; the bundler root must include it.
  turbopack: { root: path.join(__dirname, "..") },
  // The dev indicator badge sits on top of the mobile tab bar; the demo runs in dev.
  devIndicators: false,
};

export default nextConfig;
