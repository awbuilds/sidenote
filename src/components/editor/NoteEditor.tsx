"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";

import { buildExtensions } from "@/lib/tiptap/extensions";
import { filesFromTransfer, insertAttachments } from "@/hooks/useAttachmentIngest";
import { countText } from "@/lib/tiptap/outline";
import { setCurrentNoteId } from "@/lib/tiptap/image-picker";
import { WikiLink, wikiLinkTitleFrom } from "@/lib/tiptap/wiki-link";
import { useTitleResolver } from "./useWikiLink";
import { SlashMenu } from "./SlashMenu";
import { EditorToolbar } from "./EditorToolbar";
import { useSaveNoteContent } from "@/hooks/mutations";
import { useAutosave } from "@/hooks/useAutosave";
import { hasPendingSave, subscribePendingSaves } from "@/lib/editor/pending-saves";
import { useSettings } from "@/hooks/queries";
import { editorTypographyClass } from "@/lib/typography";
import { cn } from "@/lib/utils";
import type { Note, SaveStatus } from "@/lib/db/types";

interface NoteEditorProps {
  note: Note;
  onEditorReady?: (editor: Editor | null) => void;
  onStatsChange?: (counts: { words: number; characters: number; blocks: number }) => void;
  /** Open another note — used when a `[[wiki link]]` is clicked. */
  onOpenNote?: (noteId: string) => void;
  onLinkNote?: () => void;
  /** Show the outline rail. */
  onOpenOutline?: () => void;
  readOnly?: boolean;
}

/**
 * The rich-text editor.
 *
 * Waits for the note-title set before constructing the editor. The wiki-link
 * decoration reads that set the moment the editor is created, and the only way
 * to correct it afterwards is to dispatch a transaction — which cannot be done
 * safely from a React effect, because it lands inside ProseMirror's
 * `applyTransaction` and is rejected as a mismatched transaction. That crashed
 * note opens intermittently, which is the worst way for it to fail: the same
 * URL worked on one load and not the next.
 *
 * So the editor waits for its input instead of being patched afterwards. The
 * query is one IndexedDB read and is usually already warm from the note list.
 * A hook cannot be called conditionally, so the gate lives in this wrapper and
 * the editor lives in the component behind it.
 */
export function NoteEditor(props: NoteEditorProps) {
  const { ready } = useTitleResolver();
  if (!ready) return <EditorLoading />;
  return <NoteEditorInner {...props} />;
}

function EditorLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading editor">
      <div className="h-12 animate-pulse border-b" />
      <div className="flex-1 space-y-3 p-6">
        <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

/**
 * `contentJson` is the source of truth; `contentMarkdown` and `contentText`
 * are derived on every save and never edited independently. The parent keys
 * this component by note id, so switching notes remounts it and no reset
 * effect is needed.
 *
 * `onEditorReady` hands the live instance to the parent so the outline and
 * status bar can read it without this component owning their rendering.
 */
function NoteEditorInner({
  note,
  onEditorReady,
  onStatsChange,
  onOpenNote,
  onLinkNote,
  onOpenOutline,
  readOnly = false,
}: NoteEditorProps) {
  const save = useSaveNoteContent();
  const { data: settings } = useSettings();
  const { status, queue, flush } = useAutosave(note.id, save);
  const [title, setTitle] = useState(note.title);
  // A payload that outlived its editor (a failed save during a note switch).
  const stranded = useSyncExternalStore(
    subscribePendingSaves,
    () => hasPendingSave(note.id),
    () => false,
  );

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  // Resolves `[[Title]]` against real notes. Behind a ref so the decoration
  // reads the current set from inside a transaction.
  const { resolved, idFor } = useTitleResolver();

  const links = useRef({ resolved, idFor, onOpenNote });
  useEffect(() => {
    links.current = { resolved, idFor, onOpenNote };
  }, [resolved, idFor, onOpenNote]);

  const openLinkDialog = useRef(onLinkNote);
  const openOutline = useRef(onOpenOutline);
  useEffect(() => {
    openLinkDialog.current = onLinkNote;
    openOutline.current = onOpenOutline;
  }, [onLinkNote, onOpenOutline]);

  const editor = useEditor({
    immediatelyRender: false,
    // No resolver is passed: the extension reads the module-level title set,
    // which the wrapper guarantees is populated before this component exists.
    extensions: [...buildExtensions({ placeholder: "Start writing…" }), WikiLink],
    content: note.contentJson,
    editorProps: {
      attributes: { class: "note-prose focus:outline-none", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = filesFromTransfer(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertAttachments(editorRef.current!, files, note.id);
        return true;
      },
      // A wiki link is a decoration, not an anchor, so there is no href to
      // follow — navigation is handled here by reading the title off the
      // clicked span.
      handleClickOn: (_view, _pos, _node, _nodePos, event, direct) => {
        if (!direct) return false;
        const title = wikiLinkTitleFrom(event.target);
        if (title === null) return false;

        const id = links.current.idFor(title);
        if (id === null) return false;

        event.preventDefault();
        links.current.onOpenNote?.(id);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = filesFromTransfer(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertAttachments(editorRef.current!, files, note.id);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      const doc = instance.getJSON();
      queue({ title, doc });
      onStatsChange?.(countText(doc));
    },
    onCreate: ({ editor: instance }) => {
      onStatsChange?.(countText(instance.getJSON()));
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // The note id lives on the editor so toolbar actions without a note prop
  // (image picker) can still reach it.
  useEffect(() => {
    if (editor !== null) setCurrentNoteId(editor, note.id);
  }, [editor, note.id]);

  if (editor === null) {
    return <div className="p-8 text-sm text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One centered reading column for title, toolbar and content, sized by
          the appearance preferences. Without it the measure runs the full
          pane width (~1100px on a 1440 screen). */}
      <div
        className={cn(
          "mx-auto flex min-h-0 w-full flex-1 flex-col px-6",
          editorTypographyClass({
            font: settings?.editorFont ?? "sans",
            width: settings?.editorWidth ?? "medium",
            lineHeight: settings?.editorLineHeight ?? "normal",
          }),
        )}
      >
        <input
          value={title}
          readOnly={readOnly}
          onChange={(event) => {
            const value = event.target.value;
            setTitle(value);
            queue({ title: value, doc: editor.getJSON() });
          }}
          placeholder="Untitled note"
          aria-label="Note title"
          className="w-full border-none bg-transparent pt-5 text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 focus:outline-none"
        />

        <div className="flex items-center justify-end py-1">
          <SaveIndicator status={status} stranded={stranded} onRetry={() => void flush()} />
        </div>

        <EditorToolbar
          editor={editor}
          readOnly={readOnly}
          onLinkNote={onLinkNote === undefined ? undefined : () => openLinkDialog.current?.()}
          onOpenOutline={onOpenOutline === undefined ? undefined : () => openOutline.current?.()}
        />
        <SlashMenu editor={editor} />
        <EditorContent
          editor={editor}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto pb-24",
            readOnly && "cursor-default",
          )}
        />
      </div>
    </div>
  );
}

function SaveIndicator({
  status,
  stranded,
  onRetry,
}: {
  status: SaveStatus;
  /** A payload is still waiting in the module store, e.g. after a failed switch. */
  stranded: boolean;
  onRetry: () => void;
}) {
  if (status === "idle" && !stranded) return null;

  const failed = status === "error" || (stranded && status !== "saving");
  const label = failed ? "Unsaved changes" : status === "saving" ? "Saving…" : "Saved";

  return (
    <span
      className={failed ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      aria-live="polite"
    >
      {label}
      {failed && (
        <button type="button" onClick={onRetry} className="ml-2 underline">
          Retry
        </button>
      )}
    </span>
  );
}
