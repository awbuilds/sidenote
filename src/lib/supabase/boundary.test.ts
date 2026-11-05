import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * UI code must not pull in the Supabase client module.
 *
 * `client.ts` dynamic-imports `@supabase/supabase-js`; importing it from a
 * component (even for the tiny `isRemoteEnabled` re-export that used to live
 * there) puts the module in the page graph and, in dev, can surface as
 * "module factory is not available" after an HMR/cache mismatch. UI code that
 * only asks whether sync exists imports from `config.ts`.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("Supabase client boundary", () => {
  it("is not imported by components or routes", () => {
    const offenders = [...walk("src/components"), ...walk("src/app")].filter((file) =>
      fs.readFileSync(file, "utf8").includes("@/lib/supabase/client"),
    );
    expect(offenders).toEqual([]);
  });
});
