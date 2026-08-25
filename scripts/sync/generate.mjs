// Regenerates the derived docs from code. Run after touching an endpoint, a
// migration, a workflow or a compose variable — then commit the result.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, runChecks, scanTables } from "./lib.mjs";
import { buildApiDoc, buildSchemaDoc } from "./docs.mjs";
import { syncDbTypes } from "./db-types.mjs";

const state = runChecks();
const tables = scanTables();

const written = [
  ["docs/api.md", buildApiDoc(state)],
  ["docs/schema.md", buildSchemaDoc(tables)],
];
for (const [relPath, content] of written) {
  writeFileSync(join(ROOT, relPath), content);
  console.log(`  ✅ ${relPath}`);
}

// Best-effort: refreshes the TypeScript database surface when the project is
// linked and Docker is up; reports why and moves on when it is not.
try {
  const types = syncDbTypes();
  const mark =
    types.status === "skipped" ? "  ⏭ " : `  ${types.status === "updated" ? "✅" : "✅"}`;
  console.log(`${mark} db types: ${types.status} — ${types.detail}`);
} catch (error) {
  console.warn(`  ⏭  db types skipped — ${error.message}`);
}

console.log(
  `\nsynced: ${state.routes.length} endpoints · ${tables.length} tables · ` +
    `${state.workflows.length} workflows`,
);

if (state.problems.length > 0) {
  console.error("\ncross-layer problems:");
  for (const problem of state.problems) console.error(`  ❌ ${problem}`);
  process.exitCode = 1;
}
