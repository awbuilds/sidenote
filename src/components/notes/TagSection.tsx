"use client";

import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTagSummaries } from "@/hooks/useTags";
import { useWorkspaceParams } from "@/hooks/useWorkspaceParams";
import { pluralize } from "@/lib/format";
import { tagDotClass } from "@/lib/tag-color";
import { TagManagerDialog } from "./TagManagerDialog";

/**
 * Tag filter.
 *
 * Selecting a tag sets `?tag=`, which the note list reads. It composes with a
 * notebook selection rather than replacing it, so you can narrow to one tag
 * inside one notebook. The stored color is rendered here and editable from the
 * manager dialog.
 */
export function TagSection() {
  const { params, setParam, clearNotebook } = useWorkspaceParams();
  const { data, isPending } = useTagSummaries();
  const [manageOpen, setManageOpen] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-1 px-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  const tags = data ?? [];
  if (tags.length === 0) return null;

  const clear = () => setParam("tag", null);

  return (
    <>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1 px-2">
          <p className="flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tags
          </p>
          {params.tagId !== null && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              aria-label="Clear tag filter"
              onClick={clear}
            >
              <X className="size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            aria-label="Manage tags"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="size-3" />
          </Button>
        </div>

        {tags.map((tag) => {
          const active = params.tagId === tag.id;
          return (
            <Button
              key={tag.id}
              variant="ghost"
              size="sm"
              aria-pressed={active}
              onClick={() => {
                if (active) {
                  clear();
                  return;
                }
                setParam("tag", tag.id);
                // Moving to a tag view from a notebook view should widen the
                // scope, so drop the notebook and show the note list.
                clearNotebook();
              }}
              className={cn(
                "h-7 w-full justify-start gap-2 px-3 text-sm font-normal",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", tagDotClass(tag.color))} />
              <span className="min-w-0 flex-1 truncate text-left">{tag.name}</span>
              <span className="shrink-0 text-xs tabular-nums opacity-60">{tag.noteCount}</span>
            </Button>
          );
        })}

        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          {pluralize(tags.length, "tag")} in use
        </p>
      </div>

      <TagManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}
