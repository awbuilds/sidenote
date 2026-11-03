"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/queries";
import { useUpdateSettings } from "@/hooks/mutations";
import { DEFAULT_COMPANION } from "@/lib/companion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { CompanionPicker } from "./CompanionPicker";
import { CompanionPet } from "./CompanionPet";

/** Settings card for the optional companion. */
export function CompanionSection() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const reduced = useReducedMotion();
  const companionId = settings?.companionId ?? DEFAULT_COMPANION;
  const enabled = settings?.companionEnabled ?? false;

  return (
    <section className="mt-4 space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CompanionPet
            id={companionId}
            avatarClassName="size-8"
            buttonClassName="p-1"
            bubbleAlign="start"
          />
          <div>
            <h2 className="text-sm font-medium">Companion</h2>
            <p className="text-xs text-muted-foreground">
              A small pet that crosses the screen once a session. Purely decorative.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="companion-enabled" className="text-xs text-muted-foreground">
            {enabled ? "On" : "Off"}
          </Label>
          <Switch
            id="companion-enabled"
            checked={enabled}
            onCheckedChange={(checked) => update.mutate({ companionEnabled: checked })}
          />
        </div>
      </div>

      {reduced && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Your system asks for reduced motion, so the companion stays still here.
        </p>
      )}

      <CompanionPicker
        value={companionId}
        onChange={(id) => update.mutate({ companionId: id })}
      />
    </section>
  );
}
