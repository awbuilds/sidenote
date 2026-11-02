import { Providers } from "@/components/providers";
import { SharedNoteView } from "@/components/share/SharedNoteView";

export const metadata = {
  title: "Shared note",
  // Public share links should never end up in a search index.
  robots: { index: false, follow: false },
};

export default async function SharedNotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Providers>
      <main className="min-h-dvh bg-background">
        <SharedNoteView token={token} />
      </main>
    </Providers>
  );
}
