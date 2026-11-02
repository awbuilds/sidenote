/**
 * Copy that depends on whether a remote account exists.
 *
 * The app used to be local-only, and a few sentences still say so. Now that
 * sync exists, claiming "nothing is uploaded anywhere" next to a Sync section
 * is worse than stale — it misstates what happens to people's data. These
 * helpers keep the branches in one place, unit-tested.
 */
export type CopyAccountState = "disabled" | "signed-out" | "signed-in";

/** `loading` counts as signed-out: the claim must be safe before we know. */
export function toCopyAccountState(status: "disabled" | "loading" | "signed-in" | "signed-out"): CopyAccountState {
  if (status === "disabled") return "disabled";
  if (status === "signed-in") return "signed-in";
  return "signed-out";
}

export function settingsSubtitle(state: CopyAccountState): string {
  switch (state) {
    case "signed-in":
      return "Your notes are in this browser and synced to your account.";
    case "disabled":
      return "This build has no remote configured — everything stays in this browser.";
    default:
      return "Everything stays in this browser until you sign in. Sync is optional.";
  }
}

export function deleteWarning(state: CopyAccountState): string {
  switch (state) {
    case "signed-in":
      return "Erases all notes, notebooks, tags, attachments and settings from this browser, and removes the synced copies from your account on the next sync. There is no undo.";
    case "disabled":
      return "Erases all notes, notebooks, tags, attachments and settings from this browser. There is no undo and no server copy.";
    default:
      return "Erases everything from this browser. If you have synced before, the copy in your account is removed the next time you sync. There is no undo.";
  }
}

export function backupReminder(state: CopyAccountState): string {
  if (state === "signed-in") {
    return "Export a ZIP too — the one backup that isn't tied to this browser or your account.";
  }
  return "Still export a ZIP backup — this is the only copy that exists.";
}

export function trashWarning(state: CopyAccountState): string {
  switch (state) {
    case "signed-in":
      return "Deleting permanently cannot be undone — the synced copy is removed on the next sync. A ZIP backup is a copy you hold yourself.";
    case "disabled":
      return "Everything here lives only in this browser. Deleting permanently cannot be undone, and a ZIP backup is the only copy outside it.";
    default:
      return "Everything here lives only in this browser until you sign in and sync. Deleting permanently cannot be undone; a ZIP backup is a copy you hold yourself.";
  }
}

export function sampleDataWarning(): string {
  return "This deletes everything currently in this browser and loads the example notes and notebooks. Anything you have written is gone. There is no undo.";
}
