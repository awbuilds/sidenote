import type { MetadataRoute } from "next";

/**
 * Only the app entry point is listed. `/` redirects to `/notes`; every other
 * surface renders the visitor's own local data, which a crawler has none of.
 * Share links are deliberately absent — they are unlisted by design.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://sidenoteapp.vercel.app/notes",
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
