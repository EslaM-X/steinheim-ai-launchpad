// Regenerates src/integrations/supabase/types.ts from the linked Supabase
// project. This closes the last manual-sync loop: a migration lands, the next
// `npm run sync` re-reads the real database and the TypeScript surface follows.
//
// Needs three things; skips gracefully when any is missing (CI has none of
// them, and sync:check must stay DB-free):
//   1. a linked project  → supabase/.temp/project-ref
//   2. an access token   → $SUPABASE_ACCESS_TOKEN or .supabase-access-token
//   3. the CLI binary    → tools/supabase/supabase.exe, installed by
//                          scripts/sb.ps1 on first use

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";

const TYPES_FILE = "src/integrations/supabase/types.ts";
// Keep in lockstep with scripts/sb.ps1 — same binary, same reason: the
// official release exe runs where the npm-installed one is policy-blocked.
const CLI_VERSION = "2.115.0";

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const file = join(ROOT, ".supabase-access-token");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "";
}

function cliPath() {
  const local = join(ROOT, "tools", "supabase", "supabase.exe");
  if (existsSync(local)) return local;
  return null; // PATH lookup is unreliable here; sb.ps1 installs it locally
}

export function linkedProjectRef() {
  const refFile = join(ROOT, "supabase", ".temp", "project-ref");
  if (existsSync(refFile)) {
    const ref = readFileSync(refFile, "utf8").trim();
    if (ref) return ref;
  }
  return process.env.SUPABASE_PROJECT_REF ?? "";
}

/**
 * Returns { status, detail } — status is "updated" | "unchanged" | "skipped".
 * Never throws for environmental reasons: a laptop offline at a café must not
 * turn `npm run sync` into a failure.
 */
export function syncDbTypes() {
  const ref = linkedProjectRef();
  if (!ref) {
    return { status: "skipped", detail: "no linked Supabase project (run scripts/sb.ps1 link)" };
  }
  const token = accessToken();
  if (!token) {
    return { status: "skipped", detail: "no SUPABASE_ACCESS_TOKEN" };
  }
  const cli = cliPath();
  if (!cli) {
    return { status: "skipped", detail: "no CLI — run scripts/sb.ps1 once to install it" };
  }

  let generated;
  try {
    generated = execFileSync(
      cli,
      ["gen", "types", "typescript", "--linked", "--schema", "public"],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
      },
    );
  } catch (error) {
    const reason = String(error.stderr ?? error.message)
      .split("\n")[0]
      .slice(0, 200);
    return { status: "skipped", detail: `generation failed: ${reason}` };
  }

  const target = join(ROOT, TYPES_FILE);
  // CRLF-insensitive compare: the committed file may predate .gitattributes.
  const current = existsSync(target) ? readFileSync(target, "utf8").replaceAll("\r\n", "\n") : "";
  if (generated.replaceAll("\r\n", "\n") === current) {
    return { status: "unchanged", detail: `${TYPES_FILE} matches the database` };
  }
  writeFileSync(target, generated);
  return { status: "updated", detail: TYPES_FILE };
}
