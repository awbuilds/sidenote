"use client";

import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderInput,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/format";
import { useNotebookTree } from "@/hooks/queries";
import {
  useCreateNotebook,
  useDeleteNotebook,
  useMoveNotebook,
  useRenameNotebook,
  useReorderNotebooks,
} from "@/hooks/mutations";
import { wouldCreateCycle } from "@/lib/db/tree";
import type { DeleteNotebookStrategy } from "@/lib/db/repositories/notebooks";
import type { Notebook, NotebookId, NotebookNode } from "@/lib/db/types";

const DRAG_MIME = "application/x-notes-notebook";

type DialogState =
  | { kind: "none" }
  | { kind: "create"; parentId: NotebookId | null }
  | { kind: "rename"; id: NotebookId; current: string }
  | { kind: "delete"; id: NotebookId; name: string; totalNoteCount: number }
  | { kind: "move"; id: NotebookId; name: string };

interface TreeContext {
  selectedId: NotebookId | null;
  onSelect: (id: NotebookId) => void;
  collapsed: Set<NotebookId>;
  onToggleCollapse: (id: NotebookId) => void;
  onCreateChild: (id: NotebookId) => void;
  onRename: (id: NotebookId, name: string) => void;
  onMove: (id: NotebookId, name: string) => void;
  onDelete: (id: NotebookId, name: string, count: number) => void;
  /** Id currently being dragged, or null. */
  draggingId: NotebookId | null;
  setDraggingId: (id: NotebookId | null) => void;
  dropTargetId: NotebookId | null;
  setDropTargetId: (id: NotebookId | null) => void;
  /** Would dropping `draggedId` onto `targetId` be refused? */
  canDrop: (draggedId: NotebookId, targetId: NotebookId) => boolean;
}

export function NotebookTree({
  selectedId,
  onSelect,
  className,
}: {
  selectedId: NotebookId | null;
  onSelect: (id: NotebookId) => void;
  className?: string;
}) {
  const { data, isPending } = useNotebookTree();
  const [collapsed, setCollapsed] = useState<Set<NotebookId>>(new Set());
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [draggingId, setDraggingId] = useState<NotebookId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<NotebookId | null>(null);

  const nodes = data ?? [];
  const flat = flatten(nodes);

  if (isPending) {
    return (
      <div className={cn("space-y-1.5 p-2", className)}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={cn("px-3 py-2", className)}>
        <p className="text-sm text-muted-foreground">No notebooks yet.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 gap-1.5"
          onClick={() => setDialog({ kind: "create", parentId: null })}
        >
          <Plus className="size-3.5" />
          New notebook
        </Button>
      </div>
    );
  }

  // Rows are the domain objects, which is what `wouldCreateCycle` expects.
  const asNotebooks: Notebook[] = flat.map(({ depth, children, noteCount, totalNoteCount, ...rest }) => {
    void depth;
    void children;
    void noteCount;
    void totalNoteCount;
    return rest;
  });

  const canDrop = (draggedId: NotebookId, targetId: NotebookId) =>
    targetId !== draggedId && !wouldCreateCycle(asNotebooks, draggedId, targetId);

  const ctx: TreeContext = {
    selectedId,
    onSelect,
    collapsed,
    onToggleCollapse: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    onCreateChild: (id) => setDialog({ kind: "create", parentId: id }),
    onRename: (id, name) => setDialog({ kind: "rename", id, current: name }),
    onMove: (id, name) => setDialog({ kind: "move", id, name }),
    onDelete: (id, name, count) => setDialog({ kind: "delete", id, name, totalNoteCount: count }),
    draggingId,
    setDraggingId,
    dropTargetId,
    setDropTargetId,
    canDrop,
  };

  return (
    <>
      <div className="flex items-center gap-1 px-2 pb-1">
        <p className="flex-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Notebooks
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="New notebook"
          onClick={() => setDialog({ kind: "create", parentId: null })}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <ul
        className={cn("space-y-0.5 p-2", className)}
        role="tree"
        onDragEnd={() => {
          setDraggingId(null);
          setDropTargetId(null);
        }}
      >
        {nodes.map((node) => (
          <TreeRow key={node.id} node={node} ctx={ctx} siblingIds={nodes.map((n) => n.id)} />
        ))}
      </ul>

      <NotebookDialogs state={dialog} all={flat} onClose={() => setDialog({ kind: "none" })} />
    </>
  );
}

function flatten(nodes: NotebookNode[]): NotebookNode[] {
  const out: NotebookNode[] = [];
  const walk = (list: NotebookNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function TreeRow({
  node,
  ctx,
  siblingIds,
}: {
  node: NotebookNode;
  ctx: TreeContext;
  siblingIds: NotebookId[];
}) {
  const move = useMoveNotebook();
  const reorder = useReorderNotebooks();

  const hasChildren = node.children.length > 0;
  const isCollapsed = ctx.collapsed.has(node.id);
  const selected = ctx.selectedId === node.id;
  const Icon = hasChildren && !isCollapsed ? FolderOpen : Folder;

  const droppable =
    ctx.draggingId !== null && ctx.canDrop(ctx.draggingId, node.id);
  const isDropTarget = ctx.dropTargetId === node.id && droppable;

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    ctx.setDropTargetId(null);
    const draggedId = ctx.draggingId;
    if (draggedId === null || !ctx.canDrop(draggedId, node.id)) return;

    if (node.id === draggedId) return;

    if (node.parentId === draggedId) {
      // Dropped onto its current parent: append to the end of that group.
      reorder.mutate({ parentId: node.id, orderedIds: [...siblingIds, draggedId] });
      return;
    }
    move.mutate({ id: draggedId, parentId: node.id });
  };

  return (
    <li role="none">
      <div
        className="group relative flex items-center"
        onDragOver={(event) => {
          if (ctx.draggingId === null) return;
          if (!ctx.canDrop(ctx.draggingId, node.id)) {
            event.dataTransfer.dropEffect = "none";
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          ctx.setDropTargetId(node.id);
        }}
        onDragLeave={() => {
          if (ctx.dropTargetId === node.id) ctx.setDropTargetId(null);
        }}
        onDrop={handleDrop}
      >
        {hasChildren && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute size-5 shrink-0 rounded-sm"
            style={{ left: `${2 + node.depth * 14}px` }}
            onClick={() => ctx.onToggleCollapse(node.id)}
            aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
            aria-expanded={!isCollapsed}
          >
            <ChevronRight className={cn("size-3 transition-transform", !isCollapsed && "rotate-90")} />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_MIME, node.id);
            event.dataTransfer.effectAllowed = "move";
            ctx.setDraggingId(node.id);
          }}
          onClick={() => ctx.onSelect(node.id)}
          role="treeitem"
          aria-selected={selected}
          aria-level={node.depth + 1}
          style={{ paddingLeft: `${(hasChildren ? 22 : 8) + node.depth * 14}px` }}
          className={cn(
            "h-8 w-full justify-start gap-2 pr-8 text-sm font-normal",
            selected
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50",
            ctx.draggingId === node.id && "opacity-40",
            isDropTarget && "ring-1 ring-primary/50",
          )}
        >
          <Icon className="size-4 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
          {node.totalNoteCount > 0 && (
            <span className="shrink-0 text-xs tabular-nums opacity-60">{node.totalNoteCount}</span>
          )}
        </Button>

        <RowMenu node={node} ctx={ctx} />
      </div>

      {!isCollapsed && hasChildren && (
        <ul role="group" className="space-y-0.5">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              ctx={ctx}
              siblingIds={node.children.map((c) => c.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RowMenu({ node, ctx }: { node: NotebookNode; ctx: TreeContext }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 size-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          aria-label={`Actions for ${node.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="truncate">{node.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => ctx.onCreateChild(node.id)}>
          <Plus className="size-4" />
          New notebook inside
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ctx.onRename(node.id, node.name)}>
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ctx.onMove(node.id, node.name)}>
          <FolderInput className="size-4" />
          Move to…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => ctx.onDelete(node.id, node.name, node.totalNoteCount)}
        >
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function NotebookDialogs({
  state,
  all,
  onClose,
}: {
  state: DialogState;
  all: NotebookNode[];
  onClose: () => void;
}) {
  const create = useCreateNotebook();
  const rename = useRenameNotebook();
  const remove = useDeleteNotebook();
  const move = useMoveNotebook();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("root");
  const [strategy, setStrategy] = useState<DeleteNotebookStrategy>("trashNotes");

  const close = () => {
    onClose();
    setName("");
    setTarget("root");
    setStrategy("trashNotes");
  };

  if (state.kind === "none") return null;

  if (state.kind === "create" || state.kind === "rename") {
    const isCreate = state.kind === "create";
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isCreate
                ? state.parentId
                  ? "New notebook inside"
                  : "New notebook"
                : "Rename notebook"}
            </DialogTitle>
            {isCreate && state.parentId && (
              <DialogDescription>
                It will be nested inside the selected notebook.
              </DialogDescription>
            )}
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() === "") return;
              if (isCreate) {
                create.mutate({ name, parentId: state.parentId }, { onSuccess: close });
              } else {
                rename.mutate({ id: state.id, name }, { onSuccess: close });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="notebook-name">Name</Label>
              <Input
                id="notebook-name"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Reading"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={(isCreate ? create : rename).isPending || name.trim() === ""}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.kind === "move") {
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move &ldquo;{state.name}&rdquo;</DialogTitle>
            <DialogDescription>
              Notebooks nest as deep as you like, but never inside themselves.
            </DialogDescription>
          </DialogHeader>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Top level</SelectItem>
              {all
                .filter((node) => node.id !== state.id)
                .map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {"— ".repeat(node.depth)}
                    {node.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                move.mutate(
                  { id: state.id, parentId: target === "root" ? null : target },
                  { onSuccess: close },
                )
              }
              disabled={move.isPending}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{state.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            The notebook and everything nested inside it is removed. The notes
            inside are handled by the choice below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {state.totalNoteCount > 0 && (
            <p className="text-sm">
              It contains <strong>{pluralize(state.totalNoteCount, "note")}</strong>.
            </p>
          )}
          <Select
            value={strategy}
            onValueChange={(value) => setStrategy(value as DeleteNotebookStrategy)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trashNotes">Move the notes to trash (recoverable)</SelectItem>
              <SelectItem value="unfileNotes">Keep the notes, remove the notebook</SelectItem>
              <SelectItem value="purgeNotes">Delete the notes permanently</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ id: state.id, strategy }, { onSuccess: close })}
          >
            Delete notebook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
