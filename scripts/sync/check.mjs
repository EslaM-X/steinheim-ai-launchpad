// CI mode: rebuild the derived docs in memory and compare against what is
// committed. Any diff means someone changed a layer without running
// `npm run sync`, which is exactly how docs rot in every other repo.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, runChecks, scanTables } from "./lib.mjs";
import { buildApiDoc, buildSchemaDoc } from "./docs.mjs";

const state = runChecks();
let failed = false;

const expected = new Map([
  ["docs/api.md", () => buildApiDoc(state)],
  ["docs/schema.md", () => buildSchemaDoc(scanTables())],
]);

for (const [relPath, build] of expected) {
  const fresh = build();
  const file = join(ROOT, relPath);
  // Normalize CRLF away: a checkout without .gitattributes applied yet must
  // not read as drift. The generator writes LF; that is what we compare.
  const committed = existsSync(file)
    ? readFileSync(file, "utf8").replaceAll("\r\n", "\n")
    : "(missing — run npm run sync)";
  if (committed !== fresh) {
    failed = true;
    console.error(`  ❌ ${relPath} is stale — run \`npm run sync\` and commit`);
  } else {
    console.log(`  ✅ ${relPath} up to date`);
  }
}

if (state.problems.length > 0) {
  failed = true;
  for (const problem of state.problems) console.error(`  ❌ ${problem}`);
}

if (failed) {
  console.error("\nsync check failed — see above");
  process.exit(1);
}
console.log("\nsync check passed");
