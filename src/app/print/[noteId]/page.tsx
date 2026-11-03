import { PrintView } from "@/components/print/PrintView";

export const metadata = {
  title: "Print note",
  robots: { index: false, follow: false },
};

export default async function PrintPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;

  return (
    <main className="h-dvh bg-background">
      <PrintView noteId={noteId} />
    </main>
  );
}
