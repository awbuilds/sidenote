"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { companionName, type CompanionId } from "@/lib/companion";
import { CompanionAvatar } from "./CompanionAvatar";

export type PetReaction = "idle" | "confirm" | "cancel";

interface PetStageProps {
  petId: CompanionId;
  quote: string;
  hopKey: number;
  reaction: PetReaction;
  onPet: () => void;
  reducedMotion: boolean;
  disabled?: boolean;
  /** A `DialogPrimitive.Close` button for non-alert dialogs. */
  close?: ReactNode;
  /** Width/padding for the dialog card, e.g. `sm:max-w-md`. */
  cardClassName?: string;
  children: ReactNode;
}

/**
 * The pet's stage and the speech-bubble card.
 *
 * The card is the dialog: its children are the real title, description and
 * controls. The quote is decorative and `aria-hidden`; the pet button is
 * labelled, so screen-reader users are not read a second version of the
 * warning.
 */
export function PetStage({
  petId,
  quote,
  hopKey,
  reaction,
  onPet,
  reducedMotion,
  disabled = false,
  close,
  cardClassName,
  children,
}: PetStageProps) {
  const name = companionName(petId);

  return (
    <div className="pet-stage">
      <div className="pet-stage-bubble">
        <div className={cn("pet-stage-card w-full", cardClassName)}>
          <p className="pet-stage-quote" aria-hidden="true">
            <span className="font-medium">{name}</span> says: “{quote}”
          </p>
          {children}
        </div>
        {close}
      </div>

      <div className="pet-stage-pet" data-reaction={reaction}>
        <button
          type="button"
          onClick={onPet}
          onMouseDown={(event) => event.preventDefault()}
          disabled={disabled}
          aria-label={`Pet ${name}`}
          title={`Pet ${name}`}
          className="companion-pet pet-stage-pet-button"
        >
          <span
            key={hopKey}
            className={cn("pet-stage-hop", !reducedMotion && "companion-hop")}
          >
            <span className="pet-stage-avatar">
              <CompanionAvatar id={petId} className="size-24 drop-shadow-md sm:size-28" />
            </span>
          </span>
        </button>
        <span className="pet-stage-platform" aria-hidden="true" />
      </div>
    </div>
  );
}
