import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { Workspace } from "@/components/layout/Workspace";
import { WorkspaceSkeleton } from "@/components/layout/WorkspaceSkeleton";

export default function NotesPage() {
  return (
    <Providers>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <Workspace />
      </Suspense>
    </Providers>
  );
}
