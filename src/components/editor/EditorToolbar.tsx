"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Braces,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  ListTodo,
  MessageSquareQuote,
  Minus,
  Redo2,
  Sigma,
  Strikethrough,
  Table as TableIcon,
  TableOfContents,
  Type,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { showImagePicker } from "@/lib/tiptap/image-picker";
import { insertMathBlock } from "@/lib/tiptap/math";
import { CodeLanguagePicker } from "./CodeLanguagePicker";

/**
 * Editor toolbar.
 *
 * Mirrors the block types the document model actually supports. Anything not
 * in the extension set is not offered — a greyed-out button is worse than an
 * absent one.
 */
export function EditorToolbar({
  editor,
  readOnly = false,
  onOpenOutline,
  onLinkNote,
}: {
  editor: Editor;
  readOnly?: boolean;
  onOpenOutline?: () => void;
  onLinkNote?: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        "flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-3 py-1.5",
        readOnly && "pointer-events-none opacity-50",
      )}
    >
      {onOpenOutline !== undefined && (
        <ToolbarButton label="Outline" onClick={onOpenOutline}>
          <TableOfContents className="size-4" />
        </ToolbarButton>
      )}

      <LinkButton editor={editor} />

      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <MessageSquareQuote className="size-4" />
      </ToolbarButton>

      <HeadingButton editor={editor} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="size-4" />
      </ToolbarButton>

      {onLinkNote !== undefined && (
        <ToolbarButton label="Link to a note" onClick={onLinkNote}>
          <Link className="size-4" />
        </ToolbarButton>
      )}

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Task list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListTodo className="size-4" />
      </ToolbarButton>

      <TableButton editor={editor} />

      <ImageButton editor={editor} />

      <CodeLanguagePicker editor={editor} />
      <MathButton editor={editor} />
      <ToolbarButton
        label="Divider"
        active={editor.isActive("horizontalRule")}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="size-4" />
      </ToolbarButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heading                                                            */
/* ------------------------------------------------------------------ */

const HEADINGS = [
  { level: 1 as const, label: "Heading 1", icon: Heading1 },
  { level: 2 as const, label: "Heading 2", icon: Heading2 },
  { level: 3 as const, label: "Heading 3", icon: Heading3 },
];

function HeadingButton({ editor }: { editor: Editor }) {
  // `null` means plain paragraph, so the trigger can label it Text.
  const current: (typeof HEADINGS)[number] | null =
    HEADINGS.find((heading) => editor.isActive("heading", { level: heading.level })) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          aria-label="Block type"
        >
          {current === null ? (
            <>
              <Type className="size-4" />
              <span className="hidden sm:inline">Text</span>
            </>
          ) : (
            <current.icon className="size-4" />
          )}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem
          onSelect={() => editor.chain().focus().setParagraph().run()}
          className={current === null ? "bg-accent" : undefined}
        >
          <Type className="size-4" />
          Text
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {HEADINGS.map((heading) => (
          <DropdownMenuItem
            key={heading.level}
            onSelect={() => editor.chain().focus().toggleHeading({ level: heading.level }).run()}
            className={current?.level === heading.level ? "bg-accent" : undefined}
          >
            <heading.icon className="size-4" />
            {heading.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Link                                                               */
/* ------------------------------------------------------------------ */

function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ open: false, value: "" });
  const active = editor.isActive("link");

  // While the popover is open the field shows what the user typed; otherwise
  // it shows the mark's current href. Deriving that avoids resetting state
  // when the popover opens, which the React Compiler lint rule rejects.
  const current = String(editor.getAttributes("link").href ?? "");
  const href = draft.open === open ? draft.value : current;
  const setHref = (value: string) => setDraft({ open, value });

  const apply = () => {
    const value = href.trim();
    const chain = editor.chain().focus();
    if (value === "") {
      chain.extendMarkRange("link").unsetLink().run();
    } else {
      chain.extendMarkRange("link").setLink({ href: value }).run();
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7", active && "bg-accent text-accent-foreground")}
          aria-label={active ? "Edit link" : "Add link"}
        >
          <Link2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3">
        <Label htmlFor="link-href">Link address</Label>
        <Input
          id="link-href"
          value={href}
          autoFocus
          placeholder="https://example.com"
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" className="flex-1" onClick={apply}>
            Apply
          </Button>
          {active && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remove link"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              <Link2Off className="size-4" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                              */
/* ------------------------------------------------------------------ */

function TableButton({ editor }: { editor: Editor }) {
  const active = editor.isActive("table");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7", active && "bg-accent text-accent-foreground")}
          aria-label="Table"
        >
          <TableIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Table</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableIcon className="size-4" />
          Insert 3×3 table
        </DropdownMenuItem>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().addRowAfter().run()}
            >
              Add row below
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().addColumnAfter().run()}
            >
              Add column right
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
            >
              Toggle header row
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().deleteColumn().run()}
            >
              Delete column
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().deleteRow().run()}>
              Delete row
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => editor.chain().focus().deleteTable().run()}
            >
              Delete table
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Math and image                                                     */
/* ------------------------------------------------------------------ */

function MathButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [latex, setLatex] = useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Insert equation"
        >
          <Sigma className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3">
        <Label htmlFor="math-latex">LaTeX</Label>
        <Input
          id="math-latex"
          value={latex}
          autoFocus
          placeholder="e^{i\\pi} + 1 = 0"
          className="font-mono text-xs"
          onChange={(event) => setLatex(event.target.value)}
        />
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            insertMathBlock(editor, latex);
            setLatex("");
            setOpen(false);
          }}
        >
          <Braces className="size-4" />
          Insert equation
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ImageButton({ editor }: { editor: Editor }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label="Insert image"
      onClick={() => void showImagePicker(editor)}
    >
      <ImageIcon className="size-4" />
    </Button>
  );
}

/* ------------------------------------------------------------------ */

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Toggle
      size="sm"
      aria-label={label}
      title={label}
      pressed={active ?? false}
      onPressedChange={onClick}
      className={cn("size-7", active && "bg-accent text-accent-foreground")}
    >
      {children}
    </Toggle>
  );
}