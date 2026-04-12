import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  allowedDevOrigins: ["172.20.112.1"],
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
