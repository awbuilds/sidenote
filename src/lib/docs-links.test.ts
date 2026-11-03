import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Local links in the docs and website must resolve.
 *
 * External URLs are deliberately not fetched here — that would make the suite
 * depend on the network. Relative paths, assets and cross-document links are
 * the ones that break when a file is moved, and those are checked.
 */

const ROOT = process.cwd();
const SKIP_PREFIXES = ["http:", "https:", "mailto:", "tel:", "#", "data:", "javascript:"];

function walk(dir: string, match: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, match));
    else if (match(full)) out.push(full);
  }
  return out;
}

function targetsIn(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const targets: string[] = [];

  if (file.endsWith(".md")) {
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      targets.push(match[1]);
    }
    for (const match of text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) {
      targets.push(match[1]);
    }
  } else {
    for (const match of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
      targets.push(match[1]);
    }
  }

  return targets;
}

function isLocal(target: string): boolean {
  const value = target.trim().replace(/^<|>$/g, "");
  if (value === "" || value.startsWith("//")) return false;
  if (SKIP_PREFIXES.some((prefix) => value.startsWith(prefix))) return false;
  // Root-relative paths are app/site routes, not files in this repository.
  return !value.startsWith("/");
}

describe("local links", () => {
  it("resolve in the README, docs and website", () => {
    const files = [
      ...walk(ROOT, (file) => file.endsWith(".md")),
      ...walk(path.join(ROOT, "website"), (file) => file.endsWith(".html")),
    ];

    const failures: string[] = [];
    for (const file of files) {
      const dir = path.dirname(file);
      for (const raw of targetsIn(file)) {
        if (!isLocal(raw)) continue;
        const clean = raw.split("#")[0].split("?")[0];
        if (clean === "") continue;
        const candidates = [path.resolve(dir, clean), path.resolve(ROOT, clean)];
        if (!candidates.some((candidate) => fs.existsSync(candidate))) {
          failures.push(`${path.relative(ROOT, file)} -> ${raw}`);
        }
      }
    }

    expect(failures, `broken local links:\n${failures.join("\n")}`).toEqual([]);
  });
});
