"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronRight, ListTree, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { outlineFromDoc, type OutlineNode } from "@/lib/tiptap/outline";

/**
 * Below `xl` the rail floats over the editor; above it, it takes its own space.
 *
 * It used to be `hidden xl:flex`, which made the toolbar toggle a no-op on any
 * screen under 1280px: the button changed its pressed state and nothing
 * appeared. A control that silently does nothing is worse than no control.
 */
const RAIL_CLASSES =
  "absolute inset-y-0 right-0 z-20 flex w-64 shrink-0 flex-col border-l bg-background shadow-lg xl:static xl:z-auto xl:shadow-none";

interface Row {
  node: OutlineNode;
  depth: number;
  /** True when an ancestor is collapsed — the row is not rendered. */
  hidden: boolean;
}

/** Flatten the tree, marking rows whose ancestor is collapsed as hidden. */
function toRows(nodes: OutlineNode[], collapsed: Set<string>, depth = 0): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    const isCollapsed = collapsed.has(node.id);
    rows.push({ node, depth, hidden: false });
    for (const child of toRows(node.children, collapsed, depth + 1)) {
      rows.push({ ...child, hidden: child.hidden || isCollapsed });
    }
  }
  return rows;
}

/**
 * Document outline, derived from the live editor.
 *
 * Recomputed on every document change rather than stored, so it cannot drift
 * from the content. The subscription lives here so typing does not re-render
 * the rest of the pane.
 */
export function EditorOutline({
  editor,
  onClose,
}: {
  editor: Editor | null;
  onClose: () => void;
}) {
  // `tree` is tagged with the editor it came from. When the instance changes
  // the value is derived during render; afterwards it arrives from the
  // subscription callback. That avoids a synchronous setState in the effect,
  // which the React Compiler lint rule rejects.
  const [state, setState] = useState<{ editor: Editor | null; tree: OutlineNode[] }>({
    editor: null,
    tree: [],
  });
  const tree = useMemo(
    () =>
      state.editor === editor
        ? state.tree
        : editor === null
          ? []
          : outlineFromDoc(editor.getJSON()),
    [state.editor, state.tree, editor],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (editor === null) return;

    const sync = () => setState({ editor, tree: outlineFromDoc(editor.getJSON()) });
    editor.on("update", sync);
    editor.on("create", sync);
    return () => {
      editor.off("update", sync);
      editor.off("create", sync);
    };
  }, [editor]);

  const rows = useMemo(() => toRows(tree, collapsed), [tree, collapsed]);
  const visible = rows.filter((row) => !row.hidden);

  // 1, 2, 3 … across the top-level sections, counted from the whole tree rather
  // than the visible rows, so collapsing a section does not renumber the rest.
  const topLevelNumber = useMemo(() => {
    const numbers = new Map<string, number>();
    let next = 1;
    for (const node of tree) numbers.set(node.id, next++);
    return numbers;
  }, [tree]);

  // Scroll spy: highlight the heading nearest the top of the viewport. Only the
  // scroll handler sets state — the effect body just subscribes.
  useEffect(() => {
    if (editor === null || rows.length === 0) return;

    const sync = () => {
      const dom = editor.view.dom as HTMLElement;
      const elements = editor.view.dom.querySelectorAll("h1, h2, h3");
      if (elements.length === 0) return;

      let current: string | null = null;
      for (const [index, element] of [...elements].entries()) {
        if (element.getBoundingClientRect().top <= 120) {
          current = rows[index]?.node.id ?? null;
        }
      }
      // At the very top, the first heading is the honest answer.
      if (dom.scrollTop < 40) current = rows[0]?.node.id ?? null;
      setActiveId(current);
    };

    const dom = editor.view.dom as HTMLElement;
    dom.addEventListener("scroll", sync, { passive: true });
    return () => dom.removeEventListener("scroll", sync);
  }, [editor, rows]);

  const jumpTo = useCallback(
    (index: number) => {
      if (editor === null) return;
      const row = rows[index];
      if (row === undefined) return;

      // Headings are the only h1/h2/h3 and appear in document order, so the
      // index into the rows lines up with the DOM NodeList.
      const element = editor.view.dom.querySelectorAll("h1, h2, h3")[index];
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(row.node.id);
    },
    [editor, rows],
  );

  const toggle = useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <aside className={RAIL_CLASSES}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
        <ListTree className="size-3.5 opacity-70" />
        <span className="flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Outline
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onClose}
          aria-label="Hide outline"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <ListTree className="size-5 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {tree.length === 0
              ? "Add a heading to build an outline."
              : "All sections are collapsed."}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {visible.map((row) => {
              const index = rows.indexOf(row);
              const isCollapsed = collapsed.has(row.node.id);
              // Top-level sections are numbered, as in the reference. Nested
              // entries are not: numbering only the roots reads as a table of
              // contents rather than an arbitrary list with counters.
              const number =
                row.depth === 0 ? topLevelNumber.get(row.node.id) : undefined;

              return (
                <li key={row.node.id}>
                  <div className="flex items-center gap-1" style={{ paddingLeft: `${row.depth * 12}px` }}>
                    {row.node.children.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-4 shrink-0 rounded-sm"
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${row.node.text}`}
                        aria-expanded={!isCollapsed}
                        onClick={() => toggle(row.node.id)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="size-3" />
                        ) : (
                          <ChevronDown className="size-3" />
                        )}
                      </Button>
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}

                    {number !== undefined && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                        {number}.
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-xs transition-colors",
                        activeId === row.node.id
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50",
                        row.depth === 0 && "font-medium text-foreground/90",
                      )}
                    >
                      {row.node.text === "" ? "Untitled section" : row.node.text}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
