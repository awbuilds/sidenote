import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up to $HOME and picks up an unrelated
  // pnpm-lock.yaml, which it warns about on every build.
  turbopack: {
    root: path.join(import.meta.dirname),
  },
};

export default nextConfig;
