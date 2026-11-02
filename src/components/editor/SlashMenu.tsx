"use client";

import { useCallback, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Braces,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
  Type,
} from "lucide-react";
import { filterCommands, slashMatchAt, type SlashCommand } from "@/lib/tiptap/slash";
import { insertMathBlock } from "@/lib/tiptap/math";
import { cn } from "@/lib/utils";

/**
 * Slash command menu.
 *
 * Opened by typing `/` at the start of a block, filtered as you keep typing.
 * The trigger text is deleted when a command runs and left alone if the menu is
 * dismissed, so an abandoned `/` never ends up in the note.
 *
 * Positioned with CSS rather than measured against the caret: a menu that
 * appears in the wrong place is a bug, and a menu that measures the caret on
 * every keystroke is a jank source. Anchoring below the current block is stable
 * and predictable.
 */

interface Command extends SlashCommand {
  icon: React.ReactNode;
  run: (editor: Editor) => void;
}

function buildCommands(): Command[] {
  return [
    {
      id: "text",
      title: "Text",
      keywords: ["paragraph", "body", "plain"],
      hint: "Plain paragraph",
      icon: <Type className="size-4" />,
      run: (editor) => editor.chain().focus().setParagraph().run(),
    },
    {
      id: "h1",
      title: "Heading 1",
      keywords: ["title", "h1", "big"],
      hint: "Large section",
      icon: <Heading1 className="size-4" />,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: "h2",
      title: "Heading 2",
      keywords: ["subtitle", "h2", "medium"],
      hint: "Medium section",
      icon: <Heading2 className="size-4" />,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "h3",
      title: "Heading 3",
      keywords: ["h3", "small"],
      hint: "Small section",
      icon: <Heading3 className="size-4" />,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      id: "bullets",
      title: "Bullet list",
      keywords: ["ul", "unordered", "list", "points"],
      hint: "Unordered list",
      icon: <List className="size-4" />,
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: "numbers",
      title: "Numbered list",
      keywords: ["ol", "ordered", "list", "steps"],
      hint: "Ordered list",
      icon: <ListOrdered className="size-4" />,
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "tasks",
      title: "Task list",
      keywords: ["todo", "checkbox", "checklist", "tasks"],
      hint: "Checkable items",
      icon: <CheckSquare className="size-4" />,
      run: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      id: "quote",
      title: "Quote",
      keywords: ["blockquote", "citation"],
      hint: "Set apart",
      icon: <Quote className="size-4" />,
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "code",
      title: "Code block",
      keywords: ["pre", "snippet", "monospace"],
      hint: "Preformatted",
      icon: <Braces className="size-4" />,
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      id: "table",
      title: "Table",
      keywords: ["grid", "rows", "columns"],
      hint: "3×3 with a header row",
      icon: <TableIcon className="size-4" />,
      run: (editor) =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: "math",
      title: "Equation",
      keywords: ["latex", "katex", "formula", "sigma"],
      hint: "LaTeX, starting empty",
      icon: <Braces className="size-4" />,
      run: (editor) => insertMathBlock(editor, "x^2"),
    },
    {
      id: "divider",
      title: "Divider",
      keywords: ["hr", "rule", "separator", "line"],
      hint: "Horizontal rule",
      icon: <Minus className="size-4" />,
      run: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
  ];
}

const COMMANDS = buildCommands();

export function SlashMenu({ editor }: { editor: Editor | null }) {
  const [highlight, setHighlight] = useState(0);

  // TipTap's own subscription, rather than an effect that sets state: the
  // selector re-runs on every document and selection change, and a non-collapsed
  // selection is not a command being typed.
  const match = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (instance === null) return null;
      const { selection } = instance.state;
      if (!selection.empty) return null;
      return slashMatchAt(instance.state, selection.from);
    },
  });

  const close = useCallback(() => {
    setHighlight(0);
  }, []);

  // Keep the highlight inside the filtered list as the query narrows.
  const matches = match === null ? [] : filterCommands(COMMANDS, match.query);
  const active = Math.min(highlight, Math.max(matches.length - 1, 0));

  if (match === null) return null;

  const query = match.query;
  const range = { from: match.from, to: match.to };

  const choose = (command: Command) => {
    if (editor === null) return;
    // Delete the `/query` first: the command operates on the block the trigger
    // was typed in, and the trigger text must not survive into the note.
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .run();
    command.run(editor);
    close();
  };

  if (matches.length === 0) {
    return (
      <div className="flex w-72 flex-col rounded-md border bg-popover p-3 text-sm shadow-md">
        <p className="text-muted-foreground">
          No block matches “{query}”. Keep typing, or press Escape to leave the
          text as it is.
        </p>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Insert block"
      className="flex max-h-72 w-72 flex-col overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
      // A menu that handles keys here would swallow typing; the editor keeps
      // focus so the query continues to filter.
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setHighlight((value) => (value + 1) % matches.length);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setHighlight((value) => (value - 1 + matches.length) % matches.length);
        } else if (event.key === "Enter") {
          event.preventDefault();
          const command = matches[active];
          if (command !== undefined) choose(command);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      {matches.map((command, index) => (
        <button
          key={command.id}
          type="button"
          role="option"
          aria-selected={index === active}
          className={cn(
            "flex items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm",
            index === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
          )}
          // `mousedown` rather than `click`: a click would blur the editor first
          // and the selection would already be gone.
          onMouseDown={(event) => {
            event.preventDefault();
            choose(command);
          }}
          onMouseEnter={() => setHighlight(index)}
        >
          <span className="shrink-0 opacity-70">{command.icon}</span>
          <span className="min-w-0 flex-1 truncate">{command.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{command.hint}</span>
        </button>
      ))}
    </div>
  );
}
