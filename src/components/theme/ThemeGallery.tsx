"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";
import { THEME_PACKS, type Theme, type ThemePack } from "@/lib/theme";
import { Button } from "@/components/ui/button";

interface ThemePreviewProps {
  pack: ThemePack;
  dark: boolean;
}

/** A miniature three-pane desk, drawn with the pack's own tokens. */
function ThemePreview({ pack, dark }: ThemePreviewProps) {
  return (
    <div
      data-theme-preview
      data-theme-pack={pack}
      className={cn("overflow-hidden rounded-md border bg-background p-2", dark && "dark")}
      aria-hidden="true"
    >
      <div className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="size-1.5 rounded-full bg-accent" />
        <span className="size-1.5 rounded-full bg-muted" />
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <div className="w-1/4 space-y-1 rounded-sm bg-sidebar p-1">
          <div className="h-1 w-3/4 rounded-sm bg-sidebar-foreground/50" />
          <div className="h-1 w-full rounded-sm bg-sidebar-accent" />
          <div className="h-1 w-2/3 rounded-sm bg-sidebar-foreground/30" />
        </div>
        <div className="flex-1 space-y-1 rounded-sm bg-card p-1">
          <div className="h-1.5 w-1/2 rounded-sm bg-foreground/80" />
          <div className="h-1 w-full rounded-sm bg-muted-foreground/40" />
          <div className="h-1 w-5/6 rounded-sm bg-muted-foreground/30" />
          <div className="mt-1.5 flex gap-1">
            <span className="h-2.5 w-7 rounded-sm bg-primary" />
            <span className="h-2.5 w-5 rounded-sm border bg-secondary" />
          </div>
        </div>
      </div>
    </div>
  );
}

const MODES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="size-3.5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="size-3.5" /> },
  { value: "system", label: "System", icon: <Monitor className="size-3.5" /> },
];

/** Pack gallery plus the light/dark/system switch. */
export function ThemeGallery({ compact = false }: { compact?: boolean }) {
  const { pack, setPack, theme, resolved, setTheme } = useTheme();

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Theme"
        className={cn(
          "grid gap-2",
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {THEME_PACKS.map((option) => {
          const selected = option.id === pack;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPack(option.id)}
              className={cn(
                "rounded-lg border p-2 text-left transition-colors",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <ThemePreview pack={option.id} dark={resolved === "dark"} />
              <span className="mt-1.5 block text-xs font-medium">{option.name}</span>
              <span className="block text-[10px] leading-tight text-muted-foreground">
                {option.blurb}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Appearance</span>
        {MODES.map((mode) => (
          <Button
            key={mode.value}
            type="button"
            size="sm"
            variant={theme === mode.value ? "default" : "outline"}
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setTheme(mode.value)}
          >
            {mode.icon}
            {mode.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
