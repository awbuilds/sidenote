# Unreleased — companion-hosted dialogs

- **Date:** 2026-11-03
- **Branch:** `0.0.3` (unreleased)
- **Status:** implemented and verified locally; pushed for review

## Why

The companion was decorative: a button in the sidebar and a once-per-session
run. The point of a pet is to be present at the moments that need a little
warmth, and confirmation dialogs were still generic centered cards. This pass
makes the pet the presenter of every dialog, not just a mascot beside one.

## What changed

### Confirmation dialogs

`src/components/companion/PetAlertDialog.tsx` wraps the existing Radix
`AlertDialog` primitives in a bottom stage. The pet enters, the dialog card is
its speech bubble, and the formal title, description and options are unchanged.
The wrapper owns closing: `onConfirm` runs immediately, the pet nods, and the
dialog closes after the reaction. Cancel gives a relieved hop. Escape and
overlay close immediately. When the companion is off, the standard alert
content is rendered instead.

The seven call sites now use it:

- empty trash and purge a note (`src/app/trash/page.tsx`);
- move a note to trash from the editor (`src/components/layout/EditorPane.tsx`);
- move selected notes to trash (`src/components/notes/NoteListPane.tsx`);
- restore a ZIP (`src/components/settings/BackupSection.tsx`);
- delete all data (`src/components/settings/DeleteSection.tsx`);
- restore sample data (`src/components/settings/SampleDataSection.tsx`).

### Utility dialogs

`src/components/companion/PetDialogContent.tsx` is the non-alert equivalent. It
keeps each dialog's own header, body and footer, adds the stage, a quote line
and a close button, and focuses the first control in the body on open. It
falls back to the standard `DialogContent` when the companion is off.

The five utility dialogs now use it:

- `src/components/share/ShareDialog.tsx` (`share`);
- `src/components/editor/LinkNoteDialog.tsx` (`link`);
- `src/components/notebooks/NotebookPickerDialog.tsx` (`pick`);
- `src/components/notes/TagManagerDialog.tsx` (`tags`);
- `src/components/layout/CommandPalette.tsx` (`command`).

### Shared pieces

- `src/components/companion/PetStage.tsx` — the stage, speech-bubble card,
  pet button, platform, quote and reaction classes. The pet button prevents
  mouse-down focus so a command-palette input keeps focus.
- `src/components/companion/use-companion-quote.ts` — quote index, hint and
  hop state.
- `src/lib/companion.ts` — `CompanionDialogMode`, per-pet/per-mode lines and
  the alert hints. The lines are decorative; the dialog copy remains
  authoritative.
- `src/app/globals.css` — the stage layout, tail, entrance, nod and relieved
  animations, and a reduced-motion override.
- `src/lib/db/types.ts`, `CompanionSection`, the onboarding tour, the README
  and the website copy now say the pet presents dialogs, not that it is purely
  decorative.

## Behaviour and accessibility

- `role="alertdialog"`/`role="dialog"`, focus trapping, Escape and the
  labelled/described content are preserved.
- Confirmations focus **Cancel** first; utility dialogs focus the first body
  control (command input, search field, tag input, notebook button).
- The quote line is `aria-hidden`; the pet button is labelled; the formal
  warning is not duplicated in the accessibility tree.
- Companion off: the original centered dialog, no delay.
- Reduced motion: the stage still appears, but the entrance/reaction
  animations and the close delay are skipped.
- Mobile: the card stacks above the pet, the stage respects the safe-area
  inset, and the card scrolls within the viewport.
- No new dependencies, storage, schema changes or network requests.

## Verification

- `PetAlertDialog.test.tsx` and `PetDialogContent.test.tsx` cover the options,
  initial focus, pet lines, hover hints, confirm/cancel, Escape, reduced motion
  and the companion-off fallback.
- `src/lib/companion.test.ts` checks every pet has a line for every mode.
- Dev-server checks: delete-all, empty-trash, purge, editor move-to-trash,
  tags, link note, notebook picker, command palette; companion off; reduced
  motion; 390 px and 1440 px; light and dark.
- Gates: `typecheck`, `test`, `lint`, `build`, `check:docs`.

## Not done

- The share dialog was not exercised against a live Supabase backend (the
  hosted build is local-only); it uses the same `PetDialogContent` wrapper as
  the other utility dialogs.
- The dialog stage is bottom-anchored. If the pet should instead present a
  centered card, that is a CSS-only adjustment.
