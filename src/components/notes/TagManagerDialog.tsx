"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTagSummaries } from "@/hooks/useTags";
import { useDeleteTag, useRenameTag, useUpdateTagColor } from "@/hooks/mutations";
import { TAG_COLORS, normalizeTagColor, tagDotClass } from "@/lib/tag-color";
import { cn } from "@/lib/utils";

/**
 * Tag management: rename, recolor, delete. The stored `Tag.color` was always a
 * token but nothing rendered it; this dialog is also where it becomes visible.
 */
export function TagManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data } = useTagSummaries();
  const rename = useRenameTag();
  const remove = useDeleteTag();
  const color = useUpdateTagColor();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const tags = data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>
            Rename, recolor or delete tags. Deleting a tag removes it from every
            note that carries it.
          </DialogDescription>
        </DialogHeader>

        {tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {tags.map((tag) => {
              const draft = drafts[tag.id] ?? tag.name;
              return (
                <li key={tag.id} className="rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-3 shrink-0 rounded-full", tagDotClass(tag.color))} />
                    <Input
                      value={draft}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [tag.id]: event.target.value }))
                      }
                      onBlur={() => {
                        const next = draft.trim().toLowerCase();
                        if (next !== "" && next !== tag.name) {
                          rename.mutate({ id: tag.id, name: next });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                      }}
                      aria-label={`Name of ${tag.name}`}
                      className="h-8"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {tag.noteCount}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive"
                      aria-label={`Delete ${tag.name}`}
                      onClick={() =>
                        remove.mutate(tag.id, {
                          onSuccess: () => toast.success("Tag deleted"),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 pl-5">
                    {TAG_COLORS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-label={`Set ${tag.name} to ${option}`}
                        onClick={() => color.mutate({ id: tag.id, color: option })}
                        className={cn(
                          "size-4 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                          tagDotClass(option),
                          normalizeTagColor(tag.color) === option && "ring-2 ring-foreground/60",
                        )}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
