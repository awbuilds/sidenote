"use client";

import { useEffect, useState } from "react";
import { Check, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Editor } from "@tiptap/react";

/**
 * Code block language.
 *
 * The language is a real attribute on the code block, so it survives a Markdown
 * round trip as a fenced block and lands in a ZIP backup and an HTML export.
 * That is worth having on its own — it is what tells a reader what a snippet is.
 *
 * There is deliberately no syntax highlighting. Highlighting needs
 * `@tiptap/extension-code-block-lowlight` in place of StarterKit's bundled
 * code block, and registering both throws a duplicate-extension error. Swapping
 * a working extension to add colour to a local-first notes app is a bad trade,
 * so the control sets the language and nothing pretends to colour it.
 */

export const CODE_LANGUAGES = [
  { id: "", label: "Plain text" },
  { id: "bash", label: "Bash" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "go", label: "Go" },
  { id: "graphql", label: "GraphQL" },
  { id: "html", label: "HTML" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "kotlin", label: "Kotlin" },
  { id: "markdown", label: "Markdown" },
  { id: "mermaid", label: "Mermaid" },
  { id: "python", label: "Python" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "shell", label: "Shell" },
  { id: "sql", label: "SQL" },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "typescript", label: "TypeScript" },
  { id: "xml", label: "XML" },
  { id: "yaml", label: "YAML" },
] as const;

export function languageLabel(id: string): string {
  if (id === "") return "Plain text";
  return CODE_LANGUAGES.find((language) => language.id === id)?.label ?? id;
}

/**
 * The language dropdown.
 *
 * Renders nothing unless the caret is in a code block — a control that only
 * sometimes applies is worse than one that is always there and says so.
 */
export function CodeLanguagePicker({ editor }: { editor: Editor }) {
  const [language, setLanguage] = useState("");

  // The caret can move in and out of a code block without the component
  // unmounting, so the active language is tracked rather than assumed.
  useEffect(() => {
    const sync = () => {
      const current = editor.getAttributes("codeBlock").language;
      setLanguage(typeof current === "string" ? current : "");
    };

    sync();
    editor.on("update", sync);
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("update", sync);
      editor.off("selectionUpdate", sync);
    };
  }, [editor]);

  if (!editor.isActive("codeBlock")) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 max-w-36 gap-1.5 px-2 text-xs"
          aria-label="Code language"
        >
          <Code2 className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{languageLabel(language)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-44 overflow-y-auto">
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CODE_LANGUAGES.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            onSelect={() =>
              editor.chain().focus().updateAttributes("codeBlock", { language: entry.id }).run()
            }
          >
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.id === language && <Check className="size-3.5 opacity-70" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
