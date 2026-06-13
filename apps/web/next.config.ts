import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Anchor the workspace root to the monorepo (kinnso-v3); otherwise Next can
  // mis-detect an unrelated lockfile elsewhere on the machine as the root.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
