"use client";

import { useState } from "react";
import { Check, ChevronRight, FolderInput } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/format";
import { useNotebookTree } from "@/hooks/queries";
import { UNFILED } from "@/hooks/useWorkspaceParams";
import { flattenTree } from "@/lib/db/tree";
import type { NotebookId } from "@/lib/db/types";

/**
 * Choose a destination notebook.
 *
 * `UNFILED` is the "no notebook" option, distinct from `null` meaning "no
 * change". Callers that need to distinguish those pass `allowUnfiled={false}`.
 */
export function NotebookPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
  allowUnfiled = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Receives `null` for unfiled. */
  onConfirm: (notebookId: NotebookId | null) => void;
  pending?: boolean;
  allowUnfiled?: boolean;
}) {
  const { data, isPending } = useNotebookTree();
  const [selected, setSelected] = useState<NotebookId | typeof UNFILED>(UNFILED);

  const nodes = data ? flattenTree(data) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {isPending ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)
          ) : (
            <>
              {allowUnfiled && (
                <PickerRow
                  label="Unfiled"
                  depth={0}
                  selected={selected === UNFILED}
                  onSelect={() => setSelected(UNFILED)}
                />
              )}
              {nodes.map((node) => (
                <PickerRow
                  key={node.id}
                  label={node.name}
                  depth={node.depth + 1}
                  noteCount={node.totalNoteCount}
                  selected={selected === node.id}
                  onSelect={() => setSelected(node.id)}
                />
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(selected === UNFILED ? null : selected);
              onOpenChange(false);
            }}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function PickerRow({
  label,
  depth,
  noteCount,
  selected,
  onSelect,
}: {
  label: string;
  depth: number;
  noteCount?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onSelect}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      className={cn(
        "h-8 w-full justify-start gap-2 text-sm font-normal",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      {selected ? (
        <Check className="size-4 shrink-0" />
      ) : (
        <ChevronRight className="size-4 shrink-0 opacity-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {noteCount !== undefined && noteCount > 0 && (
        <span className="text-xs tabular-nums opacity-60">{noteCount}</span>
      )}
    </Button>
  );
}

/** Small trigger used inside dropdown menus and empty states. */
export function MoveToButton({
  label = "Move to…",
  onClick,
  disabled,
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2"
      onClick={onClick}
      disabled={disabled}
    >
      <FolderInput className="size-4" />
      {label}
    </Button>
  );
}

export { pluralize };
