/**
 * Fail if a public document carries maintainer infrastructure details.
 *
 * The open-source release note claims the public tree has no host paths,
 * private addresses or deployment identifiers. That claim is only true until
 * the next handoff note is written; this makes it a check instead of a habit.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "*.md", "*.yml", "*.html"], {
  encoding: "utf8",
});
const untracked = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "*.md", "*.yml", "*.html"],
  { encoding: "utf8" },
);
const files = [...new Set([...tracked.split("\n"), ...untracked.split("\n")])]
  .map((file) => file.trim())
  .filter(Boolean);

const PATTERNS = [
  { re: /\/opt\/[a-z0-9-]+/i, label: "host filesystem path" },
  { re: /\bprj_[A-Za-z0-9]{8,}/, label: "Vercel project id" },
  { re: /\bdpl_[A-Za-z0-9]{8,}/, label: "Vercel deployment id" },
  { re: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, label: "private IPv4 address" },
  { re: /~\/sidenote-archive/, label: "maintainer archive path" },
];

let failed = false;

for (const file of files) {
  // `git ls-files` still lists a file deleted in the working tree.
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const { re, label } of PATTERNS) {
    if (re.test(text)) {
      console.error(`${file}: ${label}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("Remove internal infrastructure details from the public tree.");
  process.exit(1);
}

console.log(`docs privacy: ${files.length} files clean`);
