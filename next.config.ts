import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Read once at build time; `NEXT_PUBLIC_*` values are inlined by Next. */
const packageJson = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "package.json"), "utf8"),
) as { version: string };

/**
 * Response hardening.
 *
 * All of a user's notes live in this origin's IndexedDB, so an HTML-injection
 * foothold is the whole library. The app already constrains the editor schema,
 * but a second line of defence is cheap. `frame-ancestors`/`X-Frame-Options`
 * also stop the destructive actions (delete, empty trash, revoke share) from
 * being clickjacked.
 *
 * The CSP starts as report-only because Next injects inline bootstrap scripts
 * (and the pre-paint theme script is inline by design). It is only sent in
 * production: Turbopack's dev server needs eval and websockets, and a
 * report-only policy there would be noise.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The Docker image needs the standalone server bundle; Vercel does not, so
  // this is opt-in to keep the normal build unchanged.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Without this, Turbopack walks up to $HOME and picks up an unrelated
  // pnpm-lock.yaml, which it warns about on every build.
  turbopack: {
    root: path.join(import.meta.dirname),
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
  async headers() {
    const headers = [...SECURITY_HEADERS];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Content-Security-Policy-Report-Only",
        value: CSP_REPORT_ONLY,
      });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
