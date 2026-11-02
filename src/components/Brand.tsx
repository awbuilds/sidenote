import { cn } from "@/lib/utils";

/**
 * Permanent attribution. Deliberately not dismissible and not a toast — it
 * lives in the app chrome and on every public surface.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] leading-snug text-muted-foreground", className)}>
      Made with{" "}
      <span aria-hidden="true">❤️</span>
      <span className="sr-only">love</span> by{" "}
      <span className="font-medium text-foreground/80">AW Builds</span>
    </p>
  );
}
