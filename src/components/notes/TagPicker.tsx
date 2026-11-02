"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tagsForNote } from "@/lib/db/repositories/tags";
import { listTags } from "@/lib/db/repositories/tags";
import { useSetNoteTags } from "@/hooks/mutations";
import { QUERY_KEYS } from "@/hooks/query-keys";
import type { NoteId, Tag } from "@/lib/db/types";

export function TagPicker({ noteId }: { noteId: NoteId }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const setTags = useSetNoteTags();

  const { data: attached } = useQuery({
    queryKey: [...QUERY_KEYS.note(noteId), "tags"],
    queryFn: () => tagsForNote(noteId),
  });
  const { data: all } = useQuery({
    queryKey: [...QUERY_KEYS.note(noteId), "all-tags"],
    queryFn: listTags,
  });

  const current = attached ?? [];
  const currentNames = new Set(current.map((tag) => tag.name));

  const apply = (next: string[]) => setTags.mutate({ noteId, names: next });

  const add = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (normalized === "" || currentNames.has(normalized)) return;
    apply([...current.map((t) => t.name), normalized]);
    setDraft("");
  };

  const remove = (name: string) => apply(current.map((t) => t.name).filter((n) => n !== name));

  const suggestions = (all ?? []).filter((tag) => !currentNames.has(tag.name));

  return (
    <div className="flex items-center gap-1">
      {current.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
          {tag.name}
          <button
            type="button"
            onClick={() => remove(tag.name)}
            aria-label={`Remove tag ${tag.name}`}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Add tags"
            onClick={() => setOpen((value) => !value)}
          >
            <Plus className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <Input
            value={draft}
            autoFocus
            placeholder="Tag name…"
            aria-label="New tag"
            className="h-8"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              }
            }}
          />
          {suggestions.length > 0 && (
            <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
              {suggestions.map((tag: Tag) => (
                <Button
                  key={tag.id}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start text-xs font-normal"
                  onClick={() => add(tag.name)}
                >
                  {tag.name}
                </Button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
