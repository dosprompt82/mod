/**
 * npm run content:build — validates every show under content/, runs the spoiler audit,
 * and writes compiled content_items to .content-build/<slug>.json (Postgres load comes later).
 * A failed audit exits non-zero. There is no override flag.
 */
import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { audit, compile, type ShowContent } from "../src/spoiler";

const root = join(import.meta.dirname, "..");
let failed = false;
for (const slug of readdirSync(join(root, "content"))) {
  const file = join(root, "content", slug, "index.ts");
  if (!existsSync(file)) continue;
  const c = (await import(pathToFileURL(file).href)).default as ShowContent;
  const findings = audit(c);
  if (findings.length) {
    failed = true;
    console.error(`✗ ${slug}: ${findings.length} audit finding(s)`);
    for (const f of findings) console.error(`  [${f.check}] ${f.itemId}: ${f.message}`);
    continue;
  }
  const items = compile(c);
  const published = items.filter((i) => i.status === "published").length;
  mkdirSync(join(root, ".content-build"), { recursive: true });
  writeFileSync(join(root, ".content-build", `${slug}.json`), JSON.stringify(items, null, 2));
  console.log(`✓ ${slug}: audit clean; ${items.length} items (${published} published, ${items.length - published} unpublished)`);
  const unverifiedRules = c.spoilerRules.filter((r) => !r.verified).length;
  if (unverifiedRules) console.log(`  note: ${unverifiedRules} spoiler rule(s) awaiting reviewer verification`);
}
process.exit(failed ? 1 : 0);
