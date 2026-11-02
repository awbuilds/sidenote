/**
 * Share-link expiry choices.
 *
 * A public link must always expire, and never more than 30 days after it was
 * created. The database enforces the same rule in `create_share` and with a
 * check constraint; this list is only the honest UI for it. There is
 * deliberately no "never".
 */
export const SHARE_EXPIRY_MAX_DAYS = 30;

export interface ShareExpiryOption {
  value: string;
  label: string;
  durationMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SHARE_EXPIRY_OPTIONS: ShareExpiryOption[] = [
  { value: "1d", label: "In 24 hours", durationMs: DAY_MS },
  { value: "7d", label: "In 7 days", durationMs: 7 * DAY_MS },
  { value: "30d", label: "In 30 days", durationMs: SHARE_EXPIRY_MAX_DAYS * DAY_MS },
];

export const DEFAULT_SHARE_EXPIRY = "7d";
