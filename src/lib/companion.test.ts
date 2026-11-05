import { describe, expect, it } from "vitest";
import {
  COMPANIONS,
  COMPANION_DIALOG_HINTS,
  COMPANION_DIALOG_LINES,
  type CompanionDialogMode,
} from "./companion";

const MODES: CompanionDialogMode[] = [
  "danger",
  "warning",
  "restore",
  "share",
  "link",
  "pick",
  "tags",
  "command",
];

describe("companion dialog copy", () => {
  for (const companion of COMPANIONS) {
    for (const mode of MODES) {
      it(`${companion.id}/${mode} has at least one line`, () => {
        expect(COMPANION_DIALOG_LINES[companion.id][mode].length).toBeGreaterThan(0);
      });
    }
  }

  it("has a hint for cancel and every alert tone", () => {
    expect(COMPANION_DIALOG_HINTS.cancel).toBeTruthy();
    expect(COMPANION_DIALOG_HINTS.danger).toBeTruthy();
    expect(COMPANION_DIALOG_HINTS.warning).toBeTruthy();
    expect(COMPANION_DIALOG_HINTS.restore).toBeTruthy();
  });
});
