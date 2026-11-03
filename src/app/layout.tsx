import type { Metadata, Viewport } from "next";
import { Geist, IBM_Plex_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { SplashScreen } from "@/components/SplashScreen";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

/**
 * The splash wordmark's face, matching OpenCode's own type voice.
 *
 * OpenCode's stylesheet declares `--font-sans: var(--font-mono)`, so its entire
 * site — headings included — renders monospace. That, not a heavy grotesque, is
 * what "looks like OpenCode". Its stack leads with Berkeley Mono, which is
 * commercial and cannot be redistributed here, so this takes the open-source
 * entry instead.
 *
 * Static weights only, as Plex Mono is not a variable font, and only the two
 * the splash uses. 700 is the heaviest weight Plex Mono ships — there is no
 * 900 — so the wordmark's weight comes from the squared letterforms rather than
 * from a heavier cut.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-plex-mono",
});

const SITE_URL = "https://sidenoteapp.vercel.app";
const DESCRIPTION =
  "A private, local-first notes and knowledge base. Your notes live in your browser, sync only if you ask, and export as a ZIP any time.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Sidenote — Local-first notes",
    template: "%s · Sidenote",
  },
  description: DESCRIPTION,
  applicationName: "Sidenote",
  // Without this the manifest in /public is never linked, and Chrome has no
  // install prompt to offer. The favicon and Apple touch icon come from the
  // app-dir files (src/app/icon.svg, src/app/apple-icon.png).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sidenote",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Sidenote",
    title: "Sidenote — Local-first notes",
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Sidenote — a private, local-first notebook",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sidenote — Local-first notes",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  // Google Search Console verification: paste the content value from the
  // HTML-tag method here; a metadata export survives redeploys.
  // verification: { google: "..." },
};

/**
 * Structured data so a search result can name the app instead of guessing
 * from the page title. Rendered with `dangerouslySetInnerHTML` — it is a
 * constant, not user input.
 */
const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sidenote",
    url: SITE_URL,
    description: DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sidenote",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: DESCRIPTION,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Organization", name: "AW Builds" },
  },
];

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "oklch(0.145 0 0)" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(geist.variable, plexMono.variable)}
    >
      <body className="antialiased">
        {/* Applies the stored theme before first paint so there is no flash of
            the wrong colour scheme. Reads only the localStorage mirror — the
            canonical value lives in IndexedDB, which is async.

            `dangerouslySetInnerHTML`, not JSX children. `next/script` with
            `beforeInteractive` renders a real `<script>` element into the React
            tree, and React 19 then refuses it — "Encountered a script tag while
            rendering React component" followed by a hydration failure, which is
            what /settings was doing. This is the form React supports for an
            inline script in a layout, and the string is a constant from
            src/lib/theme, not user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />

        {/* Covers app boot: JavaScript parsed, React hydrated, first paint —
            and carries the progress bar, which runs as a CSS animation on
            server-rendered markup so it is already moving before this hydrates.
            It hands over to the pane skeletons, which cover data loading. Those
            are different states and one overlay cannot honestly represent both. */}
        <SplashScreen />

        {children}
      </body>
    </html>
  );
}
