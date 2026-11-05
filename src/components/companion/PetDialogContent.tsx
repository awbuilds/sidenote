"use client";

import { useRef, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/queries";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  COMPANION_DIALOG_LINES,
  DEFAULT_COMPANION,
  type CompanionDialogMode,
  type CompanionId,
} from "@/lib/companion";
import { PetStage } from "./PetStage";
import { useCompanionQuote } from "./use-companion-quote";

export interface PetDialogContentProps
  extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "children"> {
  /** Which set of lines the pet speaks for this dialog. */
  mode: CompanionDialogMode;
  children: ReactNode;
  /** Card width, e.g. `sm:max-w-md`. Also the fallback content width. */
  className?: string;
  /** Width/position overrides for the standard `DialogContent` fallback. */
  fallbackClassName?: string;
  showCloseButton?: boolean;
}

interface PetDialogContentViewProps extends PetDialogContentProps {
  petId: CompanionId;
  petEnabled: boolean;
  reducedMotion: boolean;
}

/**
 * A non-alert dialog presented by the companion.
 *
 * Used inside an existing `<Dialog>` root. The children are the dialog's own
 * header, body and footer; the pet only adds the stage, the quote line and a
 * close button. When the companion is off, this renders the standard
 * `DialogContent` unchanged.
 */
export function PetDialogContent(props: PetDialogContentProps) {
  const { data: settings } = useSettings();
  const reduced = useReducedMotion();

  return (
    <PetDialogContentView
      {...props}
      petId={settings?.companionId ?? DEFAULT_COMPANION}
      petEnabled={settings?.companionEnabled === true}
      reducedMotion={reduced}
    />
  );
}

export function PetDialogContentView({
  mode,
  children,
  className,
  fallbackClassName,
  showCloseButton = true,
  petId,
  petEnabled,
  reducedMotion,
  ...contentProps
}: PetDialogContentViewProps) {
  const lines = COMPANION_DIALOG_LINES[petId][mode];
  const { quote, pet, hopKey } = useCompanionQuote(lines);
  const contentRef = useRef<HTMLDivElement | null>(null);

  if (!petEnabled) {
    return (
      <DialogContent
        className={fallbackClassName ?? className}
        showCloseButton={showCloseButton}
        {...contentProps}
      >
        {children}
      </DialogContent>
    );
  }

  const close = showCloseButton ? (
    <DialogPrimitive.Close asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-3 right-3 z-10"
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </DialogPrimitive.Close>
  ) : null;

  return (
    <DialogPortal>
      <DialogOverlay className="bg-black/25" />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="pet-dialog-content"
        className="pet-dialog-content"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLElement>(
              'input:not([type="hidden"]), textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])',
            )
            ?.focus();
        }}
        {...contentProps}
      >
        <PetStage
          petId={petId}
          quote={quote}
          hopKey={hopKey}
          reaction="idle"
          onPet={pet}
          reducedMotion={reducedMotion}
          close={close}
          cardClassName={className}
        >
          {children}
        </PetStage>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
