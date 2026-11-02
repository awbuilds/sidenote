import type { MetadataRoute } from "next";

const SITE_URL = "https://sidenoteapp.vercel.app";

/**
 * Share links (`/s/<token>`) are unlisted capability URLs, not content —
 * indexing one would publish a private note. The share page also sends
 * `robots: noindex` itself, so this holds even for a crawler that ignores
 * robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/s/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
