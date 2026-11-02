import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The Docker image needs the standalone server bundle; Vercel does not, so
  // this is opt-in to keep the normal build unchanged.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Without this, Turbopack walks up to $HOME and picks up an unrelated
  // pnpm-lock.yaml, which it warns about on every build.
  turbopack: {
    root: path.join(import.meta.dirname),
  },
};

export default nextConfig;
