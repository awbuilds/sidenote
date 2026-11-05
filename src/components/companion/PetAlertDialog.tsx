"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/queries";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  COMPANION_DIALOG_HINTS,
  COMPANION_DIALOG_LINES,
  DEFAULT_COMPANION,
  type CompanionDialogTone,
  type CompanionId,
} from "@/lib/companion";
import { PetStage } from "./PetStage";
import { useCompanionQuote } from "./use-companion-quote";

export const PET_CONFIRM_CLOSE_MS = 220;
export const PET_CANCEL_CLOSE_MS = 140;

export interface PetAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  tone?: CompanionDialogTone;
}

interface PetAlertDialogViewProps extends PetAlertDialogProps {
  petId: CompanionId;
  petEnabled: boolean;
  reducedMotion: boolean;
}

/**
 * The companion presents a confirmation.
 *
 * The wrapper owns closing: `onConfirm` runs immediately, the pet reacts, and
 * the dialog closes after the reaction. Call sites must not close themselves
 * inside `onConfirm`, or the reaction is cut short.
 */
export function PetAlertDialog(props: PetAlertDialogProps) {
  const { data: settings } = useSettings();
  const reduced = useReducedMotion();

  return (
    <PetAlertDialogView
      {...props}
      petId={settings?.companionId ?? DEFAULT_COMPANION}
      petEnabled={settings?.companionEnabled === true}
      reducedMotion={reduced}
    />
  );
}

export function PetAlertDialogView({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmVariant = "default",
  tone = "danger",
  petId,
  petEnabled,
  reducedMotion,
}: PetAlertDialogViewProps) {
  const lines = COMPANION_DIALOG_LINES[petId][tone];
  const { quote, setHint, pet, hopKey } = useCompanionQuote(lines);
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState<"idle" | "confirm" | "cancel">("idle");
  const timer = useRef<number | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!petEnabled) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const closeAfter = (ms: number) => {
    if (reducedMotion) {
      onOpenChange(false);
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onOpenChange(false), ms);
  };

  const confirm = () => {
    if (busy) return;
    setBusy(true);
    setReaction("confirm");
    try {
      onConfirm();
    } finally {
      closeAfter(PET_CONFIRM_CLOSE_MS);
    }
  };

  const cancel = () => {
    if (busy) return;
    setBusy(true);
    setReaction("cancel");
    closeAfter(PET_CANCEL_CLOSE_MS);
  };

  const confirmHint = COMPANION_DIALOG_HINTS[tone];
  const cancelHint = COMPANION_DIALOG_HINTS.cancel;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPortal>
        <AlertDialogOverlay className="bg-black/25" />
        <AlertDialogPrimitive.Content
          data-slot="pet-alert-dialog-content"
          className="pet-dialog-content"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <PetStage
            petId={petId}
            quote={quote}
            hopKey={hopKey}
            reaction={reaction}
            onPet={pet}
            reducedMotion={reducedMotion}
            disabled={busy}
            cardClassName="sm:w-[28rem]"
          >
            <div className="space-y-1.5">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                ref={cancelRef}
                variant="outline"
                disabled={busy}
                onClick={cancel}
                onPointerEnter={() => setHint(cancelHint)}
                onPointerLeave={() => setHint(null)}
                onFocus={() => setHint(cancelHint)}
                onBlur={() => setHint(null)}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={confirmVariant}
                disabled={busy}
                onClick={confirm}
                onPointerEnter={() => setHint(confirmHint)}
                onPointerLeave={() => setHint(null)}
                onFocus={() => setHint(confirmHint)}
                onBlur={() => setHint(null)}
              >
                {confirmLabel}
              </Button>
            </div>
          </PetStage>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
