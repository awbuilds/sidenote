"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  PanelLeftClose,
  Paperclip,
  RefreshCw,
  Settings,
  Settings2,
  Star,
  StickyNote,
  Tag as TagIcon,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { ThemeToggle } from "./ThemeToggle";
import { StorageStatus } from "./StorageStatus";
import { MobilePaneHeader, PaneVisibility } from "./MobilePaneHeader";
import { EditorPane } from "./EditorPane";
import { NotebookTree } from "@/components/notebooks/NotebookTree";
import { SidebarSection } from "@/components/layout/SidebarSection";
import { NoteListPane } from "@/components/notes/NoteListPane";
import { NewNoteFromTemplate } from "@/components/notes/NoteTemplates";
import { AttachmentsPane } from "@/components/notes/AttachmentsPane";
import { NewNoteButton } from "@/components/layout/NewNoteButton";
import { TagSection } from "@/components/notes/TagSection";
import { AccountButton } from "@/components/sync/AccountButton";
import { Brand } from "@/components/Brand";
import { GitHubLink } from "@/components/GitHubLink";
import { CompanionPet } from "@/components/companion/CompanionPet";
import { DEFAULT_COMPANION } from "@/lib/companion";

import { useBootstrap } from "@/hooks/useBootstrap";
import { useNotebookTree, useSettings, useTrashedCount } from "@/hooks/queries";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { shouldShowOnboarding } from "@/lib/onboarding";
import { flattenTree } from "@/lib/db/tree";
import { cn } from "@/lib/utils";
import { WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { CommandPalette } from "./CommandPalette";
import { IconRail } from "./IconRail";
import { FocusToggle, useFocusMode } from "./FocusMode";
import { InstallButton, useServiceWorker } from "@/hooks/usePwa";
import { SyncStatusButton } from "@/components/sync/SyncStatusButton";
import { MobileTabBar } from "./MobileTabBar";
import { GettingStartedCard } from "./GettingStartedCard";
import { useWorkspaceParams, UNFILED, type Pane } from "@/hooks/useWorkspaceParams";

export function Workspace() {
  const { params, notebookFilter, setParam, selectNotebook, selectNote } = useWorkspaceParams();
  const bootstrap = useBootstrap();
  const { data: rootSettings, isPending: settingsPending } = useSettings();
  const [focus] = useFocusMode();
  useServiceWorker();

  // Which pane is foreground on small screens. Derived from the URL, with an
  // explicit override for the back/forward buttons. No effect syncing state
  // to a prop — the URL is the source of truth, clicks are the only other
  // input, and clicks are events.
  const [paneOverride, setPaneOverride] = useState<Pane | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const { data: notebookTree } = useNotebookTree();

  // Human name for whatever the URL currently scopes to, for the list header.
  const scopeLabel = useMemo(() => {
    if (params.notebookId === null) return "All notes";
    if (params.notebookId === UNFILED) return "Unfiled";
    const match = flattenTree(notebookTree ?? []).find((node) => node.id === params.notebookId);
    return match?.name ?? "All notes";
  }, [params.notebookId, notebookTree]);
  const pane: Pane = paneOverride ?? (params.noteId !== null ? "editor" : "notes");

  const goBack = (target: Pane) => setPaneOverride(target);

  if (bootstrap.state === "error") {
    return <BootstrapError error={bootstrap.error} onRetry={bootstrap.retry} />;
  }

  if (bootstrap.state === "loading" || settingsPending) {
    return <WorkspaceSkeleton />;
  }

  // The settings query is mounted before the seed finishes. While the fresh
  // row is being refetched, keep the skeleton up rather than flashing the
  // workspace for a frame and then replacing it with the tour.
  if (
    bootstrap.seeded &&
    rootSettings?.onboardingCompletedAt === null &&
    !rootSettings.onboardingPending
  ) {
    return <WorkspaceSkeleton />;
  }

  if (rootSettings && shouldShowOnboarding(rootSettings)) {
    return <Onboarding />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <CommandPalette />
      {focus && (
        <div className="fixed top-2 right-2 z-30">
          <FocusToggle />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
      {/* Collapsing keeps the note list and editor visible and swaps the
          sidebar for an icon rail. */}
      {!focus && railCollapsed && (
        <IconRail onExpand={() => setRailCollapsed(false)} trashActive={false} />
      )}

      {/* Focus mode hides the navigation panes and leaves the editor. */}
      {!focus && !railCollapsed && (
        <PaneVisibility pane="notebooks" active={pane} className="w-full border-r lg:w-64">
          <MobilePaneHeader
            pane="notebooks"
            onBack={goBack}
            right={
              <div className="flex items-center gap-0.5">
                <SyncStatusButton />
                <Button variant="ghost" size="icon" className="size-8" asChild>
                  <Link href="/settings" aria-label="Settings">
                    <Settings2 className="size-4" />
                  </Link>
                </Button>
              </div>
            }
          />
          <NotebookSidebar
            selectedNotebookId={params.notebookId}
            onSelectNotebook={(id) => {
              selectNotebook(id);
              goBack("notes");
            }}
            onCollapse={() => setRailCollapsed(true)}
            onNavigate={goBack}
            activePane={pane}
            onOpenNote={(id) => {
              selectNote(id);
              goBack("notes");
            }}
          />
        </PaneVisibility>
      )}

      {!focus && (
        <PaneVisibility pane="attachments" active={pane} exclusive className="w-full border-r lg:w-80">
          <MobilePaneHeader
            pane="attachments"
            onBack={goBack}
            right={<PaneHeaderRight />}
          />
          <AttachmentsPane
            onOpenNote={(id) => {
              selectNote(id);
              goBack("notes");
            }}
          />
        </PaneVisibility>
      )}

      {!focus && (
        <PaneVisibility
          pane="notes"
          active={pane}
          hidden={pane === "attachments"}
          className="w-full border-r lg:w-80"
        >
          <MobilePaneHeader pane="notes" onBack={goBack} right={<PaneHeaderRight />} />
        <NoteListPane
            notebookId={notebookFilter}
            selectedNoteId={params.noteId}
            onSelectNote={selectNote}
            onNoteCreated={selectNote}
            query={params.query}
            onQueryChange={(value) => setParam("q", value)}
          scopeLabel={scopeLabel}
            emptyMessage={
              notebookFilter === null
                ? "No notes are unfiled."
                : "This notebook is empty. Create your first note."
            }
          />
        </PaneVisibility>
      )}

      <PaneVisibility pane="editor" active={pane} className="flex-1">
        <MobilePaneHeader pane="editor" onBack={goBack} right={<PaneHeaderRight />} />
        <EditorPane
          noteId={params.noteId}
          onNoteDeleted={() => setParam("note", null)}
          onOpenNote={selectNote}
        />
      </PaneVisibility>
      </div>

      {!focus && pane !== "editor" && (
        <MobileTabBar pane={pane} onNavigate={goBack} />
      )}
    </div>
  );
}

function PaneHeaderRight() {
  return (
    <div className="flex items-center gap-0.5">
      <SyncStatusButton />
      <GitHubLink />
      <ThemeToggle />
    </div>
  );
}

function NotebookSidebar({
  selectedNotebookId,
  onSelectNotebook,
  onNavigate,
  onOpenNote,
  onCollapse,
  activePane,
}: {
  selectedNotebookId: string | null;
  onSelectNotebook: (id: string | null) => void;
  onNavigate: (pane: Pane) => void;
  onOpenNote: (id: string) => void;
  onCollapse: () => void;
  /** Which pane is in front, so the rail can show where you are. */
  activePane: Pane;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: settings } = useSettings();
  const trashedCount = useTrashedCount();

  const [showTags, setShowTags] = useState(true);

  const goAllNotes = () => {
    onSelectNotebook(null);
    onNavigate("notes");
  };

  return (
    <>
      {/* Quick rail. Only destinations that exist as views are here — the
          reference also shows attachments, tables and plugins, which have no
          equivalent here, and a button that opens nothing is worse than none. */}
      <div className="flex shrink-0 items-center gap-0.5 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", showTags && "bg-accent text-accent-foreground")}
          aria-label={showTags ? "Hide tags" : "Show tags"}
          aria-pressed={showTags}
          onClick={() => setShowTags((value) => !value)}
        >
          <TagIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", activePane === "attachments" && "bg-accent text-accent-foreground")}
          aria-label="Attachments"
          aria-pressed={activePane === "attachments"}
          onClick={() => onNavigate(activePane === "attachments" ? "notes" : "attachments")}
        >
          <Paperclip className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", pathname === "/trash" && "bg-accent text-accent-foreground")}
          aria-label="Trash"
          aria-pressed={pathname === "/trash"}
          onClick={() => {
            router.push("/trash");
            onNavigate("notes");
          }}
        >
          <Trash2 className="size-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 lg:hidden"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <Star className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {settings?.profileName?.trim() || "Sidenote"}
        </span>
        <SyncStatusButton />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 lg:inline-flex"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-2">
        <div className="space-y-0.5 px-2">
          <NewNoteButton
            notebookId={selectedNotebookId === UNFILED ? null : selectedNotebookId}
            onCreated={onOpenNote}
            className="mb-1 px-0"
          />
          <NewNoteFromTemplate notebookId={selectedNotebookId} onCreated={onOpenNote} />
          <SidebarSection
            icon={<StickyNote className="size-4" />}
            label="All notes"
            active={pathname === "/notes" && selectedNotebookId === null}
            onClick={goAllNotes}
          />
          <SidebarSection
            icon={<TagIcon className="size-4" />}
            label="Unfiled"
            active={selectedNotebookId === UNFILED}
            onClick={() => {
              onSelectNotebook(UNFILED);
              onNavigate("notes");
            }}
          />
          <SidebarSection
            icon={<Trash2 className="size-4" />}
            label="Trash"
            count={trashedCount}
            active={pathname === "/trash"}
            onClick={() => {
              router.push("/trash");
              onNavigate("notes");
            }}
          />
        </div>

        <GettingStartedCard />

        <Separator className="my-2" />

        {showTags && (
          <div className="pb-2">
            <TagSection />
          </div>
        )}

        <NotebookTree
          selectedId={selectedNotebookId}
          onSelect={(id) => {
            onSelectNotebook(id);
            onNavigate("notes");
          }}
        />
      </nav>

      <div className="shrink-0 space-y-2 border-t p-3">
        <InstallButton />
        <div className="space-y-0.5">
          <StorageStatus variant="compact" />
          {/* The reference offers "Download clients" here. There are no clients
              to download — this is web only — so the slot holds the one thing
              that does leave the browser, which is the backup. */}
          <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-2" asChild>
            <Link href="/settings">
              <Download className="size-4 opacity-70" />
              Export backup
            </Link>
          </Button>
          <AccountButton variant="sidebar" />
          <div className="flex items-center gap-1">
            {settings?.companionEnabled && (
              <CompanionPet
                id={settings.companionId ?? DEFAULT_COMPANION}
                avatarClassName="size-5"
                buttonClassName="size-8 shrink-0"
                bubbleAlign="start"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-0 flex-1 justify-start gap-2"
              asChild
            >
              <Link href="/settings">
                {!settings?.companionEnabled && <User className="size-4 opacity-70" />}
                <span className="min-w-0 flex-1 truncate text-left">
                  {settings?.profileName?.trim() || "Profile"}
                </span>
                <Settings className="size-3.5 shrink-0 opacity-50" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 px-1 pt-1">
          <Brand />
          <GitHubLink className="size-7 shrink-0" />
        </div>
      </div>
    </>
  );
}

function BootstrapError({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <AlertCircle className="mx-auto size-8 text-destructive" />
        <h1 className="text-base font-semibold">Could not open your notes</h1>
        <p className="text-sm text-muted-foreground">
          This app stores everything in your browser&rsquo;s local database. It may be
          unavailable in private browsing, or blocked by your settings.
        </p>
        <p className="rounded-md bg-muted p-2 text-left font-mono text-xs text-muted-foreground">
          {error?.message ?? "Unknown error"}
        </p>
        <Button onClick={onRetry} className="gap-2">
          <RefreshCw className="size-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
